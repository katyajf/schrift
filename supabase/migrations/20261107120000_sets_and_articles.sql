-- Sets and the "de of het?" drill.
--
-- Sets: every scanned photo or imported PDF (a row in `pages`) gets a name and
-- a lesson date, so its words can be found and practised together later.
--
-- Article cards: nouns get a third card that asks only for de or het.

-- ---------------------------------------------------------------------------
-- Sets

alter table public.pages
  add column title text check (title is null or length(btrim(title)) between 1 and 120),
  add column lesson_date date;

update public.pages
set lesson_date = (created_at at time zone 'Europe/Amsterdam')::date,
    title = case source when 'pdf' then 'Imported PDF' else 'Notebook page' end
where lesson_date is null;

alter table public.pages
  alter column lesson_date set default ((now() at time zone 'Europe/Amsterdam')::date),
  alter column lesson_date set not null;

create index pages_user_lesson_date_idx on public.pages (user_id, lesson_date desc);

-- One row per saved set, for the Sets list.
create view public.set_overview
with (security_invoker = true)
as
select
  p.id,
  p.title,
  p.lesson_date,
  p.source,
  p.created_at,
  count(distinct e.id)::integer as words,
  (count(distinct e.id) filter (where coalesce(ep.times_learned, 0) > 0))::integer as words_learned
from public.pages p
left join public.entries e on e.page_id = p.id
left join public.entry_progress ep on ep.entry_id = e.id
where p.status = 'saved'
group by p.id;

-- ---------------------------------------------------------------------------
-- Article cards

alter table public.cards drop constraint cards_kind_check;
alter table public.cards add constraint cards_kind_check check (kind in ('recognise', 'produce', 'article'));

-- New entries: recognise + produce as before, plus an article card for nouns
-- with a known article. If an entry later stops being one, its article card is
-- suspended rather than deleted, so its history survives.
create or replace function public.create_cards_for_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.cards (user_id, entry_id, kind)
    values (new.user_id, new.id, 'recognise'), (new.user_id, new.id, 'produce')
    on conflict (entry_id, kind) do nothing;
  end if;

  if new.word_type = 'noun' and new.article is not null then
    insert into public.cards (user_id, entry_id, kind)
    values (new.user_id, new.id, 'article')
    on conflict (entry_id, kind) do update set suspended = false;
  else
    update public.cards set suspended = true where entry_id = new.id and kind = 'article';
  end if;
  return new;
end;
$$;

create trigger entries_update_cards after update of word_type, article on public.entries
  for each row execute function public.create_cards_for_entry();

-- Article cards for the nouns you already have.
insert into public.cards (user_id, entry_id, kind, created_at)
select e.user_id, e.id, 'article', e.created_at
from public.entries e
where e.word_type = 'noun' and e.article is not null
on conflict (entry_id, kind) do nothing;

-- Article cards can be introduced straight away, like recognise cards; only
-- the harder English → Dutch card waits until the day after.
create or replace function public.eligible_new_cards()
returns setof public.cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.cards c
  join public.entries e on e.id = c.entry_id
  where c.state = 0
    and not c.suspended
    and (
      c.kind in ('recognise', 'article')
      or exists (
        select 1 from public.cards s
        where s.entry_id = c.entry_id
          and s.kind = 'recognise'
          and s.introduced_at < public.local_day_start(public.user_timezone())
      )
    )
  order by (c.kind = 'produce') desc, e.created_at, c.kind
$$;

-- ---------------------------------------------------------------------------
-- Lessons, optionally limited to one set. Practising a set on purpose isn't
-- held back by the daily new-word limit.

drop function if exists public.lesson_cards(integer);

create or replace function public.lesson_cards(p_size integer default 15, p_page_id uuid default null)
returns setof public.cards
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_day_end timestamptz := public.local_day_start(public.user_timezone()) + interval '1 day';
  v_new_allowance integer := case
    when p_page_id is null then coalesce((select new_count from public.practice_overview()), 0)
    else p_size
  end;
  v_in_set uuid[];
  v_due_total integer;
  v_new_target integer;
  v_refreshers constant integer := 2; -- slots kept free for refreshers
  v_due uuid[];
  v_new uuid[];
  v_refresh uuid[];
begin
  -- Entries this lesson may draw from (null = all of them).
  if p_page_id is not null then
    select coalesce(array_agg(id), '{}') into v_in_set from public.entries where page_id = p_page_id;
  end if;

  select count(*) into v_due_total
  from public.lesson_due_cards(v_day_end) d
  where v_in_set is null or d.entry_id = any (v_in_set);

  -- With a backlog, mostly reviews; otherwise up to 5 new words per lesson.
  v_new_target := least(v_new_allowance, case when v_due_total > p_size then 2 else 5 end);

  select coalesce(array_agg(id), '{}') into v_due from (
    select d.id from public.lesson_due_cards(v_day_end) d
    where v_in_set is null or d.entry_id = any (v_in_set)
    order by d.due
    limit greatest(p_size - v_new_target - v_refreshers, 0)
  ) d;

  -- A few new words, at random, one card each (a new noun has both a
  -- recognise and an article card), never a word already in the lesson.
  select coalesce(array_agg(id), '{}') into v_new from (
    select one_per_word.id from (
      select distinct on (n.entry_id) n.id
      from public.eligible_new_cards() n
      where (v_in_set is null or n.entry_id = any (v_in_set))
        and n.entry_id not in (select x.entry_id from public.cards x where x.id = any (v_due))
      order by n.entry_id, random()
    ) one_per_word
    order by random()
    limit least(v_new_target, greatest(p_size - cardinality(v_due), 0))
  ) n;

  -- Fill the rest with known words that aren't due, one card per word.
  select coalesce(array_agg(id), '{}') into v_refresh from (
    select r.id from (
      select distinct on (c.entry_id) c.id
      from public.cards c
      where not c.suspended
        and c.state = 2
        and c.due >= v_day_end
        and (v_in_set is null or c.entry_id = any (v_in_set))
        and c.entry_id not in (select x.entry_id from public.cards x where x.id = any (v_due || v_new))
      order by c.entry_id, random()
    ) r
    order by random()
    limit greatest(p_size - cardinality(v_due) - cardinality(v_new), 0)
  ) picked;

  -- Not enough known words to fill the lesson: top up with new words,
  -- still within the allowance.
  if cardinality(v_due) + cardinality(v_new) + cardinality(v_refresh) < p_size then
    v_new := v_new || coalesce((
      select array_agg(id) from (
        select one_per_word.id from (
          select distinct on (n.entry_id) n.id
          from public.eligible_new_cards() n
          where (v_in_set is null or n.entry_id = any (v_in_set))
            and n.entry_id not in (select x.entry_id from public.cards x where x.id = any (v_due || v_new || v_refresh))
          order by n.entry_id, random()
        ) one_per_word
        order by random()
        limit greatest(least(
          v_new_allowance - cardinality(v_new),
          p_size - cardinality(v_due) - cardinality(v_new) - cardinality(v_refresh)
        ), 0)
      ) extra
    ), '{}');
  end if;

  return query select c.* from public.cards c where c.id = any (v_due || v_new || v_refresh);
end;
$$;

drop function if exists public.random_new_cards(uuid[], integer);

create or replace function public.random_new_cards(p_exclude uuid[], p_limit integer default 10, p_page_id uuid default null)
returns setof public.cards
language sql
volatile
security invoker
set search_path = ''
as $$
  select c.* from (
    select distinct on (n.entry_id) n.*
    from public.eligible_new_cards() n
    join public.entries e on e.id = n.entry_id
    where n.id <> all (coalesce(p_exclude, '{}'))
      and (p_page_id is null or e.page_id = p_page_id)
    order by n.entry_id, random()
  ) c
  order by random()
  limit p_limit
$$;

-- No longer used by the app (replaced by lesson_cards in the previous migration).
drop function if exists public.session_cards(boolean);

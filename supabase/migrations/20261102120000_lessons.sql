-- Short, varied lessons instead of "everything due, always in the same order".
--
-- A lesson (~15 cards) is built from:
--   1. due reviews, most overdue first (the spacing that makes words stick)
--   2. up to 5 new words (2 when there's a backlog), picked at random
--      rather than in scan order
--   3. random refreshers: words you already know that aren't due yet, so
--      learned words keep turning up now and then (interleaving)
--   4. if that still leaves gaps, more new words within today's allowance
-- Each word appears at most once per lesson.
-- The app then shuffles the lesson so no two days start the same way.

-- Cards still in their short learning steps (1m / 10m) come back when that
-- step is reached, not at the start of the next lesson. Reviews are due for
-- the whole day they fall on.
create or replace function public.lesson_due_cards(p_day_end timestamptz)
returns setof public.cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.* from public.cards c
  where not c.suspended
    and (
      (c.state = 2 and c.due < p_day_end)
      or (c.state in (1, 3) and c.due <= now() + interval '2 minutes')
    )
$$;

create or replace function public.lesson_cards(p_size integer default 15)
returns setof public.cards
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_day_end timestamptz := public.local_day_start(public.user_timezone()) + interval '1 day';
  v_new_allowance integer := coalesce((select new_count from public.practice_overview()), 0);
  v_due_total integer;
  v_new_target integer;
  v_refreshers constant integer := 2; -- slots kept free for refreshers
  v_due uuid[];
  v_new uuid[];
  v_refresh uuid[];
begin
  select count(*) into v_due_total from public.lesson_due_cards(v_day_end);

  -- With a backlog, mostly reviews; otherwise up to 5 new words per lesson.
  v_new_target := least(v_new_allowance, case when v_due_total > p_size then 2 else 5 end);

  select coalesce(array_agg(id), '{}') into v_due from (
    select id from public.lesson_due_cards(v_day_end)
    order by due
    limit greatest(p_size - v_new_target - v_refreshers, 0)
  ) d;

  -- A few new words, at random, never a word that's already in the lesson.
  select coalesce(array_agg(id), '{}') into v_new from (
    select n.id from public.eligible_new_cards() n
    where n.entry_id not in (select x.entry_id from public.cards x where x.id = any (v_due))
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
        and c.entry_id not in (select x.entry_id from public.cards x where x.id = any (v_due || v_new))
      order by c.entry_id, random()
    ) r
    order by random()
    limit greatest(p_size - cardinality(v_due) - cardinality(v_new), 0)
  ) picked;

  -- Not enough known words to fill the lesson: top up with new words,
  -- still within today's allowance.
  if cardinality(v_due) + cardinality(v_new) + cardinality(v_refresh) < p_size then
    v_new := v_new || coalesce((
      select array_agg(id) from (
        select n.id from public.eligible_new_cards() n
        where n.entry_id not in (select x.entry_id from public.cards x where x.id = any (v_due || v_new || v_refresh))
        order by random()
        limit least(
          v_new_allowance - cardinality(v_new),
          p_size - cardinality(v_due) - cardinality(v_new) - cardinality(v_refresh)
        )
      ) extra
    ), '{}');
  end if;

  return query select c.* from public.cards c where c.id = any (v_due || v_new || v_refresh);
end;
$$;

-- "Add new words" at the end of a lesson: random unstudied words beyond
-- today's limit, skipping cards already in this session.
create or replace function public.random_new_cards(p_exclude uuid[], p_limit integer default 10)
returns setof public.cards
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from public.eligible_new_cards() c
  where c.id <> all (coalesce(p_exclude, '{}'))
  order by random()
  limit p_limit
$$;

-- session_cards is replaced by lesson_cards. It's left in place so this
-- migration can go live before the app code that stops using it; drop it later.

-- How often each word has been answered correctly ("Got it", or the old
-- Good/Easy grades), across both directions.
create view public.entry_progress
with (security_invoker = true)
as
select
  c.entry_id,
  (count(l.id) filter (where l.rating >= 3))::integer as times_learned,
  count(l.id)::integer as times_practised,
  max(l.reviewed_at) as last_practised
from public.cards c
left join public.review_logs l on l.card_id = c.id
group by c.entry_id;

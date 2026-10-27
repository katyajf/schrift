-- Phase 2: spaced-repetition cards, review history, and the SQL that builds a
-- daily session. Scheduling maths (FSRS) runs in TypeScript via ts-fsrs; the
-- database stores its state and decides what's due.

-- ---------------------------------------------------------------------------
-- cards: two per entry.
--   recognise: see the Dutch, recall the English (later also listening, gap fill)
--   produce:   see the English, recall the Dutch (later also typing, de/het, verb forms)
-- Columns mirror ts-fsrs's Card. state: 0 new, 1 learning, 2 review, 3 relearning.

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete cascade,
  kind text not null check (kind in ('recognise', 'produce')),
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0 check (state between 0 and 3),
  last_review timestamptz,
  -- First time this card was studied. A word's produce card only becomes
  -- available the day after its recognise card was introduced.
  introduced_at timestamptz,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  unique (entry_id, kind)
);

create index cards_due_idx on public.cards (user_id, due) where not suspended and state <> 0;
create index cards_new_idx on public.cards (user_id, created_at) where not suspended and state = 0;

alter table public.cards enable row level security;
create policy "owner" on public.cards for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Every new entry gets its two cards automatically.
create or replace function public.create_cards_for_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.cards (user_id, entry_id, kind)
  values (new.user_id, new.id, 'recognise'), (new.user_id, new.id, 'produce')
  on conflict (entry_id, kind) do nothing;
  return new;
end;
$$;

create trigger entries_create_cards after insert on public.entries
  for each row execute function public.create_cards_for_entry();

-- Cards for words saved before this migration.
insert into public.cards (user_id, entry_id, kind, created_at)
select e.user_id, e.id, k.kind, e.created_at
from public.entries e
cross join (values ('recognise'), ('produce')) as k(kind)
on conflict (entry_id, kind) do nothing;

-- ---------------------------------------------------------------------------
-- review_logs: one row per answer. The FSRS columns are the card's state
-- *before* the review (ts-fsrs's ReviewLog), so history can be replayed.

create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  state smallint not null,
  due timestamptz not null,
  stability double precision not null,
  difficulty double precision not null,
  elapsed_days integer not null,
  last_elapsed_days integer not null,
  scheduled_days integer not null,
  learning_steps integer not null default 0,
  reviewed_at timestamptz not null default now(),
  exercise text not null default 'flashcard',
  duration_ms integer,
  answer text,
  correct boolean
);

create index review_logs_user_time_idx on public.review_logs (user_id, reviewed_at desc);
create index review_logs_card_idx on public.review_logs (card_id, reviewed_at desc);

alter table public.review_logs enable row level security;
create policy "owner" on public.review_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Save one answer: update the card and log the review together.
-- p_expected_reps guards against a double tap grading the same card twice.

create or replace function public.record_review(
  p_card_id uuid,
  p_expected_reps integer,
  p_card jsonb,
  p_log jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.cards set
    due = (p_card->>'due')::timestamptz,
    stability = (p_card->>'stability')::double precision,
    difficulty = (p_card->>'difficulty')::double precision,
    elapsed_days = (p_card->>'elapsed_days')::integer,
    scheduled_days = (p_card->>'scheduled_days')::integer,
    learning_steps = (p_card->>'learning_steps')::integer,
    reps = (p_card->>'reps')::integer,
    lapses = (p_card->>'lapses')::integer,
    state = (p_card->>'state')::smallint,
    last_review = (p_card->>'last_review')::timestamptz,
    introduced_at = coalesce(introduced_at, (p_log->>'reviewed_at')::timestamptz)
  where id = p_card_id and reps = p_expected_reps;

  if not found then
    raise exception 'card % was already graded or does not exist', p_card_id using errcode = 'P0002';
  end if;

  insert into public.review_logs (
    card_id, rating, state, due, stability, difficulty, elapsed_days,
    last_elapsed_days, scheduled_days, learning_steps, reviewed_at,
    exercise, duration_ms, answer, correct
  ) values (
    p_card_id,
    (p_log->>'rating')::smallint,
    (p_log->>'state')::smallint,
    (p_log->>'due')::timestamptz,
    (p_log->>'stability')::double precision,
    (p_log->>'difficulty')::double precision,
    (p_log->>'elapsed_days')::integer,
    (p_log->>'last_elapsed_days')::integer,
    (p_log->>'scheduled_days')::integer,
    coalesce((p_log->>'learning_steps')::integer, 0),
    (p_log->>'reviewed_at')::timestamptz,
    coalesce(p_log->>'exercise', 'flashcard'),
    (p_log->>'duration_ms')::integer,
    p_log->>'answer',
    (p_log->>'correct')::boolean
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- "Today" is a calendar day in your timezone (user_settings.timezone).

create or replace function public.local_day_start(p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone p_tz) at time zone p_tz
$$;

create or replace function public.user_timezone()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select timezone from public.user_settings limit 1), 'Europe/Amsterdam')
$$;

-- New cards that may be introduced: every new recognise card, and new produce
-- cards whose recognise sibling was first studied before today.
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
      c.kind = 'recognise'
      or exists (
        select 1 from public.cards s
        where s.entry_id = c.entry_id
          and s.kind = 'recognise'
          and s.introduced_at < public.local_day_start(public.user_timezone())
      )
    )
  -- Words you met earlier get their produce card first; then new words in the
  -- order you wrote them down.
  order by (c.kind = 'produce') desc, e.created_at, c.kind
$$;

-- Numbers for the Today screen.
create or replace function public.practice_overview()
returns table (
  due_count integer,
  new_count integer,
  new_today integer,
  reviews_today integer,
  streak integer,
  studied_today boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  tz as (select public.user_timezone() as name),
  bounds as (
    select public.local_day_start(tz.name) as day_start,
           public.local_day_start(tz.name) + interval '1 day' as day_end,
           (now() at time zone tz.name)::date as today
    from tz
  ),
  lim as (
    select coalesce((select new_cards_per_day from public.user_settings limit 1), 10) as n
  ),
  today_logs as (
    select l.* from public.review_logs l, bounds b where l.reviewed_at >= b.day_start
  ),
  days as (
    select distinct (l.reviewed_at at time zone tz.name)::date as d
    from public.review_logs l, tz
  ),
  -- The streak counts back from today if you've studied today, else from yesterday.
  anchor as (
    select case when exists (select 1 from days, bounds where d = bounds.today)
                then bounds.today else bounds.today - 1 end as d
    from bounds
  ),
  ranked as (
    select (anchor.d - days.d) as gap, row_number() over (order by days.d desc) - 1 as rn
    from days, anchor
    where days.d <= anchor.d
  )
  select
    (select count(*)::integer from public.cards c, bounds b
      where not c.suspended and c.state <> 0 and c.due < b.day_end),
    greatest(0, least(
      (select n from lim) - (select count(distinct card_id)::integer from today_logs where state = 0),
      (select count(*)::integer from public.eligible_new_cards())
    )),
    (select count(distinct card_id)::integer from today_logs where state = 0),
    (select count(*)::integer from today_logs),
    (select count(*)::integer from ranked where gap = rn),
    exists (select 1 from today_logs)
$$;

-- The cards for one session: everything due by the end of today, plus today's
-- remaining new cards. With p_free, cards that aren't due yet instead (for
-- extra practice when nothing is due).
create or replace function public.session_cards(p_free boolean default false)
returns setof public.cards
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_day_end timestamptz := public.local_day_start(public.user_timezone()) + interval '1 day';
  v_new integer := (select new_count from public.practice_overview());
begin
  if p_free then
    return query
      select c.* from public.cards c
      where not c.suspended and c.state <> 0 and c.due >= v_day_end
      order by c.due
      limit 20;
    if not found then
      return query select * from public.eligible_new_cards() limit 10;
    end if;
    return;
  end if;

  return query
    select c.* from public.cards c
    where not c.suspended and c.state <> 0 and c.due < v_day_end
    order by c.due
    limit 200;
  return query select * from public.eligible_new_cards() limit v_new;
end;
$$;

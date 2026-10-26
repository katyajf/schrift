-- Phase 1: pages (scanned notebook photos), entries (words), example sentences, tags, settings.
-- Every table carries user_id and is locked to its owner with RLS.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() is only STABLE, so it can't be used in a generated column or index directly.
-- Pinning the dictionary makes it safe to declare IMMUTABLE.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

-- Lowercase, accents stripped, leading article removed: "Het Café" -> "cafe".
-- Mirrored in src/lib/dutch.ts (dutchKey) so client and DB agree.
create or replace function public.dutch_key(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select lower(public.immutable_unaccent(
    regexp_replace(btrim($1), '^(de|het|een|''t)\s+', '', 'i')
  ))
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_settings: one row per user, created lazily by the app on first save.
-- Voice and theme are per-device, so they live in localStorage instead.

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  new_cards_per_day integer not null default 10 check (new_cards_per_day between 0 and 100),
  timezone text not null default 'Europe/Amsterdam',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pages: one row per photographed notebook page (or, later, imported PDF).
-- `extraction` holds the raw AI result plus duplicate matches, so an unfinished
-- review survives closing the app.

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null,
  source text not null default 'photo' check (source in ('photo', 'pdf')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'extracting', 'review', 'saved', 'failed')),
  extraction jsonb,
  model text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pages_user_created_idx on public.pages (user_id, created_at desc);

create trigger pages_updated_at before update on public.pages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- entries: the words and phrases themselves.
-- `field_sources` maps a field name to 'ai' when the value was generated rather than
-- written by hand, e.g. {"plural": "ai", "article": "ai"}. Absent = written by you.

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_id uuid references public.pages (id) on delete set null,
  dutch text not null check (length(btrim(dutch)) > 0),
  english text not null default '',
  article text check (article in ('de', 'het')),
  word_type text not null default 'other' check (word_type in (
    'noun', 'verb', 'adjective', 'adverb', 'phrase', 'preposition',
    'conjunction', 'pronoun', 'numeral', 'interjection', 'other'
  )),
  plural text,
  past_singular text,
  past_plural text,
  past_participle text,
  auxiliary text check (auxiliary in ('hebben', 'zijn', 'hebben/zijn')),
  notes text,
  field_sources jsonb not null default '{}'::jsonb,
  dutch_key text generated always as (public.dutch_key(dutch)) stored,
  search_text text generated always as (
    lower(public.immutable_unaccent(dutch || ' ' || english || ' ' || coalesce(plural, '')))
  ) stored,
  enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entries_user_created_idx on public.entries (user_id, created_at desc);
create index entries_user_key_idx on public.entries (user_id, dutch_key);
create index entries_page_idx on public.entries (page_id);
create index entries_search_trgm_idx on public.entries using gin (search_text extensions.gin_trgm_ops);
create index entries_key_trgm_idx on public.entries using gin (dutch_key extensions.gin_trgm_ops);

create trigger entries_updated_at before update on public.entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- example_sentences: from the notebook, from the tutor, or AI-generated (Phase 3).

create table public.example_sentences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete cascade,
  dutch text not null check (length(btrim(dutch)) > 0),
  english text,
  source text not null default 'notebook' check (source in ('notebook', 'tutor', 'ai')),
  audio_path text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index example_sentences_entry_idx on public.example_sentences (entry_id, position);

-- ---------------------------------------------------------------------------
-- tags

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create unique index tags_user_name_idx on public.tags (user_id, lower(name));

create table public.entry_tags (
  entry_id uuid not null references public.entries (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (entry_id, tag_id)
);

create index entry_tags_tag_idx on public.entry_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: owner-only on every table.
-- `(select auth.uid())` is evaluated once per query instead of once per row.

alter table public.user_settings enable row level security;
alter table public.pages enable row level security;
alter table public.entries enable row level security;
alter table public.example_sentences enable row level security;
alter table public.tags enable row level security;
alter table public.entry_tags enable row level security;

create policy "owner" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.pages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.example_sentences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.entry_tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Duplicate detection: for each candidate key, return saved entries with the same
-- key or a close one (typos, missing accents). Runs as the caller, so RLS applies.

create or replace function public.match_existing_entries(p_keys text[])
returns table (
  input_key text,
  entry_id uuid,
  dutch text,
  english text,
  article text,
  similarity real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select k.key, e.id, e.dutch, e.english, e.article,
         extensions.similarity(e.dutch_key, k.key)
  from unnest(p_keys) as k(key)
  join public.entries e
    on e.dutch_key = k.key
    or (length(k.key) >= 4 and extensions.similarity(e.dutch_key, k.key) >= 0.6)
  order by k.key, extensions.similarity(e.dutch_key, k.key) desc
$$;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for page photos (and later audio).
-- Objects live under "<user id>/...", and only that user can touch them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pages', 'pages', false, 15728640,
  array['image/jpeg', 'image/webp', 'image/png', 'application/pdf']
)
on conflict (id) do nothing;

create policy "pages: owner can read" on storage.objects for select to authenticated
  using (bucket_id = 'pages' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pages: owner can upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'pages' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pages: owner can update" on storage.objects for update to authenticated
  using (bucket_id = 'pages' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pages: owner can delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pages' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- "Save all" from the review screen, in one transaction so a dropped connection
-- can't leave a page half-saved. Each element of p_entries is either a new entry
-- or, with merge_into set, extra information for an entry you already have:
-- empty fields are filled, a different English meaning is appended, and new
-- example sentences are added. Runs as the caller, so RLS still applies.

create or replace function public.save_page_entries(p_page_id uuid, p_entries jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e jsonb;
  ex jsonb;
  v_id uuid;
  v_pos integer;
  v_count integer := 0;
begin
  if not exists (select 1 from public.pages where id = p_page_id) then
    raise exception 'page % not found', p_page_id;
  end if;

  for e in select value from jsonb_array_elements(p_entries) loop
    if nullif(e->>'merge_into', '') is not null then
      v_id := (e->>'merge_into')::uuid;

      update public.entries t set
        english = case
          when btrim(t.english) = '' then coalesce(e->>'english', '')
          when coalesce(e->>'english', '') = '' then t.english
          when position(lower(e->>'english') in lower(t.english)) > 0 then t.english
          else t.english || '; ' || (e->>'english')
        end,
        article = coalesce(t.article, nullif(e->>'article', '')),
        plural = coalesce(t.plural, nullif(e->>'plural', '')),
        past_singular = coalesce(t.past_singular, nullif(e->>'past_singular', '')),
        past_plural = coalesce(t.past_plural, nullif(e->>'past_plural', '')),
        past_participle = coalesce(t.past_participle, nullif(e->>'past_participle', '')),
        auxiliary = coalesce(t.auxiliary, nullif(e->>'auxiliary', '')),
        -- Only take the AI marker for fields this merge actually fills.
        field_sources = t.field_sources || coalesce((
          select jsonb_object_agg(s.key, s.value)
          from jsonb_each(coalesce(e->'field_sources', '{}'::jsonb)) s
          where s.key <> 'english' and coalesce(to_jsonb(t)->>s.key, '') = ''
        ), '{}'::jsonb)
      where t.id = v_id;

      if not found then
        raise exception 'entry % not found', v_id;
      end if;
    else
      insert into public.entries (
        page_id, dutch, english, article, word_type, plural,
        past_singular, past_plural, past_participle, auxiliary, field_sources
      ) values (
        p_page_id,
        btrim(e->>'dutch'),
        coalesce(btrim(e->>'english'), ''),
        nullif(e->>'article', ''),
        coalesce(nullif(e->>'word_type', ''), 'other'),
        nullif(btrim(e->>'plural'), ''),
        nullif(btrim(e->>'past_singular'), ''),
        nullif(btrim(e->>'past_plural'), ''),
        nullif(btrim(e->>'past_participle'), ''),
        nullif(e->>'auxiliary', ''),
        coalesce(e->'field_sources', '{}'::jsonb)
      )
      returning id into v_id;
    end if;

    select coalesce(max(position) + 1, 0) into v_pos
    from public.example_sentences where entry_id = v_id;

    for ex in select value from jsonb_array_elements(coalesce(e->'examples', '[]'::jsonb)) loop
      if nullif(btrim(ex->>'dutch'), '') is not null and not exists (
        select 1 from public.example_sentences s
        where s.entry_id = v_id and lower(s.dutch) = lower(btrim(ex->>'dutch'))
      ) then
        insert into public.example_sentences (entry_id, dutch, english, source, position)
        values (v_id, btrim(ex->>'dutch'), nullif(btrim(ex->>'english'), ''), 'notebook', v_pos);
        v_pos := v_pos + 1;
      end if;
    end loop;

    v_count := v_count + 1;
  end loop;

  update public.pages set status = 'saved' where id = p_page_id;
  return v_count;
end;
$$;

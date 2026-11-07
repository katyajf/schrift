// Turns a typed-up word list (see scripts/lidwoorden.json) into SQL that
// creates one set with its words, tags and notes, without going through Gemini.
//
//   node scripts/import-set.mjs scripts/lidwoorden.json > /tmp/import.sql
//   npx supabase db query --remote -f /tmp/import.sql
//
// It runs as one transaction. Words you already have (same dutch_key) are not
// duplicated: they keep their set, get the tags, and have an empty plural filled.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/import-set.mjs <list.json> [page-id]");
const data = JSON.parse(readFileSync(file, "utf8"));
const pageId = process.argv[3] ?? randomUUID();

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const tags = [...new Set(data.entries.flatMap((e) => e.tags ?? []))];

const lines = [];
lines.push("begin;");
lines.push(`create temp table import_ctx on commit drop as
  select (select user_id from public.pages order by created_at limit 1) as user_id, ${q(pageId)}::uuid as page_id;`);
lines.push(`insert into public.pages (id, user_id, storage_path, source, status, title, lesson_date)
  select page_id, user_id, user_id || '/' || page_id || '.pdf', 'pdf', 'saved', ${q(data.set.title)}, ${q(data.set.lesson_date)}::date
  from import_ctx;`);

for (const e of data.entries) {
  const sources = Object.fromEntries((e.ai ?? []).map((f) => [f, "ai"]));
  lines.push(`insert into public.entries (user_id, page_id, dutch, english, article, word_type, plural, notes, field_sources)
  select c.user_id, c.page_id, ${q(e.dutch)}, ${q(e.english)}, ${q(e.article)}, ${q(e.word_type ?? "noun")}, ${q(e.plural)}, ${q(e.notes)}, ${q(JSON.stringify(sources))}::jsonb
  from import_ctx c
  where not exists (select 1 from public.entries x where x.user_id = c.user_id and x.dutch_key = public.dutch_key(${q(e.dutch)}));`);
  if (e.plural) {
    lines.push(`update public.entries x set plural = ${q(e.plural)} from import_ctx c
  where x.user_id = c.user_id and x.dutch_key = public.dutch_key(${q(e.dutch)}) and x.plural is null;`);
  }
}

for (const tag of tags) {
  lines.push(`insert into public.tags (user_id, name) select user_id, ${q(tag)} from import_ctx c
  where not exists (select 1 from public.tags t where t.user_id = c.user_id and lower(t.name) = lower(${q(tag)}));`);
}
for (const e of data.entries) {
  for (const tag of e.tags ?? []) {
    lines.push(`insert into public.entry_tags (entry_id, tag_id, user_id)
  select x.id, t.id, c.user_id from import_ctx c
  join public.entries x on x.user_id = c.user_id and x.dutch_key = public.dutch_key(${q(e.dutch)})
  join public.tags t on t.user_id = c.user_id and lower(t.name) = lower(${q(tag)})
  on conflict do nothing;`);
  }
}
lines.push("commit;");
console.log(`-- set ${pageId}: ${data.set.title}`);
console.log(lines.join("\n"));

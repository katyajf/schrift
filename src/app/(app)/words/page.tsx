import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { normalizeForSearch } from "@/lib/dutch";
import { WORD_TYPES } from "@/lib/entry-schema";
import type { WordType } from "@/lib/database.types";
import { DutchTerm } from "@/components/dutch-term";
import { PlayButton } from "@/components/play-button";
import { WordsToolbar, WordsToolbarSkeleton, type WordFilters } from "./words-toolbar";


export const metadata = { title: "Words" };

type SearchParams = PageProps<"/words">["searchParams"];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

// Request-time data fetch, so reading the clock here is intended.
function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function parseFilters(sp: Awaited<SearchParams>): WordFilters {
  const type = one(sp.type);
  const added = one(sp.added);
  return {
    q: one(sp.q) ?? "",
    type: WORD_TYPES.includes(type as WordType) ? (type as WordType) : null,
    tag: one(sp.tag) ?? null,
    added: added === "7" || added === "30" ? added : null,
    page: one(sp.page) ?? null,
  };
}

export default function WordsPage({ searchParams }: PageProps<"/words">) {
  return (
    <main className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 bg-paper/95 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <Suspense fallback={<WordsToolbarSkeleton />}>
          <Toolbar />
        </Suspense>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <WordList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Doesn't read searchParams, so typing in the search box never remounts it.
async function Toolbar() {
  const { supabase } = await requireUser();
  const { data: tags } = await supabase.from("tags").select("id, name").order("name");
  return <WordsToolbar tags={tags ?? []} />;
}

async function WordList({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(await searchParams);
  const { supabase } = await requireUser();

  let query = filters.tag
    ? supabase
        .from("entries")
        .select("id, dutch, english, article, entry_tags!inner(tag_id)", { count: "exact" })
        .eq("entry_tags.tag_id", filters.tag)
    : supabase.from("entries").select("id, dutch, english, article", { count: "exact" });

  if (filters.q.trim()) {
    const term = normalizeForSearch(filters.q).replace(/[%_\\]/g, (c) => `\\${c}`);
    query = query.ilike("search_text", `%${term}%`);
  }
  if (filters.type) query = query.eq("word_type", filters.type);
  if (filters.page) query = query.eq("page_id", filters.page);
  if (filters.added) {
    query = query.gte("created_at", daysAgo(Number(filters.added)));
  }

  const { data: entries, count, error } = await query.order("created_at", { ascending: false }).limit(300);

  if (error) {
    return <p className="px-5 pt-6 text-danger">Couldn&rsquo;t load your words.</p>;
  }

  const filtered = filters.q || filters.type || filters.tag || filters.added || filters.page;

  if (!entries?.length) {
    return (
      <div className="flex flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">{filtered ? "No words match." : "Scan a notebook page to add your first words."}</p>
        {!filtered && (
          <Link href="/scan" className="btn-secondary">
            Scan a page
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="px-5 pb-1 text-xs text-muted">
        {count} {count === 1 ? "word" : "words"}
      </p>
      <ul className="divide-y divide-line px-2">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center">
            <Link href={`/words/${e.id}`} className="min-w-0 flex-1 rounded-xl px-3 py-3 active:bg-sunken">
              <DutchTerm dutch={e.dutch} article={e.article} className="block truncate text-xl" />
              <span className="block truncate text-sm text-muted">{e.english}</span>
            </Link>
            <PlayButton text={e.article ? `${e.article} ${e.dutch}` : e.dutch} className="mr-1" />
          </li>
        ))}
      </ul>
    </>
  );
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-5 px-5 pt-4" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex flex-col gap-2">
          <span className="h-5 w-40 rounded bg-sunken" />
          <span className="h-3.5 w-24 rounded bg-sunken" />
        </li>
      ))}
    </ul>
  );
}

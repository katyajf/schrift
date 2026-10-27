import Link from "next/link";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import type { CardRow } from "@/lib/database.types";
import { Session, type SessionItem } from "./session";

export const metadata = { title: "Practice" };

export default function PracticePage({ searchParams }: PageProps<"/practice">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-muted">
          <Loader2 className="size-6 animate-spin" aria-label="Loading" />
        </div>
      }
    >
      <SessionLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function SessionLoader({ searchParams }: Pick<PageProps<"/practice">, "searchParams">) {
  const free = (await searchParams).free === "1";
  const { supabase } = await requireUser();

  const [{ data: cards }, { data: overview }] = await Promise.all([
    supabase.rpc("session_cards", { p_free: free }),
    supabase.rpc("practice_overview"),
  ]);

  if (!cards?.length) {
    return (
      <main className="flex flex-1 flex-col justify-end gap-4 px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="font-dutch text-3xl">Nothing to practise</h1>
        <p className="text-muted">Scan more pages to add words, or come back when cards are due.</p>
        <Link href="/" className="btn-primary">
          Back to Today
        </Link>
      </main>
    );
  }

  const entryIds = [...new Set(cards.map((c) => c.entry_id))];
  const [{ data: entries }, { data: examples }] = await Promise.all([
    supabase
      .from("entries")
      .select("id, dutch, english, article, word_type, plural, past_singular, past_plural, past_participle, auxiliary")
      .in("id", entryIds),
    supabase
      .from("example_sentences")
      .select("entry_id, dutch, english, source, position")
      .in("entry_id", entryIds)
      .order("position"),
  ]);

  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));
  const exampleByEntry = new Map<string, { dutch: string; english: string | null; ai: boolean }>();
  for (const ex of examples ?? []) {
    if (!exampleByEntry.has(ex.entry_id)) {
      exampleByEntry.set(ex.entry_id, { dutch: ex.dutch, english: ex.english, ai: ex.source === "ai" });
    }
  }

  const toItem = (card: CardRow): SessionItem | null => {
    const entry = entryById.get(card.entry_id);
    if (!entry) return null;
    return {
      card: {
        id: card.id,
        kind: card.kind,
        due: card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        learning_steps: card.learning_steps,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        last_review: card.last_review,
      },
      entry,
      example: exampleByEntry.get(card.entry_id) ?? null,
    };
  };

  const items = cards.map(toItem).filter((i): i is SessionItem => i !== null);
  const o = overview?.[0];

  return <Session items={interleave(items)} streak={o?.streak ?? 0} studiedToday={o?.studied_today ?? false} />;
}

// Spread new cards through the reviews (one after every three) so a session
// doesn't end with a block of unfamiliar words.
function interleave(items: SessionItem[]) {
  const reviews = items.filter((i) => i.card.state !== 0);
  const fresh = items.filter((i) => i.card.state === 0);
  const out: SessionItem[] = [];
  while (reviews.length || fresh.length) {
    out.push(...reviews.splice(0, 3));
    if (fresh.length) out.push(fresh.shift()!);
  }
  return out;
}

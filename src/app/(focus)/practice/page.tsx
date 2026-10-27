import Link from "next/link";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Session, type SessionItem } from "./session";
import { toSessionItems } from "./load-items";

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

  const items = await toSessionItems(supabase, cards);
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

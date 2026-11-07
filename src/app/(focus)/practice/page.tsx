import Link from "next/link";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Session } from "./session";
import { loadLessonItems } from "./load-items";

export const metadata = { title: "Practice" };

// /practice for the daily lesson, /practice?set=<id> to practise one set.
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
  const { set } = await searchParams;
  const setId = typeof set === "string" && /^[0-9a-f-]{36}$/.test(set) ? set : null;
  const { supabase } = await requireUser();
  const [items, { data: overview }, { data: setRow }] = await Promise.all([
    loadLessonItems(supabase, setId),
    supabase.rpc("practice_overview"),
    setId ? supabase.from("pages").select("title").eq("id", setId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (!items.length) {
    return (
      <main className="flex flex-1 flex-col justify-end gap-4 px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="font-dutch text-3xl">Nothing to practise{setRow?.title ? ` in ${setRow.title}` : ""}</h1>
        <p className="text-muted">Scan more pages to add words, or come back when cards are due.</p>
        <Link href="/" className="btn-primary">
          Back to Today
        </Link>
      </main>
    );
  }

  const o = overview?.[0];
  return <Session items={items} streak={o?.streak ?? 0} studiedToday={o?.studied_today ?? false} setId={setId} />;
}

import Link from "next/link";
import { Suspense } from "react";
import { Camera, ChevronRight, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatLessonDate } from "@/lib/dates";
import { LibraryTabs } from "../library-tabs";

export const metadata = { title: "Sets" };

export default function SetsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 bg-paper/95 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-1 backdrop-blur">
        <LibraryTabs active="sets" />
      </div>
      <Suspense fallback={<p className="px-5 pt-4 text-muted">Loading sets…</p>}>
        <SetList />
      </Suspense>
    </main>
  );
}

async function SetList() {
  const { supabase } = await requireUser();
  const { data: sets, error } = await supabase
    .from("set_overview")
    .select("*")
    .order("lesson_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return <p className="px-5 pt-6 text-danger">Couldn&rsquo;t load your sets.</p>;
  if (!sets?.length) {
    return (
      <div className="flex flex-col items-center gap-4 px-5 pt-16 text-center">
        <p className="text-muted">Every photo or PDF you scan becomes a named, dated set here.</p>
        <Link href="/scan" className="btn-secondary">
          Scan a page
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 px-5 pt-2 pb-6">
      {sets.map((set) => {
        const Icon = set.source === "pdf" ? FileText : Camera;
        const pct = set.words ? Math.round((set.words_learned / set.words) * 100) : 0;
        return (
          <li key={set.id}>
            <Link href={`/words/sets/${set.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 active:bg-sunken">
              <Icon className="size-5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-dutch text-lg">{set.title ?? "Untitled set"}</p>
                <p className="text-xs text-muted">
                  {formatLessonDate(set.lesson_date)} · {set.words} {set.words === 1 ? "word" : "words"} · {set.words_learned} learned
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

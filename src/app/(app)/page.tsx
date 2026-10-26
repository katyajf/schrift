import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { Greeting } from "./greeting";

export default function TodayPage() {
  return (
    <main className="flex flex-1 flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))]">
      <Greeting />
      <div className="flex-1" />
      <Suspense fallback={<Stats words={null} toReview={null} />}>
        <TodayStats />
      </Suspense>
    </main>
  );
}

async function TodayStats() {
  const { supabase } = await requireUser();
  const [{ count: words }, { count: toReview }] = await Promise.all([
    supabase.from("entries").select("*", { count: "exact", head: true }),
    supabase.from("pages").select("*", { count: "exact", head: true }).eq("status", "review"),
  ]);
  return <Stats words={words ?? 0} toReview={toReview ?? 0} />;
}

function Stats({ words, toReview }: { words: number | null; toReview: number | null }) {
  return (
    <div className="flex flex-col gap-6 pb-6">
      <div className="flex gap-8">
        <Stat value={words} label={words === 1 ? "word" : "words"} />
        <Stat value={toReview} label={toReview === 1 ? "page to review" : "pages to review"} />
      </div>
      <p className="text-sm text-muted">Daily practice with spaced repetition arrives in the next update.</p>
      {toReview ? (
        <Link href="/scan" className="btn-primary">
          Review scanned pages
        </Link>
      ) : (
        <Link href="/scan" className="btn-primary">
          Scan a page
        </Link>
      )}
      <Link href="/words" className="btn-secondary">
        Browse words
      </Link>
    </div>
  );
}

function Stat({ value, label }: { value: number | null; label: string }) {
  return (
    <div>
      <div className="text-4xl tabular-nums">{value ?? <span className="text-line-strong">–</span>}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

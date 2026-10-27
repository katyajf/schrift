import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { Greeting } from "./greeting";

export default function TodayPage() {
  return (
    <main className="flex flex-1 flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))]">
      <Greeting />
      <div className="flex-1" />
      <Suspense fallback={<TodayPanel data={null} />}>
        <TodayData />
      </Suspense>
    </main>
  );
}

type TodayData = {
  due: number;
  fresh: number;
  streak: number;
  studiedToday: boolean;
  words: number;
  pagesToReview: number;
};

async function TodayData() {
  const { supabase } = await requireUser();
  const [{ data: overview }, { count: words }, { count: pagesToReview }] = await Promise.all([
    supabase.rpc("practice_overview"),
    supabase.from("entries").select("*", { count: "exact", head: true }),
    supabase.from("pages").select("*", { count: "exact", head: true }).eq("status", "review"),
  ]);
  const o = overview?.[0];
  return (
    <TodayPanel
      data={{
        due: o?.due_count ?? 0,
        fresh: o?.new_count ?? 0,
        streak: o?.streak ?? 0,
        studiedToday: o?.studied_today ?? false,
        words: words ?? 0,
        pagesToReview: pagesToReview ?? 0,
      }}
    />
  );
}

function TodayPanel({ data }: { data: TodayData | null }) {
  const total = data ? data.due + data.fresh : 0;
  // Rough guide: ~8s for a review, ~20s for a new card.
  const minutes = data ? Math.max(1, Math.round((data.due * 8 + data.fresh * 20) / 60)) : 0;

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div className="flex gap-8">
        <Stat value={data?.due} label="due" />
        <Stat value={data?.fresh} label="new" />
        <Stat value={data?.streak} label="day streak" />
      </div>

      {data && data.pagesToReview > 0 && (
        <Link href="/scan" className="text-sm text-accent">
          {data.pagesToReview} scanned {data.pagesToReview === 1 ? "page is" : "pages are"} waiting for review
        </Link>
      )}

      {!data ? (
        <div className="btn-primary opacity-60">Start session</div>
      ) : data.words === 0 ? (
        <>
          <p className="text-muted">Scan a notebook page to add your first words.</p>
          <Link href="/scan" className="btn-primary">
            Scan a page
          </Link>
        </>
      ) : total > 0 ? (
        <>
          <p className="text-sm text-muted">About {minutes} {minutes === 1 ? "minute" : "minutes"}</p>
          <Link href="/practice" className="btn-primary">
            Start session
          </Link>
        </>
      ) : (
        <>
          <p className="text-muted">
            {data.studiedToday ? "Klaar voor vandaag. Nothing else is due." : "Nothing is due right now."}
          </p>
          <Link href="/practice?free=1" className="btn-secondary">
            Practice anyway
          </Link>
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div>
      <div className="text-4xl tabular-nums">{value ?? <span className="text-line-strong">–</span>}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

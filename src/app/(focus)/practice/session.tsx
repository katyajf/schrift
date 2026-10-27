"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { AiBadge, DutchTerm } from "@/components/dutch-term";
import { PlayButton } from "@/components/play-button";
import { formatInterval, fromFsrsCard, GRADES, Rating, scheduler, toFsrsCard, type CardFields, type Grade } from "@/lib/fsrs";
import type { Article, Auxiliary, WordType } from "@/lib/database.types";
import { gradeCard } from "./actions";

export type SessionItem = {
  card: CardFields & { id: string; kind: "recognise" | "produce" };
  entry: {
    id: string;
    dutch: string;
    english: string;
    article: Article | null;
    word_type: WordType;
    plural: string | null;
    past_singular: string | null;
    past_plural: string | null;
    past_participle: string | null;
    auxiliary: Auxiliary | null;
  };
  example: { dutch: string; english: string | null; ai: boolean } | null;
};

type GradeInput = { cardId: string; rating: Grade; expectedReps: number; durationMs: number | null };

// Cards whose next step is within this window come back later in the same session.
const REQUEUE_WITHIN_MS = 60 * 60_000;
const REQUEUE_GAP = 4;

export function Session({ items, streak, studiedToday }: { items: SessionItem[]; streak: number; studiedToday: boolean }) {
  const [queue, setQueue] = useState(items);
  const [revealed, setRevealed] = useState(false);
  const [phase, setPhase] = useState<"cards" | "saving" | "summary">("cards");
  const [finished, setFinished] = useState(0);
  const [stats, setStats] = useState({ answers: 0, again: 0, newWords: new Set<string>() });
  const [saveFailed, setSaveFailed] = useState(0);
  const [minutes, setMinutes] = useState(1);
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const failed = useRef<GradeInput[]>([]);
  const total = items.length;
  const current = queue[0];

  useEffect(() => {
    const now = Date.now();
    startedAt.current ||= now;
    shownAt.current = now;
  }, [current]);

  // Answers are saved one at a time, in order, without blocking the next card.
  const save = useCallback((input: GradeInput) => {
    saveChain.current = saveChain.current.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await gradeCard(input);
          if (result.ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
      failed.current.push(input);
      setSaveFailed(failed.current.length);
    });
  }, []);

  function retryFailed() {
    const toRetry = failed.current.splice(0);
    setSaveFailed(0);
    toRetry.forEach(save);
  }

  // Interval shown under each button, from the same scheduler the server uses.
  // Only computed once the answer is shown, so the server render never reads the clock.
  const previews = useMemo(() => {
    if (!current || !revealed) return null;
    const now = new Date();
    const preview = scheduler.repeat(toFsrsCard(current.card), now);
    return Object.fromEntries(GRADES.map((g) => [g.rating, formatInterval(now, preview[g.rating].card.due)])) as Record<Grade, string>;
  }, [current, revealed]);

  const grade = useCallback(
    (rating: Grade) => {
      if (!current || !revealed) return;
      const now = new Date();
      const next = scheduler.next(toFsrsCard(current.card), now, rating).card;

      save({
        cardId: current.card.id,
        rating,
        expectedReps: current.card.reps,
        durationMs: Math.round(now.getTime() - shownAt.current),
      });

      setStats((s) => ({
        answers: s.answers + 1,
        again: s.again + (rating === Rating.Again ? 1 : 0),
        newWords: current.card.state === 0 ? new Set(s.newWords).add(current.entry.id) : s.newWords,
      }));

      const rest = queue.slice(1);
      if (next.due.getTime() - now.getTime() < REQUEUE_WITHIN_MS) {
        const again = { ...current, card: { ...current.card, ...fromFsrsCard(next) } };
        rest.splice(Math.min(REQUEUE_GAP, rest.length), 0, again);
      } else {
        setFinished((f) => f + 1);
      }

      setRevealed(false);
      setQueue(rest);
      if (rest.length === 0) {
        setMinutes(Math.max(1, Math.round((now.getTime() - startedAt.current) / 60_000)));
        setPhase("saving");
        saveChain.current.then(() => setPhase("summary"));
      }
    },
    [current, revealed, queue, save],
  );

  // Space/Enter to reveal, 1–4 to grade (for a laptop keyboard).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== "cards") return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        grade(Number(e.key) as Grade);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, revealed, grade]);

  if (phase !== "cards") {
    return (
      <Summary
        saving={phase === "saving"}
        answers={stats.answers}
        again={stats.again}
        newWords={stats.newWords.size}
        minutes={minutes}
        streak={studiedToday ? streak : streak + 1}
        saveFailed={saveFailed}
        onRetry={retryFailed}
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="h-[3px] overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(finished / total) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between pt-1 text-xs text-muted">
          <span className="tabular-nums">
            {finished} / {total}
          </span>
          <Link href="/" className="-mr-2 flex size-10 items-center justify-center" aria-label="End session">
            <X className="size-5" aria-hidden />
          </Link>
        </div>
        {saveFailed > 0 && (
          <button onClick={retryFailed} className="mt-1 w-full rounded-lg bg-warn-soft px-3 py-2 text-left text-sm">
            {saveFailed} {saveFailed === 1 ? "answer wasn't" : "answers weren't"} saved. Tap to retry.
          </button>
        )}
      </header>

      <CardFace key={`${current.card.id}-${current.card.reps}`} item={current} revealed={revealed} />

      <div className="sticky bottom-0 bg-paper px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {revealed ? (
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <button
                key={g.rating}
                onClick={() => grade(g.rating)}
                className={`flex min-h-16 flex-col items-center justify-center rounded-2xl border bg-card active:bg-sunken ${
                  g.rating === Rating.Good ? "border-accent" : "border-line-strong"
                }`}
              >
                <span>{g.label}</span>
                <span className="text-xs text-muted tabular-nums">{previews?.[g.rating]}</span>
              </button>
            ))}
          </div>
        ) : (
          <button className="btn-primary min-h-16" onClick={() => setRevealed(true)}>
            Show answer
          </button>
        )}
      </div>
    </main>
  );
}

function CardFace({ item, revealed }: { item: SessionItem; revealed: boolean }) {
  const { entry, card, example } = item;
  const spoken = entry.article ? `${entry.article} ${entry.dutch}` : entry.dutch;
  const recognise = card.kind === "recognise";

  const dutch = (
    <div className="flex items-start gap-1">
      <h1 className="text-[2.5rem] leading-[1.15] break-words">
        <DutchTerm dutch={entry.dutch} article={entry.article} />
      </h1>
      <PlayButton text={spoken} className="mt-1" />
    </div>
  );

  return (
    <section className="flex flex-1 flex-col justify-center px-7 py-6">
      <p className="mb-3 text-xs tracking-wide text-muted">{recognise ? "Dutch → English" : "English → Dutch"}</p>

      {recognise ? (
        dutch
      ) : (
        <>
          <h1 className="text-3xl leading-snug">{entry.english}</h1>
          {!revealed && <p className="mt-2 text-sm text-muted">{entry.word_type === "noun" ? "noun — with de or het" : entry.word_type}</p>}
        </>
      )}

      {revealed && (
        <div className="mt-6 border-t border-line pt-5">
          {recognise ? <p className="text-2xl">{entry.english}</p> : dutch}
          <Grammar entry={entry} />
          {example && (
            <div className="mt-5">
              <div className="flex items-start gap-1">
                <p className="font-dutch text-lg leading-snug text-ink/80">{example.dutch}</p>
                <PlayButton text={example.dutch} size="sm" />
              </div>
              {example.english && (
                <p className="text-sm text-muted">
                  {example.english} {example.ai && <AiBadge />}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Grammar({ entry }: { entry: SessionItem["entry"] }) {
  const parts: string[] = [entry.word_type];
  if (entry.word_type === "noun" && entry.plural) parts.push(`pl. ${entry.plural}`);
  if (entry.word_type === "verb") {
    const past = [entry.past_singular, entry.past_plural].filter(Boolean).join(" / ");
    if (past) parts.push(past);
    if (entry.past_participle) parts.push(`${entry.auxiliary === "zijn" ? "is" : "heeft"} ${entry.past_participle}`);
  }
  return <p className="mt-1 font-dutch text-sm text-muted">{parts.join(" · ")}</p>;
}

function Summary({
  saving,
  answers,
  again,
  newWords,
  minutes,
  streak,
  saveFailed,
  onRetry,
}: {
  saving: boolean;
  answers: number;
  again: number;
  newWords: number;
  minutes: number;
  streak: number;
  saveFailed: number;
  onRetry: () => void;
}) {
  const remembered = answers ? Math.round(((answers - again) / answers) * 100) : 0;
  return (
    <main className="flex flex-1 flex-col justify-end gap-8 px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="font-dutch text-4xl">Goed gedaan</h1>
        <p className="mt-2 text-muted">Session complete.</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        <SummaryStat label="answers" value={answers} />
        <SummaryStat label="remembered" value={`${remembered}%`} />
        <SummaryStat label={newWords === 1 ? "new word" : "new words"} value={newWords} />
        <SummaryStat label="day streak" value={streak} />
      </dl>
      <p className="text-sm text-muted">
        About {minutes} {minutes === 1 ? "minute" : "minutes"}.
      </p>
      {saveFailed > 0 && (
        <button onClick={onRetry} className="rounded-xl bg-warn-soft px-4 py-3 text-left text-sm">
          {saveFailed} {saveFailed === 1 ? "answer wasn't" : "answers weren't"} saved. Tap to retry.
        </button>
      )}
      {saving ? (
        <div className="btn-primary gap-2 opacity-70">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Saving…
        </div>
      ) : (
        <Link href="/" className="btn-primary">
          Done
        </Link>
      )}
    </main>
  );
}

function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dd className="text-4xl tabular-nums">{value}</dd>
      <dt className="text-sm text-muted">{label}</dt>
    </div>
  );
}

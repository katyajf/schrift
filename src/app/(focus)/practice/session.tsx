"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, RotateCw, X } from "lucide-react";
import { AiBadge, DutchTerm } from "@/components/dutch-term";
import { PlayButton } from "@/components/play-button";
import { Rating, type CardFields, type Grade } from "@/lib/fsrs";
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

type SaveStatus = "saving" | "learned" | "error";

export function Session({ items, streak, studiedToday }: { items: SessionItem[]; streak: number; studiedToday: boolean }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [seenAnswers, setSeenAnswers] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const [phase, setPhase] = useState<"cards" | "saving" | "summary">("cards");
  const [minutes, setMinutes] = useState(1);
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  // Keep an immediate lock as well as rendered state to guard rapid double taps.
  const saveStatuses = useRef<Record<string, SaveStatus>>({});
  const inputs = useRef(new Map<string, GradeInput>());
  const total = items.length;
  const current = items[index];
  const learned = items.filter((item) => statuses[item.card.id] === "learned").length;
  const saveFailed = Object.values(statuses).filter((status) => status === "error").length;
  const saving = Object.values(statuses).some((status) => status === "saving");

  useEffect(() => {
    const now = Date.now();
    startedAt.current ||= now;
    shownAt.current = now;
  }, [current]);

  const save = useCallback((input: GradeInput) => {
    if (["saving", "learned"].includes(saveStatuses.current[input.cardId])) return;
    inputs.current.set(input.cardId, input);
    const updateStatus = (status: SaveStatus) => {
      saveStatuses.current[input.cardId] = status;
      setStatuses((previous) => ({ ...previous, [input.cardId]: status }));
    };
    updateStatus("saving");
    // Preserve the existing server action's ordered, idempotent review saving.
    saveChain.current = saveChain.current.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await gradeCard(input);
          if (result.ok) {
            updateStatus("learned");
            return;
          }
        } catch {}
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
      updateStatus("error");
    });
  }, []);

  function retryFailed() {
    for (const [cardId, input] of inputs.current) {
      if (saveStatuses.current[cardId] === "error") save(input);
    }
  }

  const flip = useCallback(() => {
    if (!current) return;
    setRevealed((previous) => !previous);
    setSeenAnswers((previous) => new Set(previous).add(current.card.id));
  }, [current]);

  const move = useCallback((direction: -1 | 1) => {
    setIndex((previous) => Math.max(0, Math.min(total - 1, previous + direction)));
    setRevealed(false);
  }, [total]);

  // Swipe like a card stack: drag left for the next card, right for the previous.
  // The card follows your finger; past the threshold it slides off and the next one fades in.
  const [dragX, setDragX] = useState(0);
  const [settling, setSettling] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const suppressTap = useRef(false);
  const SWIPE_THRESHOLD = 80;

  const swipeHandlers = {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (settling || (event.pointerType === "mouse" && event.button !== 0)) return;
      drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId, horizontal: null };
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== event.pointerId) return;
      const x = event.clientX - d.x;
      const y = event.clientY - d.y;
      // Decide once, after a few pixels, whether this is a swipe or a scroll.
      if (d.horizontal === null && Math.hypot(x, y) > 8) {
        d.horizontal = Math.abs(x) > Math.abs(y);
        if (d.horizontal) {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }
      }
      if (!d.horizontal) return;
      const pastEdge = (x > 0 && index === 0) || (x < 0 && index === total - 1);
      setDragX(pastEdge ? x * 0.25 : x); // resist when there's no card that way
    },
    onPointerUp() {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (!d?.horizontal) return;
      suppressTap.current = true; // the click that follows a swipe shouldn't flip the card
      setTimeout(() => (suppressTap.current = false), 50);
      const direction = dragX <= -SWIPE_THRESHOLD ? 1 : dragX >= SWIPE_THRESHOLD ? -1 : 0;
      const canMove = (direction === 1 && index < total - 1) || (direction === -1 && index > 0);
      if (!canMove) return setDragX(0);
      setSettling(true);
      setDragX(-direction * window.innerWidth);
      setTimeout(() => {
        move(direction as -1 | 1);
        setDragX(0);
        setSettling(false);
      }, 180);
    },
    onPointerCancel() {
      drag.current = null;
      setDragging(false);
      setDragX(0);
    },
  };

  const tapFlip = useCallback(() => {
    if (!suppressTap.current) flip();
  }, [flip]);

  const finish = useCallback(() => {
    setMinutes(Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000)));
    setPhase("saving");
    saveChain.current.then(() => setPhase("summary"));
  }, []);

  function markLearned() {
    if (!current || !seenAnswers.has(current.card.id)) return;
    const previousInput = inputs.current.get(current.card.id);
    save(previousInput ?? {
      cardId: current.card.id,
      // A learned card graduates to review; it is not removed permanently.
      rating: Rating.Easy,
      expectedReps: current.card.reps,
      durationMs: Math.min(3_600_000, Math.max(0, Date.now() - shownAt.current)),
    });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (phase !== "cards" || !current || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        move(-1);
      } else if (event.key === "ArrowRight" && index < total - 1) {
        event.preventDefault();
        move(1);
      } else if ((event.key === " " || event.key === "Enter") &&
        !(target instanceof HTMLElement && target.closest("button, a"))) {
        event.preventDefault();
        flip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, current, index, total, move, flip]);

  if (phase !== "cards" || !current) {
    return (
      <Summary
        saving={phase === "saving" || saving}
        learned={learned}
        remaining={total - learned}
        minutes={minutes}
        streak={studiedToday || learned === 0 ? streak : streak + 1}
        saveFailed={saveFailed}
        onRetry={retryFailed}
        onBack={total > 0 ? () => setPhase("cards") : undefined}
      />
    );
  }

  const status = statuses[current.card.id];
  const checkedAnswer = seenAnswers.has(current.card.id);

  return (
    <main className="flex flex-1 flex-col">
      <header className="px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="h-[3px] overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Cards learned" aria-valuemin={0} aria-valuemax={total} aria-valuenow={learned}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(learned / total) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between pt-1 text-xs text-muted">
          <span className="tabular-nums" aria-live="polite">Card {index + 1} of {total}</span>
          <span aria-live="polite">{learned} learned</span>
          <button type="button" onClick={finish} className="-mr-2 flex size-10 items-center justify-center" aria-label="End session">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {saveFailed > 0 && status !== "error" && (
          <button onClick={retryFailed} className="mt-1 w-full rounded-lg bg-warn-soft px-3 py-2 text-left text-sm">
            {saveFailed} {saveFailed === 1 ? "card wasn't" : "cards weren't"} saved. Tap to retry.
          </button>
        )}
      </header>

      <CardFace
        key={current.card.id}
        item={current}
        revealed={revealed}
        onFlip={tapFlip}
        dragX={dragX}
        dragging={dragging}
        swipeHandlers={swipeHandlers}
      />

      <div className="sticky bottom-0 bg-paper px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {status === "error" && (
          <p role="alert" className="mb-2 text-center text-sm text-danger">Couldn’t save this card. Try again.</p>
        )}
        {/* Secondary action: outlined, so moving between cards stays the main thing. */}
        <button
          type="button"
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm transition active:bg-sunken disabled:opacity-50 ${
            status === "learned" ? "border-accent bg-accent-soft text-ink" : "border-accent/60 text-accent"
          }`}
          onClick={markLearned}
          disabled={!checkedAnswer || status === "saving" || status === "learned"}
        >
          {status === "saving" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          {status === "saving" ? "Saving…" : status === "learned" ? "Learned" : status === "error" ? "Retry saving" : "Mark as learned"}
        </button>
        <p role="status" className="mt-1.5 text-center text-xs text-muted">
          {status === "learned" ? "Saved. This card will come back for review." : !checkedAnswer ? "Flip the card to check the answer first." : "Still learning? Move on and come back to it."}
        </p>
        <nav aria-label="Card navigation" className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" className="btn-secondary min-h-13 text-ink disabled:opacity-35" onClick={() => move(-1)} disabled={index === 0}>
            <ChevronLeft className="size-5" aria-hidden /> Previous
          </button>
          <button type="button" className="btn-secondary min-h-13 text-ink" onClick={flip} aria-label="Flip card">
            <RotateCw className="size-4" aria-hidden /> Flip
          </button>
          {index < total - 1 ? (
            <button type="button" className="btn-secondary min-h-13 text-ink" onClick={() => move(1)}>
              Next <ChevronRight className="size-5" aria-hidden />
            </button>
          ) : (
            <button type="button" className="btn-secondary min-h-13 border-accent text-accent" onClick={finish}>
              Finish <Check className="size-5" aria-hidden />
            </button>
          )}
        </nav>
      </div>
    </main>
  );
}

function CardFace({
  item,
  revealed,
  onFlip,
  dragX,
  dragging,
  swipeHandlers,
}: {
  item: SessionItem;
  revealed: boolean;
  onFlip: () => void;
  dragX: number;
  dragging: boolean;
  swipeHandlers: React.HTMLAttributes<HTMLElement>;
}) {
  const { entry, card, example } = item;
  const spoken = entry.article ? `${entry.article} ${entry.dutch}` : entry.dutch;
  const showDutch = (card.kind === "recognise") !== revealed;
  const flipLabel = showDutch ? "Show meaning" : "Show Dutch word";

  return (
    <section aria-label="Flashcard" className="flex flex-1 overflow-x-clip px-5 py-4">
      <div
        {...swipeHandlers}
        className="relative flex min-h-64 min-w-0 flex-1 animate-[card-in_200ms_ease-out] flex-col rounded-3xl border border-line bg-card"
        style={{
          touchAction: "pan-y",
          transform: dragX ? `translateX(${dragX}px) rotate(${Math.max(-4, Math.min(4, dragX / 40))}deg)` : undefined,
          transition: dragging ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
          opacity: dragX ? Math.max(0.3, 1 - Math.abs(dragX) / 500) : undefined,
        }}
      >
        <button
          type="button"
          className="absolute inset-0 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          onClick={onFlip}
          aria-label={flipLabel}
          aria-pressed={revealed}
          aria-controls="flashcard-content"
        />
        <div id="flashcard-content" aria-live="polite" className="pointer-events-none relative flex flex-1 flex-col p-6">
          <div className="flex items-center justify-between text-xs tracking-wide text-muted">
            <span>{showDutch ? "Dutch" : "English"}</span>
            <span>{revealed ? "Answer" : "Question"}</span>
          </div>
          <div className="flex flex-1 flex-col justify-center py-8">
            {showDutch ? (
              <div className="flex items-start gap-2">
                <h1 className="min-w-0 text-[2.5rem] leading-[1.15] break-words">
                  <DutchTerm dutch={entry.dutch} article={entry.article} />
                </h1>
                <span className="pointer-events-auto shrink-0"><PlayButton text={spoken} className="mt-1" /></span>
              </div>
            ) : (
              <h1 className="text-3xl leading-snug break-words">{entry.english}</h1>
            )}
            {!revealed && !showDutch && <p className="mt-2 text-sm text-muted">{entry.word_type === "noun" ? "noun — with de or het" : entry.word_type}</p>}
            {revealed && (
              <div className="mt-6 border-t border-line pt-5">
                <Grammar entry={entry} />
                {example && (
                  <div className="mt-5">
                    <div className="flex items-start gap-1">
                      <p className="min-w-0 font-dutch text-lg leading-snug break-words text-ink/80">{example.dutch}</p>
                      <span className="pointer-events-auto shrink-0"><PlayButton text={example.dutch} size="sm" /></span>
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
          </div>
          <p className="text-center text-xs text-muted">Tap to {revealed ? "flip back" : "see the answer"} · swipe for the next card</p>
        </div>
      </div>
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
  learned,
  remaining,
  minutes,
  streak,
  saveFailed,
  onRetry,
  onBack,
}: {
  saving: boolean;
  learned: number;
  remaining: number;
  minutes: number;
  streak: number;
  saveFailed: number;
  onRetry: () => void;
  onBack?: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col justify-end gap-8 px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="font-dutch text-4xl">Goed gedaan</h1>
        <p className="mt-2 text-muted">{saving ? "Saving your progress…" : remaining === 0 ? "Session complete." : "Your session so far."}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        <SummaryStat label={learned === 1 ? "card learned" : "cards learned"} value={learned} />
        <SummaryStat label="still learning" value={remaining} />
        <SummaryStat label="day streak" value={streak} />
      </dl>
      <p className="text-sm text-muted">
        About {minutes} {minutes === 1 ? "minute" : "minutes"}. Cards you haven’t marked as learned stay available to practise.
      </p>
      {saveFailed > 0 && (
        <button onClick={onRetry} className="rounded-xl bg-warn-soft px-4 py-3 text-left text-sm">
          {saveFailed} {saveFailed === 1 ? "card wasn't" : "cards weren't"} saved. Tap to retry.
        </button>
      )}
      <div className="flex flex-col gap-3">
        {onBack && <button type="button" onClick={onBack} className="btn-secondary" disabled={saving}>Back to cards</button>}
        {saving ? (
          <div className="btn-primary gap-2 opacity-70" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Saving…
          </div>
        ) : (
          <Link href="/" className="btn-primary">
            {saveFailed > 0 ? "Leave without saving" : "Done"}
          </Link>
        )}
      </div>
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

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, RotateCcw, Shuffle, X } from "lucide-react";
import { AiBadge, DutchTerm } from "@/components/dutch-term";
import { PlayButton } from "@/components/play-button";
import { fromFsrsCard, Rating, scheduler, toFsrsCard, type CardFields, type Grade } from "@/lib/fsrs";
import { requeuePosition } from "@/lib/lesson";
import { articleRule, PLURAL_RULE } from "@/lib/articles";
import type { Article, Auxiliary, CardKind, WordType } from "@/lib/database.types";
import { gradeCard, loadLesson, loadNewCards } from "./actions";

export type SessionItem = {
  card: CardFields & { id: string; kind: CardKind };
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
    notes: string | null;
  };
  example: { dutch: string; english: string | null; ai: boolean } | null;
};

type GradeInput = { cardId: string; rating: Grade; expectedReps: number; durationMs: number | null };

const SWIPE_THRESHOLD = 80;

// Each card is a quick self-check, as in Duolingo and Babbel reviews:
//   Got it          -> "Good": the card moves on to a longer interval
//   Still learning  -> "Again": it comes back a few cards later in this lesson,
//                      and sooner on later days
// Swipe right for Got it, left for Still learning.
//
// "de of het?" cards are answered by tapping de or het instead: right counts as
// Got it, wrong as Still learning, and the rule behind the answer is shown.
export function Session({
  items,
  streak,
  studiedToday,
  setId = null,
}: {
  items: SessionItem[];
  streak: number;
  studiedToday: boolean;
  setId?: string | null;
}) {
  // queue[0] is the card on screen; missed cards are put back further down.
  const [queue, setQueue] = useState(items);
  const [lessonSize, setLessonSize] = useState(items.length);
  const [lessonNumber, setLessonNumber] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const [choice, setChoice] = useState<Article | null>(null); // for de/het cards
  const [phase, setPhase] = useState<"cards" | "saving" | "summary">("cards");
  const [tally, setTally] = useState({ gotIt: 0, missedWords: new Set<string>(), newWords: new Set<string>() });
  const [saveFailed, setSaveFailed] = useState(0);
  const [minutes, setMinutes] = useState(1);
  const [loadingNext, setLoadingNext] = useState<"lesson" | "words" | null>(null);
  const [nextMessage, setNextMessage] = useState<string | null>(null);
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const failed = useRef<GradeInput[]>([]);
  const seenCardIds = useRef(new Set(items.map((i) => i.card.id)));
  const current = queue[0];
  const isArticleCard = current?.card.kind === "article";
  const articleCorrect = choice !== null && choice === current?.entry.article;
  const remainingCards = new Set(queue.map((i) => i.card.id)).size;
  const done = lessonSize - remainingCards;

  useEffect(() => {
    const now = Date.now();
    startedAt.current ||= now;
    shownAt.current = now;
  }, [current]);

  // Answers are saved one at a time and in order, without holding up the next card.
  const save = useCallback((input: GradeInput) => {
    saveChain.current = saveChain.current.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if ((await gradeCard(input)).ok) return;
        } catch {}
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
      failed.current.push(input);
      setSaveFailed(failed.current.length);
    });
  }, []);

  function retryFailed() {
    const again = failed.current.splice(0);
    setSaveFailed(0);
    again.forEach(save);
  }

  const flip = useCallback(() => setRevealed((r) => !r), []);

  const finish = useCallback(() => {
    setMinutes(Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000)));
    setPhase("saving");
    saveChain.current.then(() => setPhase("summary"));
  }, []);

  // --- Answering --------------------------------------------------------------

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);

  const answer = useCallback(
    (gotIt: boolean) => {
      if (!current || settling) return;
      const now = new Date();
      const rating: Grade = gotIt ? Rating.Good : Rating.Again;
      const next = scheduler.next(toFsrsCard(current.card), now, rating).card;

      save({
        cardId: current.card.id,
        rating,
        expectedReps: current.card.reps,
        durationMs: Math.min(3_600_000, Math.round(now.getTime() - shownAt.current)),
      });

      setTally((t) => ({
        gotIt: t.gotIt + (gotIt ? 1 : 0),
        missedWords: gotIt ? t.missedWords : new Set(t.missedWords).add(current.entry.id),
        newWords: current.card.state === 0 ? new Set(t.newWords).add(current.entry.id) : t.newWords,
      }));

      const rest = queue.slice(1);
      if (!gotIt) {
        // Same card, with its updated schedule, a few cards further on.
        const retry = { ...current, card: { ...current.card, ...fromFsrsCard(next) } };
        rest.splice(requeuePosition(rest.length), 0, retry);
      }

      // Slide off the way it was answered, then show the next card.
      setSettling(true);
      setDragX((gotIt ? 1 : -1) * window.innerWidth);
      setTimeout(() => {
        setQueue(rest);
        setRevealed(false);
        setChoice(null);
        setDragX(0);
        setSettling(false);
        if (rest.length === 0) finish();
      }, 180);
    },
    [current, queue, save, settling, finish],
  );

  function chooseArticle(article: Article) {
    if (choice || settling) return;
    setChoice(article);
    setRevealed(true);
  }

  // --- Swipe ------------------------------------------------------------------

  const drag = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const suppressTap = useRef(false);

  const swipeHandlers = {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (settling || (event.pointerType === "mouse" && event.button !== 0)) return;
      if (isArticleCard && !choice) return; // pick de or het first
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
      if (d.horizontal) setDragX(x);
    },
    onPointerUp() {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (!d?.horizontal) return;
      suppressTap.current = true; // the click after a swipe shouldn't flip the card
      setTimeout(() => (suppressTap.current = false), 50);
      // A de/het card is already marked; either direction moves on.
      if (isArticleCard && Math.abs(dragX) >= SWIPE_THRESHOLD) answer(articleCorrect);
      else if (dragX >= SWIPE_THRESHOLD) answer(true);
      else if (dragX <= -SWIPE_THRESHOLD) answer(false);
      else setDragX(0);
    },
    onPointerCancel() {
      drag.current = null;
      setDragging(false);
      setDragX(0);
    },
  };

  const tapFlip = useCallback(() => {
    if (suppressTap.current || (isArticleCard && !choice)) return;
    flip();
  }, [flip, isArticleCard, choice]);

  // Space flips; → got it, ← still learning (for a laptop keyboard).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (phase !== "cards" || !current || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (isArticleCard) {
        // d / h to answer, then Enter or → to continue.
        if (!choice && (event.key === "d" || event.key === "h")) chooseArticle(event.key === "d" ? "de" : "het");
        else if (choice && (event.key === "Enter" || event.key === "ArrowRight" || event.key === " ")) {
          event.preventDefault();
          answer(articleCorrect);
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        answer(true);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        answer(false);
      } else if ((event.key === " " || event.key === "Enter") && !(target instanceof HTMLElement && target.closest("button, a"))) {
        event.preventDefault();
        flip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chooseArticle only reads state listed here
  }, [phase, current, answer, flip, isArticleCard, choice, articleCorrect]);

  // --- Next lesson ------------------------------------------------------------

  function startLesson(next: SessionItem[]) {
    next.forEach((i) => seenCardIds.current.add(i.card.id));
    setQueue(next);
    setLessonSize(next.length);
    setLessonNumber((n) => n + 1);
    setTally({ gotIt: 0, missedWords: new Set(), newWords: new Set() });
    setRevealed(false);
    setChoice(null);
    setNextMessage(null);
    startedAt.current = 0;
    setPhase("cards");
  }

  async function anotherLesson() {
    setLoadingNext("lesson");
    setNextMessage(null);
    try {
      await saveChain.current; // so the new lesson sees today's answers
      const result = await loadLesson({ setId });
      if ("error" in result) return setNextMessage(result.error);
      if (!result.items.length) return setNextMessage("Nothing left to practise. Scan more pages to add words.");
      startLesson(result.items);
    } catch {
      setNextMessage("Couldn't load a lesson. Check your connection.");
    } finally {
      setLoadingNext(null);
    }
  }

  async function addNewWords() {
    setLoadingNext("words");
    setNextMessage(null);
    try {
      const result = await loadNewCards({ exclude: [...seenCardIds.current], count: 10, setId });
      if ("error" in result) return setNextMessage(result.error);
      if (!result.items.length) return setNextMessage("No new words left. Scan another notebook page to add more.");
      startLesson(result.items);
    } catch {
      setNextMessage("Couldn't load new words. Check your connection.");
    } finally {
      setLoadingNext(null);
    }
  }

  if (phase !== "cards" || !current) {
    return (
      <Summary
        saving={phase === "saving"}
        gotIt={tally.gotIt}
        missed={tally.missedWords.size}
        newWords={tally.newWords.size}
        minutes={minutes}
        streak={studiedToday || tally.gotIt + tally.missedWords.size === 0 ? streak : streak + 1}
        lessonNumber={lessonNumber}
        endedEarly={queue.length > 0}
        saveFailed={saveFailed}
        onRetry={retryFailed}
        onResume={() => setPhase("cards")}
        onAnotherLesson={anotherLesson}
        onAddWords={addNewWords}
        loadingNext={loadingNext}
        nextMessage={nextMessage}
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div
          className="h-[3px] overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={lessonSize}
          aria-valuenow={done}
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(done / lessonSize) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between pt-1 text-xs text-muted">
          <span className="tabular-nums" aria-live="polite">
            {remainingCards} to go
          </span>
          {current.card.state === 0 && !isArticleCard && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-ink">New word</span>
          )}
          <button type="button" onClick={finish} className="-mr-2 flex size-10 items-center justify-center" aria-label="End lesson">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {saveFailed > 0 && (
          <button onClick={retryFailed} className="mt-1 w-full rounded-lg bg-warn-soft px-3 py-2 text-left text-sm">
            {saveFailed} {saveFailed === 1 ? "answer wasn't" : "answers weren't"} saved. Tap to retry.
          </button>
        )}
      </header>

      <CardFace
        key={`${current.card.id}-${current.card.reps}`}
        item={current}
        revealed={revealed}
        choice={choice}
        onFlip={tapFlip}
        dragX={dragX}
        dragging={dragging}
        swipeHandlers={swipeHandlers}
      />

      <div className="sticky bottom-0 bg-paper px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {isArticleCard && !choice ? (
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="de or het">
            <button type="button" onClick={() => chooseArticle("de")} className="min-h-16 rounded-2xl border-2 border-de bg-de-soft font-dutch text-2xl text-de active:scale-[0.99]">
              de
            </button>
            <button type="button" onClick={() => chooseArticle("het")} className="min-h-16 rounded-2xl border-2 border-het bg-het-soft font-dutch text-2xl text-het active:scale-[0.99]">
              het
            </button>
          </div>
        ) : isArticleCard ? (
          <button type="button" className="btn-primary min-h-14" onClick={() => answer(articleCorrect)} disabled={settling}>
            Next
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-secondary min-h-14 text-ink" onClick={() => answer(false)} disabled={settling}>
              <RotateCcw className="size-4" aria-hidden /> Still learning
            </button>
            <button type="button" className="btn-secondary min-h-14 border-accent text-accent" onClick={() => answer(true)} disabled={settling}>
              <Check className="size-5" aria-hidden /> Got it
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function CardFace({
  item,
  revealed,
  choice,
  onFlip,
  dragX,
  dragging,
  swipeHandlers,
}: {
  item: SessionItem;
  revealed: boolean;
  choice: Article | null;
  onFlip: () => void;
  dragX: number;
  dragging: boolean;
  swipeHandlers: React.HTMLAttributes<HTMLElement>;
}) {
  const { entry, card, example } = item;
  const spoken = entry.article ? `${entry.article} ${entry.dutch}` : entry.dutch;
  if (card.kind === "article" && entry.article) {
    return (
      <ArticleCardFace
        entry={entry}
        article={entry.article}
        choice={choice}
        dragX={dragX}
        dragging={dragging}
        swipeHandlers={swipeHandlers}
      />
    );
  }
  const showDutch = (card.kind === "recognise") !== revealed;
  const flipLabel = showDutch ? "Show meaning" : "Show Dutch word";
  // How far the swipe is towards an answer, 0..1, to fade in its label.
  const lean = Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);

  return (
    <section aria-label="Flashcard" className="flex flex-1 overflow-x-clip px-5 py-4">
      <div
        {...swipeHandlers}
        className={`relative flex min-h-64 min-w-0 flex-1 animate-[card-in_200ms_ease-out] flex-col rounded-3xl border bg-card ${
          dragX >= SWIPE_THRESHOLD ? "border-accent" : dragX <= -SWIPE_THRESHOLD ? "border-warn" : "border-line"
        }`}
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
        {dragX !== 0 && (
          <span
            aria-hidden
            className={`pointer-events-none absolute top-5 rounded-full px-3 py-1 text-sm ${
              dragX > 0 ? "left-5 bg-accent-soft text-accent" : "right-5 bg-warn-soft text-warn"
            }`}
            style={{ opacity: lean }}
          >
            {dragX > 0 ? "Got it" : "Still learning"}
          </span>
        )}
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
                <span className="pointer-events-auto shrink-0">
                  <PlayButton text={spoken} className="mt-1" />
                </span>
              </div>
            ) : (
              <h1 className="text-3xl leading-snug break-words">{entry.english}</h1>
            )}
            {!revealed && !showDutch && (
              <p className="mt-2 text-sm text-muted">{entry.word_type === "noun" ? "noun — with de or het" : entry.word_type}</p>
            )}
            {revealed && (
              <div className="mt-6 border-t border-line pt-5">
                <Grammar entry={entry} />
                {entry.notes && <p className="mt-2 text-sm text-muted">{entry.notes}</p>}
                {example && (
                  <div className="mt-5">
                    <div className="flex items-start gap-1">
                      <p className="min-w-0 font-dutch text-lg leading-snug break-words text-ink/80">{example.dutch}</p>
                      <span className="pointer-events-auto shrink-0">
                        <PlayButton text={example.dutch} size="sm" />
                      </span>
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
          <p className="text-center text-xs text-muted">
            {revealed ? "Tap to flip back" : "Tap to check"} · swipe right if you knew it
          </p>
        </div>
      </div>
    </section>
  );
}

// "___ huis — de or het?" Answered with the buttons below the card.
function ArticleCardFace({
  entry,
  article,
  choice,
  dragX,
  dragging,
  swipeHandlers,
}: {
  entry: SessionItem["entry"];
  article: Article;
  choice: Article | null;
  dragX: number;
  dragging: boolean;
  swipeHandlers: React.HTMLAttributes<HTMLElement>;
}) {
  const correct = choice === article;
  const rule = articleRule(entry.dutch, article);
  return (
    <section aria-label="de or het" className="flex flex-1 overflow-x-clip px-5 py-4">
      <div
        {...swipeHandlers}
        className={`relative flex min-h-64 min-w-0 flex-1 animate-[card-in_200ms_ease-out] flex-col rounded-3xl border bg-card p-6 ${
          !choice ? "border-line" : correct ? "border-accent" : "border-warn"
        }`}
        style={{
          touchAction: "pan-y",
          transform: dragX ? `translateX(${dragX}px) rotate(${Math.max(-4, Math.min(4, dragX / 40))}deg)` : undefined,
          transition: dragging ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
          opacity: dragX ? Math.max(0.3, 1 - Math.abs(dragX) / 500) : undefined,
        }}
      >
        <div className="flex items-center justify-between text-xs tracking-wide text-muted">
          <span>de of het?</span>
          <span>{entry.english}</span>
        </div>
        <div className="flex flex-1 flex-col justify-center py-8" aria-live="polite">
          <div className="flex items-start gap-2">
            <h1 className="min-w-0 font-dutch text-[2.5rem] leading-[1.15] break-words">
              {choice ? (
                <span className={article === "de" ? "text-de" : "text-het"}>{article}</span>
              ) : (
                <span className="text-line-strong">___</span>
              )}{" "}
              {entry.dutch}
            </h1>
            {choice && (
              <PlayButton text={`${article} ${entry.dutch}`} className="mt-1" />
            )}
          </div>
          {choice && (
            <div className="mt-6 border-t border-line pt-5">
              <p className={`flex items-center gap-1.5 ${correct ? "text-accent" : "text-warn"}`}>
                {correct ? <Check className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
                {correct ? "Right" : `It's ${article} ${entry.dutch}`}
              </p>
              {rule && <p className="mt-3 text-sm">{rule}</p>}
              {entry.notes && <p className="mt-2 text-sm text-muted">{entry.notes}</p>}
              {entry.plural && (
                <p className="mt-3 font-dutch text-sm text-muted">
                  <span className="text-de">de</span> {entry.plural} · {PLURAL_RULE}
                </p>
              )}
            </div>
          )}
        </div>
        <p className="text-center text-xs text-muted">{choice ? "Next, or swipe either way" : "Pick de or het below"}</p>
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
  gotIt,
  missed,
  newWords,
  minutes,
  streak,
  lessonNumber,
  endedEarly,
  saveFailed,
  onRetry,
  onResume,
  onAnotherLesson,
  onAddWords,
  loadingNext,
  nextMessage,
}: {
  saving: boolean;
  gotIt: number;
  missed: number;
  newWords: number;
  minutes: number;
  streak: number;
  lessonNumber: number;
  endedEarly: boolean;
  saveFailed: number;
  onRetry: () => void;
  onResume: () => void;
  onAnotherLesson: () => void;
  onAddWords: () => void;
  loadingNext: "lesson" | "words" | null;
  nextMessage: string | null;
}) {
  return (
    <main className="flex flex-1 flex-col justify-end gap-8 px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="font-dutch text-4xl">Goed gedaan</h1>
        <p className="mt-2 text-muted">
          {saving ? "Saving your progress…" : endedEarly ? "Lesson paused." : `Lesson ${lessonNumber} done.`}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        <SummaryStat label="got it" value={gotIt} />
        <SummaryStat label={missed === 1 ? "word to revisit" : "words to revisit"} value={missed} />
        <SummaryStat label={newWords === 1 ? "new word" : "new words"} value={newWords} />
        <SummaryStat label="day streak" value={streak} />
      </dl>
      <p className="text-sm text-muted">
        About {minutes} {minutes === 1 ? "minute" : "minutes"}.
        {missed > 0 && " Words you're still learning come back sooner."}
      </p>
      {saveFailed > 0 && (
        <button onClick={onRetry} className="rounded-xl bg-warn-soft px-4 py-3 text-left text-sm">
          {saveFailed} {saveFailed === 1 ? "answer wasn't" : "answers weren't"} saved. Tap to retry.
        </button>
      )}
      {nextMessage && (
        <p role="alert" className="text-sm text-muted">
          {nextMessage}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {endedEarly && (
          <button type="button" onClick={onResume} className="btn-ghost">
            Back to the lesson
          </button>
        )}
        <button type="button" onClick={onAnotherLesson} className="btn-primary gap-2" disabled={loadingNext !== null}>
          {loadingNext === "lesson" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Shuffle className="size-5" aria-hidden />}
          {loadingNext === "lesson" ? "Shuffling…" : "Another lesson"}
        </button>
        <button type="button" onClick={onAddWords} className="btn-secondary" disabled={loadingNext !== null}>
          {loadingNext === "words" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Plus className="size-5" aria-hidden />}
          {loadingNext === "words" ? "Loading words…" : "Learn 10 new words"}
        </button>
        {saving ? (
          <div className="btn-ghost gap-2" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Saving…
          </div>
        ) : (
          <Link href="/" className="btn-ghost">
            {saveFailed > 0 ? "Leave without saving" : "Done for now"}
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

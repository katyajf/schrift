import { fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";

// One scheduler for client and server: the client uses it to preview "next
// review in 3d" on the buttons, the server to compute what actually gets saved.
// Fuzz is off so both sides agree on the intervals they show and store.
export const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365 * 3,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});

export { Rating, State };
export type { Grade };

export const GRADES: { rating: Grade; label: string }[] = [
  { rating: Rating.Again, label: "Again" },
  { rating: Rating.Hard, label: "Hard" },
  { rating: Rating.Good, label: "Good" },
  { rating: Rating.Easy, label: "Easy" },
];

// The card columns as they come from Postgres (timestamps are strings).
export type CardFields = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
};

export function toFsrsCard(row: CardFields): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

export function fromFsrsCard(card: Card): CardFields {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** "1m", "10m", "3h", "4d", "2mo", "1y" */
export function formatInterval(from: Date, to: Date) {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months}mo`;
  return `${Math.round((days / 365) * 10) / 10}y`;
}

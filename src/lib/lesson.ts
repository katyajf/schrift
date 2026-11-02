// Ordering inside a lesson. Pure functions with an injectable random source,
// so they can be tested and so the server can arrange a lesson per request.

type Arrangeable = { card: { state: number }; entry: { id: string } };

export function shuffle<T>(list: T[], random = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const isNew = (item: Arrangeable) => item.card.state === 0;

/**
 * Shuffle a lesson, then nudge the order so it reads well:
 * - open with a word you've seen before, as a warm-up
 * - no two new words back to back, so each one gets some breathing room
 * - never the same word twice in a row
 * When a rule can't be met (e.g. a lesson of only new words), it's skipped.
 */
export function arrangeLesson<T extends Arrangeable>(items: T[], random = Math.random): T[] {
  // Both directions of a word can land side by side; reshuffle when they do.
  // A handful of tries is plenty unless it's impossible (e.g. a two-card lesson).
  let best = arrangeOnce(items, random);
  for (let attempt = 0; attempt < 20 && hasSameWordInARow(best); attempt++) {
    best = arrangeOnce(items, random);
  }
  return best;
}

function arrangeOnce<T extends Arrangeable>(items: T[], random: () => number): T[] {
  const known = shuffle(items.filter((i) => !isNew(i)), random);
  const fresh = shuffle(items.filter(isNew), random);
  if (!known.length) return fresh;

  // Each known word opens a "gap" after it; new words go into random gaps,
  // at most one per gap until every gap has one.
  const gaps: T[][] = known.map(() => []);
  const order = shuffle(gaps.map((_, i) => i), random);
  fresh.forEach((item, i) => gaps[order[i % order.length]].push(item));

  return known.flatMap((item, i) => [item, ...gaps[i]]);
}

function hasSameWordInARow(list: Arrangeable[]) {
  return list.some((item, i) => i > 0 && item.entry.id === list[i - 1].entry.id);
}

/** Where a "still learning" card goes back in: a few cards later, not straight away. */
export function requeuePosition(remaining: number, random = Math.random) {
  return Math.min(remaining, 3 + Math.floor(random() * 3));
}

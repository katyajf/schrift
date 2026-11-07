import type { Article } from "@/lib/database.types";
import { stripAccents } from "@/lib/dutch";

// Checks a typed Dutch answer against the saved word, Duolingo-style:
// forgiving about capitals, accents and a single typo (but saying so), strict
// about the article, since de/het is exactly what's being learned.

export type CheckResult = {
  correct: boolean;
  /** The answer as it should be written, e.g. "het ziekenhuis". */
  expected: string;
  /** Why it's wrong, or what to watch even though it counts. */
  note: string | null;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[.!?¿¡,;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Optimal string alignment distance (Levenshtein plus swapped neighbours).
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const ARTICLE_RE = /^(de|het|een)\s+/;

export function checkTypedAnswer(typed: string, word: { dutch: string; article: Article | null; word_type: string }): CheckResult {
  const isNoun = word.word_type === "noun" && word.article !== null;
  // A saved word can hold variants: "beginnen / starten".
  const variants = word.dutch.split(/\s*[/;]\s*/).filter(Boolean);
  const expected = isNoun ? `${word.article} ${variants[0]}` : variants[0];

  const answer = norm(typed);
  if (!answer) return { correct: false, expected, note: "No answer" };

  const typedArticle = answer.match(ARTICLE_RE)?.[1] ?? null;
  const typedWord = typedArticle ? answer.slice(typedArticle.length + 1) : answer;

  // Find the variant the answer is closest to.
  let best = { variant: variants[0], exact: false, accentsOnly: false, typo: false };
  for (const variant of variants) {
    const target = norm(isNoun ? variant : variant.replace(ARTICLE_RE, ""));
    const typedForCompare = isNoun ? typedWord : answer.replace(ARTICLE_RE, "");
    if (typedForCompare === target) {
      best = { variant, exact: true, accentsOnly: false, typo: false };
      break;
    }
    if (stripAccents(typedForCompare) === stripAccents(target)) {
      best = { variant, exact: false, accentsOnly: true, typo: false };
    } else if (!best.accentsOnly && target.length >= 5 && distance(stripAccents(typedForCompare), stripAccents(target)) === 1) {
      best = { variant, exact: false, accentsOnly: false, typo: true };
    }
  }
  const shown = isNoun ? `${word.article} ${best.variant}` : best.variant;
  const wordOk = best.exact || best.accentsOnly || best.typo;

  if (!wordOk) return { correct: false, expected: shown, note: null };

  if (isNoun) {
    if (!typedArticle) return { correct: false, expected: shown, note: `Add the article: ${word.article}` };
    if (typedArticle === "een") return { correct: false, expected: shown, note: `Use de or het here: ${shown}` };
    if (typedArticle !== word.article) return { correct: false, expected: shown, note: `It's ${word.article}, not ${typedArticle}` };
  }

  // Counts as right; mention anything to tidy up.
  const writtenAs = typed.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  let note: string | null = null;
  if (best.typo) note = `Typo — it's spelled ${best.variant}`;
  else if (best.accentsOnly) note = `Watch the accents: ${best.variant}`;
  // Capitals matter for names and languages (Nederlands), not for the first
  // letter of a phrase.
  else if (capitalMatters(best.variant) && !writtenAs.includes(best.variant)) note = `Written with a capital: ${best.variant}`;
  return { correct: true, expected: shown, note };
}

function capitalMatters(text: string) {
  return /[A-Z]/.test(text.slice(1)) || (!text.includes(" ") && /^[A-Z]/.test(text));
}

import type { Article } from "@/lib/database.types";

// Rules of thumb for de/het, shown after answering a "de of het?" card.
// The first group comes from the tutor's Lidwoorden handout; the -ing / -heid /
// -teit / -tie group are standard de-word endings. They're hints, not proofs:
// many words follow no rule, and some break one (de geboorte, de verandering).

type Rule = { article: Article; test: (word: string) => boolean; covers: string };

const RULES: Rule[] = [
  { article: "het", test: (w) => /(je|tje|pje|kje|etje)$/.test(w) && w.length > 3, covers: "diminutives (-je, -tje, -pje, -kje)" },
  { article: "het", test: (w) => /(isme|ment|sel|um)$/.test(w), covers: "words ending in -isme, -ment, -sel or -um" },
  { article: "de", test: (w) => /(ing|heid|teit|tie|sie)$/.test(w), covers: "words ending in -ing, -heid, -teit or -tie" },
  {
    article: "het",
    // Two or more syllables starting with be-, ge-, ver- or ont-.
    test: (w) => /^(be|ge|ver|ont)/.test(w) && (w.match(/[aeiouy]+/g)?.length ?? 0) >= 2,
    covers: "words of two or more syllables starting with be-, ge-, ver- or ont-",
  },
];

/** The rule a noun fits, phrased for its actual article, or null if none applies. */
export function articleRule(dutch: string, article: Article): string | null {
  const word = dutch.trim().toLowerCase();
  const rule = RULES.find((r) => r.test(word));
  if (!rule) return null;
  if (rule.article === article) return `${article}: ${rule.covers}`;
  return `An exception: ${rule.covers} are usually ${rule.article}-words.`;
}

/** Shown under every article answer: plurals always take de. */
export const PLURAL_RULE = "Plurals always take de.";

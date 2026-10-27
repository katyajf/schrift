// Handwriting in block capitals comes back as "ZIEKENHUIS" / "THE HOSPITAL".
// These turn all-caps text into normal casing and leave anything else alone,
// so deliberate capitals like "Nederland" survive.

function isAllCaps(text: string) {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/** A single word or short phrase: "ZIEKENHUIS" -> "ziekenhuis". */
export function normalizeTerm(text: string, lang: "nl" | "en"): string {
  if (!isAllCaps(text)) return text;
  const lower = text.toLocaleLowerCase(lang);
  return lang === "en" ? lower.replace(/\bi\b/g, "I") : lower;
}

/** A sentence: "IK BEN ZIEK." -> "Ik ben ziek." */
export function normalizeSentence(text: string, lang: "nl" | "en"): string {
  if (!isAllCaps(text)) return text;
  const lower = normalizeTerm(text, lang);
  // Dutch capitalises the digraph as a pair: "IJs", not "Ijs".
  if (lang === "nl" && /^ij/.test(lower)) return "IJ" + lower.slice(2);
  return lower.charAt(0).toLocaleUpperCase(lang) + lower.slice(1);
}

type CasedEntry = {
  dutch: string;
  english: string;
  plural: string | null;
  past_singular: string | null;
  past_plural: string | null;
  past_participle: string | null;
  examples: { dutch: string; english: string | null }[];
  suggestion: { dutch: string; reason: string } | null;
};

export function normalizeEntryCasing<T extends CasedEntry>(entry: T): T {
  const term = (v: string | null) => (v === null ? null : normalizeTerm(v, "nl"));
  return {
    ...entry,
    dutch: normalizeTerm(entry.dutch, "nl"),
    english: normalizeTerm(entry.english, "en"),
    plural: term(entry.plural),
    past_singular: term(entry.past_singular),
    past_plural: term(entry.past_plural),
    past_participle: term(entry.past_participle),
    examples: entry.examples.map((e) => ({
      dutch: normalizeSentence(e.dutch, "nl"),
      english: e.english === null ? null : normalizeSentence(e.english, "en"),
    })),
    suggestion: entry.suggestion && { ...entry.suggestion, dutch: normalizeTerm(entry.suggestion.dutch, "nl") },
  };
}

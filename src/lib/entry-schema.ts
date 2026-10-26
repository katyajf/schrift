import { z } from "zod";

// Shared by the AI module (server), the review screen (client) and the save
// action (server), so all three agree on what an entry looks like.

export const WORD_TYPES = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "phrase",
  "preposition",
  "conjunction",
  "pronoun",
  "numeral",
  "interjection",
  "other",
] as const;

export const ARTICLES = ["de", "het"] as const;
export const AUXILIARIES = ["hebben", "zijn", "hebben/zijn"] as const;

// Fields the AI may fill in from its own knowledge rather than reading them off the page.
export const FILLABLE_FIELDS = [
  "english",
  "article",
  "word_type",
  "plural",
  "past_singular",
  "past_plural",
  "past_participle",
  "auxiliary",
] as const;
export type FillableField = (typeof FILLABLE_FIELDS)[number];

const optionalText = z.string().nullable();

export const ExampleSchema = z.object({
  dutch: z.string(),
  english: optionalText,
});

// ---------------------------------------------------------------------------
// What Gemini returns for one notebook page. Also converted to JSON Schema and
// sent as the response schema, so the model output is constrained to this shape.

export const ExtractedEntrySchema = z.object({
  dutch: z
    .string()
    .describe("The Dutch word or phrase exactly as handwritten, without the article. Never correct spelling here."),
  english: z.string().describe("The English meaning as written. If none is written, give the most likely meaning."),
  article: z.enum(ARTICLES).nullable().describe("de or het for nouns (as written, or from your knowledge). null for non-nouns."),
  word_type: z.enum(WORD_TYPES),
  plural: optionalText.describe("Plural form for nouns, otherwise null."),
  past_singular: optionalText.describe("Simple past singular for verbs (e.g. 'liep'), otherwise null."),
  past_plural: optionalText.describe("Simple past plural for verbs (e.g. 'liepen'), otherwise null."),
  past_participle: optionalText.describe("Past participle for verbs (e.g. 'gelopen'), otherwise null."),
  auxiliary: z.enum(AUXILIARIES).nullable().describe("Perfect-tense auxiliary for verbs, otherwise null."),
  examples: z.array(ExampleSchema).describe("Example sentences handwritten with this entry. Empty if none."),
  ai_filled: z
    .array(z.enum(FILLABLE_FIELDS))
    .describe("Every field you filled from your own knowledge because it was not written on the page."),
  suggestion: z
    .object({
      dutch: z.string().describe("The corrected spelling."),
      reason: z.string().describe("Short explanation, e.g. 'double a in open syllable'."),
    })
    .nullable()
    .describe("Only if the handwritten Dutch looks misspelled. null otherwise."),
  unsure: z.boolean().describe("true if the handwriting was hard to read and the transcription may be wrong."),
});
export type ExtractedEntry = z.infer<typeof ExtractedEntrySchema>;

export const ExtractionResultSchema = z.object({
  entries: z.array(ExtractedEntrySchema),
});

// A saved entry that a freshly extracted one might duplicate.
export const MatchSchema = z.object({
  entry_id: z.string(),
  dutch: z.string(),
  english: z.string(),
  article: z.enum(ARTICLES).nullable(),
  similarity: z.number(),
});
export type Match = z.infer<typeof MatchSchema>;

// Stored in pages.extraction while the page awaits review.
export const PageExtractionSchema = z.object({
  model: z.string(),
  entries: z.array(ExtractedEntrySchema),
  matches: z.record(z.string(), z.array(MatchSchema)),
});
export type PageExtraction = z.infer<typeof PageExtractionSchema>;

// ---------------------------------------------------------------------------
// What the review screen sends back when you press "Save all".

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const trimmed = z.preprocess(blankToNull, z.string().trim().max(200).nullable());

export const SaveEntrySchema = z.object({
  dutch: z.string().trim().min(1, "Dutch can't be empty").max(200),
  english: z.string().trim().max(300),
  article: z.preprocess(blankToNull, z.enum(ARTICLES).nullable()),
  word_type: z.enum(WORD_TYPES),
  plural: trimmed,
  past_singular: trimmed,
  past_plural: trimmed,
  past_participle: trimmed,
  auxiliary: z.preprocess(blankToNull, z.enum(AUXILIARIES).nullable()),
  examples: z.array(
    z.object({
      dutch: z.string().trim().min(1).max(500),
      english: z.preprocess(blankToNull, z.string().trim().max(500).nullable()),
    }),
  ),
  field_sources: z.partialRecord(z.enum(FILLABLE_FIELDS), z.literal("ai")),
  merge_into: z.uuid().nullable(),
});
export type SaveEntry = z.infer<typeof SaveEntrySchema>;

export const SavePageSchema = z.object({
  pageId: z.uuid(),
  entries: z.array(SaveEntrySchema).max(200),
});

// Editing a saved entry from the word detail screen.
export const EditEntrySchema = SaveEntrySchema.omit({ examples: true, field_sources: true, merge_into: true }).extend({
  notes: z.preprocess(blankToNull, z.string().trim().max(1000).nullable()),
});

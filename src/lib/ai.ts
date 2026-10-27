import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ExtractionResultSchema, type ExtractedEntry } from "@/lib/entry-schema";

// The only file that knows which AI provider is in use. The rest of the app
// calls these functions, so swapping providers means rewriting this file only.

const DEFAULT_MODEL = "gemini-3.8-flash";
// Used when the main model is overloaded (503) or out of quota (429).
const DEFAULT_FALLBACK_MODEL = "gemini-3.6-flash";

export const aiModel = () => process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

function modelsToTry() {
  const fallback = process.env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
  return [...new Set([aiModel(), fallback])];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function statusOf(error: unknown) {
  return error && typeof error === "object" && "status" in error ? (error as { status?: number }).status : undefined;
}

// Errors where waiting or switching model can help.
function isTransient(error: unknown) {
  const status = statusOf(error);
  return status === 429 || status === 500 || status === 503 || status === 504;
}

let client: GoogleGenAI | null = null;
function gemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError("GEMINI_API_KEY is not set.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export class AiError extends Error {}

// Gemini accepts a subset of JSON Schema. zod's output fits it once the
// $schema marker is removed and `type: [x, "null"]` is spelled as anyOf.
function toResponseSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  delete json.$schema;
  return rewriteTypeArrays(json);
}

function rewriteTypeArrays(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteTypeArrays);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) out[key] = rewriteTypeArrays(value);
  if (Array.isArray(out.type)) {
    out.anyOf = (out.type as string[]).map((type) => ({ type }));
    delete out.type;
  }
  return out;
}

const EXTRACTION_SCHEMA = toResponseSchema(ExtractionResultSchema);

const EXTRACTION_PROMPT = `You are reading a photo of a handwritten vocabulary notebook page from a learner of Dutch (Netherlands Dutch, level A2 working towards B1).

Layout: usually the Dutch word or phrase on the left and the English meaning on the right. Nouns sometimes have "de" or "het" written before them. A short example sentence is sometimes written underneath an entry; it belongs to the entry above it. Handwriting can be messy and some words are crossed out.

Rules:
- Return one entry per vocabulary item, in reading order.
- Skip anything crossed out, page headers, dates and doodles.
- "dutch": copy exactly what is written, minus a leading de/het. Do NOT fix spelling or accents here, even if you are sure it is wrong.
- If the Dutch looks misspelled, put the correct spelling in "suggestion" with a short reason. Otherwise "suggestion" is null.
- Fill in the article, plural (nouns) and past tense singular/plural, past participle and auxiliary (verbs) from your knowledge of Dutch when they aren't written, and list every field you filled yourself in "ai_filled". Same for "english" if no meaning is written.
- Verbs: "dutch" is the infinitive as written. Keep reflexive "zich" and separable particles as written.
- Multi-word expressions ("hoe gaat het?", "op tijd") are word_type "phrase".
- Set "unsure" to true when you had to guess at the handwriting.
- If the page has no vocabulary, return an empty list.`;

export async function extractEntriesFromImage(
  image: { data: Uint8Array; mimeType: string },
  // Epoch ms by which we must give up, so the caller can still save a result.
  { deadline = Date.now() + 240_000 }: { deadline?: number } = {},
): Promise<{ entries: ExtractedEntry[]; model: string }> {
  const base64 = Buffer.from(image.data).toString("base64");

  return withRetries(deadline, async (model, abortSignal) => {
    const response = await gemini().models.generateContent({
      model,
      contents: [
        { inlineData: { mimeType: image.mimeType, data: base64 } },
        { text: EXTRACTION_PROMPT },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: EXTRACTION_SCHEMA,
        temperature: 0.1,
        abortSignal,
      },
    });

    const text = response.text;
    if (!text) throw new AiError("The model returned an empty response.");
    const parsed = ExtractionResultSchema.parse(JSON.parse(text));
    return { entries: parsed.entries.map(cleanEntry), model };
  });
}

// Tries the main model a few times with backoff when Gemini is busy, then the
// fallback model. A malformed answer (rare with structured output) is retried once.
// Every call is cut off at the deadline, and no new attempt starts without
// enough time left, so the caller always gets an answer it can save.
async function withRetries<T>(
  deadline: number,
  call: (model: string, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const BACKOFF_MS = [1500, 4000];
  const MIN_TIME_FOR_A_CALL_MS = 20_000;
  let lastError: unknown = new AiError("Gemini took too long. Tap retry.");

  outer: for (const model of modelsToTry()) {
    let malformedRetries = 1;
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_TIME_FOR_A_CALL_MS) break outer;
      try {
        return await call(model, AbortSignal.timeout(remaining));
      } catch (error) {
        if (isTimeout(error)) {
          lastError = new AiError("Gemini took too long. Tap retry.");
          break outer;
        }
        lastError = error;
        if ((error instanceof z.ZodError || error instanceof SyntaxError) && malformedRetries-- > 0) continue;
        if (isTransient(error) && attempt < BACKOFF_MS.length) {
          console.warn(`Gemini ${model} returned ${statusOf(error)}, retrying`);
          await sleep(BACKOFF_MS[attempt]);
          continue;
        }
        break;
      }
    }
    // Only move on to the fallback when the problem is the model being unavailable.
    if (!isTransient(lastError) && statusOf(lastError) !== 404) break;
  }
  throw new AiError(describeError(lastError));
}

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function cleanEntry(entry: ExtractedEntry): ExtractedEntry {
  const dutch = entry.dutch.trim();
  const suggestion =
    entry.suggestion && entry.suggestion.dutch.trim() !== dutch ? entry.suggestion : null;
  return {
    ...entry,
    dutch,
    english: entry.english.trim(),
    suggestion,
    examples: entry.examples.filter((e) => e.dutch.trim() !== ""),
    ai_filled: [...new Set(entry.ai_filled)],
  };
}

function describeError(error: unknown): string {
  if (error instanceof AiError) return error.message;
  if (error instanceof z.ZodError) return "The model's answer didn't match the expected format.";
  if (error instanceof SyntaxError) return "The model's answer wasn't valid JSON.";
  const status = statusOf(error);
  if (status === 503 || status === 500 || status === 504) return "Gemini is busy right now. Tap retry in a minute.";
  if (status === 429) return "Gemini rate limit reached. Tap retry in a minute.";
  if (status === 404) return "Gemini model not found. Check GEMINI_MODEL.";
  if (status === 400) return "Gemini rejected the request. Check GEMINI_MODEL and the image.";
  if (status === 401 || status === 403) return "Gemini rejected the API key.";
  return error instanceof Error ? error.message : "The AI request failed.";
}

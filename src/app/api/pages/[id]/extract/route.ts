import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/auth";
import { AiError, extractEntriesFromImage } from "@/lib/ai";
import { dutchKey } from "@/lib/dutch";
import type { Match, PageExtraction } from "@/lib/entry-schema";
import type { Json } from "@/lib/database.types";

// Reading handwriting can take a minute, more with retries when Gemini is busy.
// 300s is the most Vercel's Hobby plan allows.
export const maxDuration = 300;
// Stop trying well before that, so the page always ends up "review" or "failed".
const AI_BUDGET_MS = 240_000;

export async function POST(_request: Request, ctx: RouteContext<"/api/pages/[id]/extract">) {
  const user = await getUserOrNull();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase } = user;
  const startedAt = Date.now();
  const { id } = await ctx.params;

  const { data: page } = await supabase.from("pages").select("id, storage_path, status").eq("id", id).maybeSingle();
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  if (page.status === "saved") return NextResponse.json({ error: "This page is already saved" }, { status: 409 });

  await supabase.from("pages").update({ status: "extracting", error: null }).eq("id", id);

  try {
    const { data: file, error: downloadError } = await supabase.storage.from("pages").download(page.storage_path);
    if (downloadError || !file) throw new AiError("Couldn't load the photo from storage.");

    const { entries, model } = await extractEntriesFromImage(
      { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type || "image/jpeg" },
      { deadline: startedAt + AI_BUDGET_MS },
    );

    const extraction: PageExtraction = { model, entries, matches: await findMatches(supabase, entries) };
    await supabase
      .from("pages")
      .update({ status: "review", extraction: extraction as unknown as Json, model })
      .eq("id", id);

    return NextResponse.json({ status: "review", count: entries.length });
  } catch (error) {
    const message = error instanceof AiError ? error.message : "Something went wrong reading this page.";
    console.error("extract failed", id, error);
    await supabase.from("pages").update({ status: "failed", error: message }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// Saved entries that each extracted word (or its suggested correction) may duplicate,
// keyed by the entry's index in the extraction.
async function findMatches(
  supabase: NonNullable<Awaited<ReturnType<typeof getUserOrNull>>>["supabase"],
  entries: PageExtraction["entries"],
) {
  const keysPerEntry = entries.map((e) =>
    [...new Set([dutchKey(e.dutch), e.suggestion ? dutchKey(e.suggestion.dutch) : null].filter(Boolean) as string[])],
  );
  const allKeys = [...new Set(keysPerEntry.flat())];
  if (allKeys.length === 0) return {};

  const { data, error } = await supabase.rpc("match_existing_entries", { p_keys: allKeys });
  if (error) {
    console.error("match_existing_entries failed", error);
    return {};
  }

  const matches: Record<string, Match[]> = {};
  keysPerEntry.forEach((keys, index) => {
    const found = new Map<string, Match>();
    for (const row of data ?? []) {
      if (!keys.includes(row.input_key)) continue;
      const prev = found.get(row.entry_id);
      if (!prev || prev.similarity < row.similarity) {
        found.set(row.entry_id, {
          entry_id: row.entry_id,
          dutch: row.dutch,
          english: row.english,
          article: row.article,
          similarity: row.similarity,
        });
      }
    }
    if (found.size) matches[index] = [...found.values()].sort((a, b) => b.similarity - a.similarity).slice(0, 3);
  });
  return matches;
}

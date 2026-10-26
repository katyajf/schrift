"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { EditEntrySchema, FILLABLE_FIELDS } from "@/lib/entry-schema";
import type { Json } from "@/lib/database.types";

const id = z.uuid();

export async function updateEntry(entryId: string, input: unknown): Promise<{ error: string } | void> {
  const parsed = EditEntrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const { supabase } = await requireUser();

  const { data: before } = await supabase.from("entries").select("*").eq("id", id.parse(entryId)).single();
  if (!before) return { error: "Word not found." };

  const values = parsed.data;
  const isNoun = values.word_type === "noun";
  const isVerb = values.word_type === "verb";
  const next = {
    ...values,
    article: isNoun ? values.article : null,
    plural: isNoun ? values.plural : null,
    past_singular: isVerb ? values.past_singular : null,
    past_plural: isVerb ? values.past_plural : null,
    past_participle: isVerb ? values.past_participle : null,
    auxiliary: isVerb ? values.auxiliary : null,
  };

  // A field you edit is no longer AI-generated.
  const sources = { ...((before.field_sources as Record<string, string>) ?? {}) };
  for (const field of FILLABLE_FIELDS) {
    if (next[field] !== before[field]) delete sources[field];
  }

  const { error } = await supabase
    .from("entries")
    .update({ ...next, field_sources: sources as Json })
    .eq("id", entryId);
  if (error) return { error: "Couldn't save your changes." };
  refresh();
}

export async function deleteEntry(entryId: string) {
  const { supabase } = await requireUser();
  await supabase.from("entries").delete().eq("id", id.parse(entryId));
  redirect("/words");
}

export async function addTag(entryId: string, rawName: string): Promise<{ error: string } | void> {
  const name = rawName.trim().replace(/^#/, "").toLowerCase();
  if (!name || name.length > 40) return { error: "Tags are 1–40 characters." };
  const { supabase } = await requireUser();

  let { data: tag } = await supabase.from("tags").select("id").ilike("name", name).maybeSingle();
  if (!tag) {
    const { data: created, error } = await supabase.from("tags").insert({ name }).select("id").single();
    if (error || !created) return { error: "Couldn't create the tag." };
    tag = created;
  }
  await supabase.from("entry_tags").upsert({ entry_id: id.parse(entryId), tag_id: tag.id });
  refresh();
}

export async function removeTag(entryId: string, tagId: string) {
  const { supabase } = await requireUser();
  await supabase.from("entry_tags").delete().eq("entry_id", id.parse(entryId)).eq("tag_id", id.parse(tagId));
  // Drop tags nothing uses any more, so the filter chips stay tidy.
  const { count } = await supabase.from("entry_tags").select("*", { count: "exact", head: true }).eq("tag_id", tagId);
  if (count === 0) await supabase.from("tags").delete().eq("id", tagId);
  refresh();
}

const ExampleInput = z.object({
  dutch: z.string().trim().min(1).max(500),
  english: z.string().trim().max(500).nullable(),
});

export async function addExample(entryId: string, input: unknown): Promise<{ error: string } | void> {
  const parsed = ExampleInput.safeParse(input);
  if (!parsed.success) return { error: "Write a Dutch sentence first." };
  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("example_sentences")
    .select("*", { count: "exact", head: true })
    .eq("entry_id", entryId);
  await supabase.from("example_sentences").insert({
    entry_id: id.parse(entryId),
    dutch: parsed.data.dutch,
    english: parsed.data.english || null,
    source: "notebook",
    position: count ?? 0,
  });
  refresh();
}

export async function deleteExample(exampleId: string) {
  const { supabase } = await requireUser();
  await supabase.from("example_sentences").delete().eq("id", id.parse(exampleId));
  refresh();
}

"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { SavePageSchema } from "@/lib/entry-schema";
import type { Json } from "@/lib/database.types";

export async function discardPage(pageId: string) {
  const id = z.uuid().parse(pageId);
  const { supabase } = await requireUser();
  const { data: page } = await supabase.from("pages").select("storage_path, status").eq("id", id).maybeSingle();
  if (!page || page.status === "saved") return;
  await supabase.storage.from("pages").remove([page.storage_path]);
  await supabase.from("pages").delete().eq("id", id);
  refresh();
}

export async function saveReviewedPage(input: unknown): Promise<{ error: string } | void> {
  const parsed = SavePageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Some entries are invalid." };
  const { pageId, entries } = parsed.data;
  const { supabase } = await requireUser();

  // The article lives in its own column, so "de appel" is stored as "appel".
  const cleaned = entries.map((e) => {
    const match = e.dutch.match(/^(de|het)\s+(.+)$/i);
    if (!match || e.word_type !== "noun") return e;
    return { ...e, dutch: match[2], article: e.article ?? (match[1].toLowerCase() as "de" | "het") };
  });

  const { error } = await supabase.rpc("save_page_entries", {
    p_page_id: pageId,
    p_entries: cleaned as unknown as Json,
  });
  if (error) {
    console.error("save_page_entries failed", error);
    return { error: "Couldn't save. Your edits are still here — try again." };
  }

  redirect(`/words?page=${pageId}`);
}

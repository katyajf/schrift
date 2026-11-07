"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { SetDetailsSchema } from "@/lib/entry-schema";

export async function updateSet(setId: string, input: unknown): Promise<{ error: string } | void> {
  const parsed = SetDetailsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the name and date." };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("pages")
    .update({ title: parsed.data.title, lesson_date: parsed.data.lessonDate })
    .eq("id", z.uuid().parse(setId));
  if (error) return { error: "Couldn't save. Try again." };
  refresh();
}

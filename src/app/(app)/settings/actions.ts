"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export async function saveNewCardLimit(value: number): Promise<{ error: string } | void> {
  const parsed = z.number().int().min(0).max(100).safeParse(value);
  if (!parsed.success) return { error: "Choose a number from 0 to 100." };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, new_cards_per_day: parsed.data });
  if (error) return { error: "Couldn't save." };
  refresh();
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/login");
}

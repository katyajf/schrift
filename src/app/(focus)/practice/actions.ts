"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fromFsrsCard, scheduler, toFsrsCard, type Grade } from "@/lib/fsrs";
import type { Json } from "@/lib/database.types";
import { arrangeLesson } from "@/lib/lesson";
import { loadLessonItems, toSessionItems } from "./load-items";
import type { SessionItem } from "./session";

const GradeInput = z.object({
  cardId: z.uuid(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  expectedReps: z.number().int().min(0),
  durationMs: z.number().int().min(0).max(3_600_000).nullable(),
  exercise: z.string().max(40).default("flashcard"),
});

// The server recomputes the schedule from the stored card, so the client
// only says which button was pressed.
export async function gradeCard(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = GradeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid answer." };
  const { cardId, rating, expectedReps, durationMs, exercise } = parsed.data;
  const { supabase } = await requireUser();

  const { data: row } = await supabase.from("cards").select("*").eq("id", cardId).maybeSingle();
  if (!row) return { ok: false, error: "Card not found." };
  // Already saved (e.g. a retry after a dropped response): nothing to do.
  if (row.reps > expectedReps) return { ok: true };

  const now = new Date();
  const { card, log } = scheduler.next(toFsrsCard(row), now, rating as Grade);

  const { error } = await supabase.rpc("record_review", {
    p_card_id: cardId,
    p_expected_reps: expectedReps,
    p_card: fromFsrsCard(card) as unknown as Json,
    p_log: {
      rating: log.rating,
      state: log.state,
      due: log.due.toISOString(),
      stability: log.stability,
      difficulty: log.difficulty,
      elapsed_days: log.elapsed_days,
      last_elapsed_days: log.last_elapsed_days,
      scheduled_days: log.scheduled_days,
      learning_steps: log.learning_steps,
      reviewed_at: now.toISOString(),
      exercise,
      duration_ms: durationMs,
    },
  });

  if (error) {
    if (error.code === "P0002") return { ok: true }; // graded concurrently; the first one counts
    console.error("record_review failed", error);
    return { ok: false, error: "Couldn't save this answer." };
  }
  return { ok: true };
}

const MoreInput = z.object({
  exclude: z.array(z.uuid()).max(2000),
  count: z.number().int().min(1).max(50).default(10),
});

// "Another lesson" at the end: a freshly picked and shuffled lesson. Call it
// after the answers from the last one are saved, so it sees their new due dates.
export async function loadLesson(): Promise<{ items: SessionItem[] } | { error: string }> {
  const { supabase } = await requireUser();
  try {
    return { items: await loadLessonItems(supabase) };
  } catch (error) {
    console.error("lesson_cards failed", error);
    return { error: "Couldn't load a new lesson." };
  }
}

// "Add new words" at the end of a lesson: random words you haven't studied yet,
// beyond today's new-card limit, skipping cards already in this session.
export async function loadNewCards(input: unknown): Promise<{ items: SessionItem[] } | { error: string }> {
  const parsed = MoreInput.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  const { exclude, count } = parsed.data;
  const { supabase } = await requireUser();

  const { data: cards, error } = await supabase.rpc("random_new_cards", { p_exclude: exclude, p_limit: count });
  if (error) {
    console.error("random_new_cards failed", error);
    return { error: "Couldn't load new words." };
  }
  return { items: arrangeLesson(await toSessionItems(supabase, cards ?? [])) };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardRow, Database } from "@/lib/database.types";
import type { SessionItem } from "./session";

// Turns card rows into what the session screen shows: the card's scheduling
// state, its word, and the first example sentence.
export async function toSessionItems(supabase: SupabaseClient<Database>, cards: CardRow[]): Promise<SessionItem[]> {
  if (!cards.length) return [];
  const entryIds = [...new Set(cards.map((c) => c.entry_id))];
  const [{ data: entries }, { data: examples }] = await Promise.all([
    supabase
      .from("entries")
      .select("id, dutch, english, article, word_type, plural, past_singular, past_plural, past_participle, auxiliary")
      .in("id", entryIds),
    supabase
      .from("example_sentences")
      .select("entry_id, dutch, english, source, position")
      .in("entry_id", entryIds)
      .order("position"),
  ]);

  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));
  const exampleByEntry = new Map<string, { dutch: string; english: string | null; ai: boolean }>();
  for (const ex of examples ?? []) {
    if (!exampleByEntry.has(ex.entry_id)) {
      exampleByEntry.set(ex.entry_id, { dutch: ex.dutch, english: ex.english, ai: ex.source === "ai" });
    }
  }

  return cards.flatMap((card): SessionItem[] => {
    const entry = entryById.get(card.entry_id);
    if (!entry) return [];
    return [
      {
        card: {
          id: card.id,
          kind: card.kind,
          due: card.due,
          stability: card.stability,
          difficulty: card.difficulty,
          elapsed_days: card.elapsed_days,
          scheduled_days: card.scheduled_days,
          learning_steps: card.learning_steps,
          reps: card.reps,
          lapses: card.lapses,
          state: card.state,
          last_review: card.last_review,
        },
        entry,
        example: exampleByEntry.get(card.entry_id) ?? null,
      },
    ];
  });
}

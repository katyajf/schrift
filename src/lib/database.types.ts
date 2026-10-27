// Hand-written to match supabase/migrations. Once the project is linked you can
// regenerate it with: npx supabase gen types typescript --linked > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Rel extends unknown[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: Rel;
};

export type WordType =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "phrase"
  | "preposition"
  | "conjunction"
  | "pronoun"
  | "numeral"
  | "interjection"
  | "other";

export type Article = "de" | "het";
export type Auxiliary = "hebben" | "zijn" | "hebben/zijn";
export type PageStatus = "uploaded" | "extracting" | "review" | "saved" | "failed";
export type SentenceSource = "notebook" | "tutor" | "ai";

export type UserSettingsRow = {
  user_id: string;
  new_cards_per_day: number;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type PageRow = {
  id: string;
  user_id: string;
  storage_path: string;
  source: "photo" | "pdf";
  status: PageStatus;
  extraction: Json | null;
  model: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type EntryRow = {
  id: string;
  user_id: string;
  page_id: string | null;
  dutch: string;
  english: string;
  article: Article | null;
  word_type: WordType;
  plural: string | null;
  past_singular: string | null;
  past_plural: string | null;
  past_participle: string | null;
  auxiliary: Auxiliary | null;
  notes: string | null;
  field_sources: Json;
  dutch_key: string;
  search_text: string;
  enriched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExampleSentenceRow = {
  id: string;
  user_id: string;
  entry_id: string;
  dutch: string;
  english: string | null;
  source: SentenceSource;
  audio_path: string | null;
  position: number;
  created_at: string;
};

export type CardRow = {
  id: string;
  user_id: string;
  entry_id: string;
  kind: "recognise" | "produce";
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  introduced_at: string | null;
  suspended: boolean;
  created_at: string;
};

export type ReviewLogRow = {
  id: string;
  user_id: string;
  card_id: string;
  rating: number;
  state: number;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reviewed_at: string;
  exercise: string;
  duration_ms: number | null;
  answer: string | null;
  correct: boolean | null;
};

export type TagRow = { id: string; user_id: string; name: string; created_at: string };
export type EntryTagRow = { entry_id: string; tag_id: string; user_id: string };

// Insert type: the listed columns are required, generated columns are excluded,
// everything else (defaults, nullables) is optional.
type Generated = "dutch_key" | "search_text";
type Insertable<R, Required extends keyof R> = Pick<R, Required> &
  Partial<Omit<R, Required | Generated & keyof R>>;

export type Database = {
  public: {
    Tables: {
      user_settings: Table<UserSettingsRow, Partial<UserSettingsRow>>;
      pages: Table<
        PageRow,
        Insertable<PageRow, "storage_path">,
        [{ foreignKeyName: "pages_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
      >;
      entries: Table<
        EntryRow,
        Insertable<EntryRow, "dutch">,
        [{ foreignKeyName: "entries_page_id_fkey"; columns: ["page_id"]; isOneToOne: false; referencedRelation: "pages"; referencedColumns: ["id"] }]
      >;
      example_sentences: Table<
        ExampleSentenceRow,
        Insertable<ExampleSentenceRow, "entry_id" | "dutch">,
        [{ foreignKeyName: "example_sentences_entry_id_fkey"; columns: ["entry_id"]; isOneToOne: false; referencedRelation: "entries"; referencedColumns: ["id"] }]
      >;
      tags: Table<TagRow, Insertable<TagRow, "name">>;
      cards: Table<
        CardRow,
        Insertable<CardRow, "entry_id" | "kind">,
        [{ foreignKeyName: "cards_entry_id_fkey"; columns: ["entry_id"]; isOneToOne: false; referencedRelation: "entries"; referencedColumns: ["id"] }]
      >;
      review_logs: Table<
        ReviewLogRow,
        Insertable<ReviewLogRow, "card_id" | "rating" | "state" | "due" | "stability" | "difficulty" | "elapsed_days" | "last_elapsed_days" | "scheduled_days">,
        [{ foreignKeyName: "review_logs_card_id_fkey"; columns: ["card_id"]; isOneToOne: false; referencedRelation: "cards"; referencedColumns: ["id"] }]
      >;
      entry_tags: Table<
        EntryTagRow,
        Insertable<EntryTagRow, "entry_id" | "tag_id">,
        [
          { foreignKeyName: "entry_tags_entry_id_fkey"; columns: ["entry_id"]; isOneToOne: false; referencedRelation: "entries"; referencedColumns: ["id"] },
          { foreignKeyName: "entry_tags_tag_id_fkey"; columns: ["tag_id"]; isOneToOne: false; referencedRelation: "tags"; referencedColumns: ["id"] },
        ]
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      match_existing_entries: {
        Args: { p_keys: string[] };
        Returns: {
          input_key: string;
          entry_id: string;
          dutch: string;
          english: string;
          article: Article | null;
          similarity: number;
        }[];
      };
      save_page_entries: { Args: { p_page_id: string; p_entries: Json }; Returns: number };
      record_review: {
        Args: { p_card_id: string; p_expected_reps: number; p_card: Json; p_log: Json };
        Returns: undefined;
      };
      practice_overview: {
        Args: Record<string, never>;
        Returns: {
          due_count: number;
          new_count: number;
          new_today: number;
          reviews_today: number;
          streak: number;
          studied_today: boolean;
        }[];
      };
      session_cards: { Args: { p_free?: boolean }; Returns: CardRow[] };
      eligible_new_cards: { Args: Record<string, never>; Returns: CardRow[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

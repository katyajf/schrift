# Schrift

A personal Dutch vocabulary app. You photograph notebook pages, AI extracts the words, you review them, and they become a searchable word list (and, from Phase 2, flashcards with spaced repetition).

Built with Next.js 16 (App Router, Cache Components), Supabase (Postgres, Auth, Storage, RLS), Gemini via `@google/genai`, zod and Tailwind 4.

## Where things live

| Path | What |
|---|---|
| `supabase/migrations/` | Database schema, RLS policies, storage bucket, SQL functions |
| `src/lib/ai.ts` | All AI calls (`extractEntriesFromImage`). Swap providers here. |
| `src/lib/entry-schema.ts` | zod schemas shared by AI output, review screen and save action |
| `src/lib/speech/` | `Speaker` interface + Web Speech implementation |
| `src/lib/supabase/` | Browser, server and proxy Supabase clients |
| `src/proxy.ts` | Session refresh + redirect to `/login` (Next 16's renamed middleware) |
| `src/app/(app)/` | Screens with the tab bar: Today, Scan, Words, Settings |
| `src/app/(focus)/` | Full-screen flows: the review screen (later: practice sessions) |
| `src/app/api/pages/[id]/extract/` | Route handler that sends a page photo to Gemini |

## Setup

### 1. Supabase

1. **Apply the schema**, from this folder:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   This creates the tables, RLS policies, the private `pages` storage bucket and its policies. No clicking needed for storage.
2. **Authentication → URL Configuration**
   - Site URL: `https://<your-production-domain>`
   - Redirect URLs:
     - `http://localhost:3000/**`
     - `https://<your-production-domain>/**`
     - `https://*-<your-vercel-team-slug>.vercel.app/**` (preview deployments)
3. *Optional, needs custom SMTP.* **Authentication → Emails → Templates → Magic link**: paste `supabase/templates/magic-link.html`. It contains both a link (token-hash flow, works across browsers) and a 6-digit code. The code matters on iPhone: a home-screen app doesn't share cookies with Safari, so you type the code into the app instead of tapping the link.
4. Sign in once. Then **Authentication → Sign In / Providers → Email** and turn off **Allow new users to sign up**.
5. Optional: the built-in email sender is rate-limited to a few emails per hour. That's fine for one person; add custom SMTP under Authentication → Emails if it gets in the way.

### 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production and Preview), and in `.env.local` for local development (copy `.env.example`):

| Name | Value | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | yes (safe) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key (the legacy anon key also works) | yes (safe, RLS protects data) |
| `GEMINI_API_KEY` | Google AI Studio → API keys | **no**, server only |
| `GEMINI_MODEL` | optional, defaults to `gemini-3.8-flash` | no |
| `ALLOWED_EMAIL` | your email, the only one allowed to sign in | no |

No Supabase service-role key is needed: every query runs as you, and RLS restricts it to your rows.

### 3. Run

```bash
npm install
npm run dev
```

## Regenerating database types

`src/lib/database.types.ts` is hand-written to match the migrations. After linking you can replace it with the generated version:

```bash
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

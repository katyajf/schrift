import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AiBadge, DutchTerm } from "@/components/dutch-term";
import { PlayButton } from "@/components/play-button";
import { EntryEditor, ExampleList, SourcePhoto, TagEditor } from "./entry-parts";

export const metadata = { title: "Word" };

export default function WordPage({ params }: PageProps<"/words/[id]">) {
  return (
    <main className="flex flex-1 flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link href="/words" className="btn-ghost -ml-3 self-start">
        <ArrowLeft className="size-5" aria-hidden /> Words
      </Link>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-muted">
            <Loader2 className="size-6 animate-spin" aria-label="Loading" />
          </div>
        }
      >
        <Word params={params} />
      </Suspense>
    </main>
  );
}

async function Word({ params }: Pick<PageProps<"/words/[id]">, "params">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const [{ data: entry }, { data: examples }, { data: entryTags }, { data: allTags }] = await Promise.all([
    supabase.from("entries").select("*, pages(storage_path, created_at)").eq("id", id).maybeSingle(),
    supabase.from("example_sentences").select("*").eq("entry_id", id).order("position"),
    supabase.from("entry_tags").select("tag_id, tags(id, name)").eq("entry_id", id),
    supabase.from("tags").select("id, name").order("name"),
  ]);
  if (!entry) notFound();

  const page = entry.pages as { storage_path: string; created_at: string } | null;
  const { data: signed } = page
    ? await supabase.storage.from("pages").createSignedUrl(page.storage_path, 3600)
    : { data: null };

  const ai = (entry.field_sources ?? {}) as Record<string, string>;
  const isAi = (f: string) => ai[f] === "ai";
  const spoken = entry.article ? `${entry.article} ${entry.dutch}` : entry.dutch;
  const tags = (entryTags ?? []).flatMap((t) => (t.tags ? [t.tags as { id: string; name: string }] : []));

  const grammar: { label: string; value: string | null; field: string }[] =
    entry.word_type === "noun"
      ? [{ label: "Plural", value: entry.plural, field: "plural" }]
      : entry.word_type === "verb"
        ? [
            { label: "Past", value: [entry.past_singular, entry.past_plural].filter(Boolean).join(" / ") || null, field: "past_singular" },
            { label: "Perfect", value: entry.past_participle && `${entry.auxiliary ?? "hebben"} ${entry.past_participle}`, field: "past_participle" },
          ]
        : [];

  return (
    <article className="flex flex-col gap-8 pt-4 pb-10">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-4xl leading-tight break-words">
            <DutchTerm dutch={entry.dutch} article={entry.article} />
          </h1>
          <PlayButton text={spoken} />
        </div>
        <p className="mt-2 text-xl">
          {entry.english} {isAi("english") && <AiBadge className="align-middle" />}
        </p>
        <p className="mt-1 text-sm text-muted">
          {entry.word_type}
          {entry.article && isAi("article") && (
            <>
              {" "}· article <AiBadge className="align-middle" />
            </>
          )}
        </p>
      </header>

      {grammar.some((g) => g.value) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {grammar.map(
            (g) =>
              g.value && (
                <div key={g.label} className="contents">
                  <dt className="text-sm text-muted">{g.label}</dt>
                  <dd className="flex items-center gap-2 font-dutch text-lg">
                    {g.value} {isAi(g.field) && <AiBadge />}
                    <PlayButton text={g.value} size="sm" />
                  </dd>
                </div>
              ),
          )}
        </dl>
      )}

      <ExampleList entryId={entry.id} examples={examples ?? []} />

      <TagEditor entryId={entry.id} tags={tags} allTags={allTags ?? []} />

      {entry.notes && (
        <section>
          <h2 className="mb-1 text-sm text-muted">Notes</h2>
          <p className="whitespace-pre-wrap">{entry.notes}</p>
        </section>
      )}

      {signed?.signedUrl && entry.page_id && <SourcePhoto url={signed.signedUrl} pageId={entry.page_id} />}

      <p className="text-xs text-muted">
        Added {new Date(entry.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <EntryEditor entry={entry} />
    </article>
  );
}

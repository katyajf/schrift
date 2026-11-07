import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Play } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { DutchTerm } from "@/components/dutch-term";
import { SetHeader } from "./set-editor";

export const metadata = { title: "Set" };

export default function SetPage({ params }: PageProps<"/words/sets/[id]">) {
  return (
    <main className="flex flex-1 flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link href="/words/sets" className="btn-ghost -ml-3 self-start">
        <ArrowLeft className="size-5" aria-hidden /> Sets
      </Link>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-muted">
            <Loader2 className="size-6 animate-spin" aria-label="Loading" />
          </div>
        }
      >
        <SetDetail params={params} />
      </Suspense>
    </main>
  );
}

async function SetDetail({ params }: Pick<PageProps<"/words/sets/[id]">, "params">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: set }, { data: page }, { data: entries }] = await Promise.all([
    supabase.from("set_overview").select("*").eq("id", id).maybeSingle(),
    supabase.from("pages").select("storage_path, source").eq("id", id).maybeSingle(),
    supabase.from("entries").select("id, dutch, english, article").eq("page_id", id).order("created_at").limit(12),
  ]);
  if (!set || !page) notFound();

  const { data: signed } = await supabase.storage.from("pages").createSignedUrl(page.storage_path, 3600);

  return (
    <div className="flex flex-col gap-6 pt-3 pb-8">
      <SetHeader id={set.id} title={set.title ?? "Untitled set"} lessonDate={set.lesson_date} />

      <dl className="flex gap-8">
        <div>
          <dd className="text-3xl tabular-nums">{set.words}</dd>
          <dt className="text-sm text-muted">{set.words === 1 ? "word" : "words"}</dt>
        </div>
        <div>
          <dd className="text-3xl tabular-nums">{set.words_learned}</dd>
          <dt className="text-sm text-muted">learned</dt>
        </div>
      </dl>

      <Link href={`/practice?set=${set.id}`} className="btn-primary gap-2">
        <Play className="size-5" aria-hidden /> Practise this set
      </Link>

      {entries && entries.length > 0 && (
        <section>
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id}>
                <Link href={`/words/${e.id}`} className="flex items-baseline justify-between gap-3 py-2.5">
                  <DutchTerm dutch={e.dutch} article={e.article} className="truncate text-lg" />
                  <span className="truncate text-sm text-muted">{e.english}</span>
                </Link>
              </li>
            ))}
          </ul>
          {set.words > entries.length && (
            <Link href={`/words?page=${set.id}`} className="mt-2 inline-block text-sm text-accent">
              See all {set.words} words
            </Link>
          )}
        </section>
      )}

      {signed?.signedUrl && (
        <a href={signed.signedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-accent">
          <ExternalLink className="size-4" aria-hidden /> {page.source === "pdf" ? "Open the PDF" : "Open the photo"}
        </a>
      )}
    </div>
  );
}

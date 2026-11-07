import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageExtractionSchema } from "@/lib/entry-schema";
import { formatLessonDate } from "@/lib/dates";
import { ReviewEditor } from "./review-editor";

export const metadata = { title: "Review words" };

export default function ReviewPage({ params }: PageProps<"/scan/[pageId]">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-muted">
          <Loader2 className="size-6 animate-spin" aria-label="Loading" />
        </div>
      }
    >
      <Review params={params} />
    </Suspense>
  );
}

async function Review({ params }: Pick<PageProps<"/scan/[pageId]">, "params">) {
  const { pageId } = await params;
  const { supabase } = await requireUser();
  const { data: page } = await supabase
    .from("pages")
    .select("id, status, storage_path, extraction, error, title, lesson_date, source, created_at")
    .eq("id", pageId)
    .maybeSingle();
  if (!page) notFound();

  if (page.status === "saved") {
    return (
      <Message title="Already saved">
        <Link href={`/words?page=${page.id}`} className="btn-secondary">
          See words from this page
        </Link>
      </Message>
    );
  }

  const extraction = PageExtractionSchema.safeParse(page.extraction);
  if (page.status !== "review" || !extraction.success) {
    return (
      <Message title={page.status === "failed" ? "This page couldn't be read" : "This page isn't ready yet"}>
        {page.error && <p className="text-muted">{page.error}</p>}
        <Link href="/scan" className="btn-secondary">
          Back to Scan
        </Link>
      </Message>
    );
  }

  const { data: signed } = await supabase.storage.from("pages").createSignedUrl(page.storage_path, 3600);

  return (
    <ReviewEditor
      pageId={page.id}
      photoUrl={page.source === "pdf" ? null : (signed?.signedUrl ?? null)}
      extraction={extraction.data}
      initialSet={{ title: page.title ?? defaultSetTitle(page.source, page.lesson_date), lessonDate: page.lesson_date }}
    />
  );
}

// "Notebook · 7 Nov" until you name it.
function defaultSetTitle(source: string, lessonDate: string) {
  return `${source === "pdf" ? "Handout" : "Notebook"} · ${formatLessonDate(lessonDate, "short")}`;
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-8">
      <Link href="/scan" className="btn-ghost -ml-3 self-start">
        <ArrowLeft className="size-5" aria-hidden /> Scan
      </Link>
      <h1 className="font-dutch text-2xl">{title}</h1>
      {children}
    </main>
  );
}

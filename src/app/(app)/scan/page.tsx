import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { ScanUploader, type PendingPage } from "./scan-uploader";

export const metadata = { title: "Scan" };

export default function ScanPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pt-8">
      <h1 className="font-dutch text-3xl">Scan</h1>
      <p className="mt-1 text-muted">Photograph notebook pages and turn them into words.</p>
      <Suspense fallback={<ScanUploader userId="" pending={[]} loading />}>
        <ScanContent />
      </Suspense>
    </main>
  );
}

async function ScanContent() {
  const { supabase, userId } = await requireUser();
  const { data: pages } = await supabase
    .from("pages")
    .select("id, status, storage_path, error, extraction, created_at")
    .in("status", ["uploaded", "extracting", "review", "failed"])
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = pages ?? [];
  const { data: signed } = rows.length
    ? await supabase.storage.from("pages").createSignedUrls(rows.map((p) => p.storage_path), 3600)
    : { data: [] };

  const pending: PendingPage[] = rows.map((p, i) => {
    const extraction = p.extraction as { entries?: unknown[] } | null;
    return {
      id: p.id,
      // A page left "extracting" by a closed app or timed-out request can be retried.
      status: p.status === "extracting" ? "uploaded" : p.status,
      error: p.error,
      count: extraction?.entries?.length,
      previewUrl: signed?.[i]?.signedUrl ?? null,
    };
  });

  return <ScanUploader userId={userId} pending={pending} />;
}

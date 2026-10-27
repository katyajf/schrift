"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, Camera, ChevronRight, ImagePlus, Loader2, RotateCw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import type { PageStatus } from "@/lib/database.types";
import { discardPage } from "./actions";

export type PendingPage = {
  id: string;
  status: PageStatus;
  error: string | null;
  count?: number;
  previewUrl: string | null;
};

type Step = "preparing" | "uploading" | PageStatus;
type Item = Omit<PendingPage, "status"> & { status: Step };

const CONCURRENCY = 2;

export function ScanUploader({
  userId,
  pending,
  loading = false,
}: {
  userId: string;
  pending: PendingPage[];
  loading?: boolean;
}) {
  const [items, setItems] = useState<Item[]>(pending);
  const files = useRef(new Map<string, File>()); // kept so a failed upload can be retried
  const queue = useRef<string[]>([]);
  const running = useRef(0);
  const [, startTransition] = useTransition();

  // Pages that came back from the server (e.g. after a refresh) replace stale local copies,
  // but uploads still in flight on this device are kept.
  useEffect(() => {
    setItems((current) => {
      const local = current.filter((i) => !pending.some((p) => p.id === i.id) && files.current.has(i.id));
      return [...local, ...pending];
    });
  }, [pending]);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  async function extract(id: string) {
    update(id, { status: "extracting", error: null });
    try {
      const res = await fetch(`/api/pages/${id}/extract`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A non-JSON 504 means the platform cut the request off.
        const fallback = res.status === 504 ? "Reading took too long. Tap retry." : `Couldn't read this page (error ${res.status}).`;
        throw new Error(body.error ?? fallback);
      }
      update(id, { status: "review", count: body.count });
      files.current.delete(id);
    } catch (error) {
      update(id, { status: "failed", error: error instanceof Error ? error.message : "Couldn't read this page." });
    }
  }

  async function process(id: string) {
    const file = files.current.get(id);
    if (!file) return extract(id);
    const supabase = createClient();
    const path = `${userId}/${id}.jpg`;

    try {
      update(id, { status: "preparing", error: null });
      const blob = await compressImage(file);

      update(id, { status: "uploading" });
      const { error: uploadError } = await supabase.storage
        .from("pages")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw new Error("Upload failed. Check your connection.");

      const { error: insertError } = await supabase.from("pages").upsert({ id, storage_path: path });
      if (insertError) throw new Error("Couldn't save the page.");
    } catch (error) {
      update(id, { status: "failed", error: error instanceof Error ? error.message : "Something went wrong." });
      return;
    }
    await extract(id);
  }

  function pump() {
    while (running.current < CONCURRENCY && queue.current.length) {
      const id = queue.current.shift()!;
      running.current++;
      process(id).finally(() => {
        running.current--;
        pump();
      });
    }
  }

  function enqueue(id: string) {
    queue.current.push(id);
    pump();
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const added: Item[] = [...list].map((file) => {
      const id = crypto.randomUUID();
      files.current.set(id, file);
      return { id, status: "preparing", error: null, previewUrl: URL.createObjectURL(file) };
    });
    setItems((current) => [...added, ...current]);
    added.forEach((item) => enqueue(item.id));
  }

  function discard(id: string) {
    files.current.delete(id);
    setItems((list) => list.filter((i) => i.id !== id));
    startTransition(() => discardPage(id));
  }

  const busy = items.some((i) => ["preparing", "uploading", "extracting"].includes(i.status));

  return (
    <div className="flex flex-1 flex-col">
      <ul className="mt-6 flex flex-col gap-3">
        {items.map((item) => (
          <PageRow key={item.id} item={item} onRetry={() => enqueue(item.id)} onDiscard={() => discard(item.id)} />
        ))}
      </ul>

      {!loading && items.length === 0 && (
        <p className="mt-10 text-center text-muted">
          Pages you scan show up here until you&rsquo;ve reviewed and saved their words.
        </p>
      )}

      <div className="flex-1" />

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-col gap-3 bg-paper pt-4 pb-4">
        {busy && <p className="text-center text-sm text-muted">Keep the app open while pages are being read.</p>}
        {/* capture opens the camera directly; it can't select several photos, hence two buttons */}
        <label className="btn-primary cursor-pointer gap-2">
          <Camera className="size-5" aria-hidden />
          Take photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={loading}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <label className="btn-secondary cursor-pointer">
          <ImagePlus className="size-5" aria-hidden />
          Choose photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={loading}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

const STATUS_TEXT: Partial<Record<Step, string>> = {
  preparing: "Preparing photo…",
  uploading: "Uploading…",
  uploaded: "Waiting to be read",
  extracting: "Reading handwriting…",
};

function PageRow({ item, onRetry, onDiscard }: { item: Item; onRetry: () => void; onDiscard: () => void }) {
  const working = ["preparing", "uploading", "extracting"].includes(item.status);

  const thumb = (
    <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-sunken">
      {item.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs, not optimisable
        <img src={item.previewUrl} alt="" className="size-full object-cover" />
      )}
    </div>
  );

  if (item.status === "review") {
    return (
      <li>
        <Link
          href={`/scan/${item.id}`}
          className="flex items-center gap-4 rounded-2xl border border-line bg-card p-3 active:bg-sunken"
        >
          {thumb}
          <div className="flex-1">
            <p>{item.count === 0 ? "No words found" : `${item.count} ${item.count === 1 ? "word" : "words"} found`}</p>
            <p className="text-sm text-accent">Review and save</p>
          </div>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </Link>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-4 rounded-2xl border border-line bg-card p-3">
      {thumb}
      <div className="min-w-0 flex-1">
        {item.status === "failed" ? (
          <p className="flex items-start gap-1.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {item.error ?? "Something went wrong."}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-muted">
            {working && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {STATUS_TEXT[item.status]}
          </p>
        )}
      </div>
      {(item.status === "failed" || item.status === "uploaded") && (
        <button onClick={onRetry} className="btn-ghost" aria-label="Try again">
          <RotateCw className="size-5" aria-hidden />
        </button>
      )}
      {!working && (
        <button onClick={onDiscard} className="btn-ghost" aria-label="Discard page">
          <X className="size-5" aria-hidden />
        </button>
      )}
    </li>
  );
}

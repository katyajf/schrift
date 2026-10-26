"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, Check, Copy, Eye, EyeOff, Plus, Trash2, Undo2, X } from "lucide-react";
import { AiBadge, ArticleTag } from "@/components/dutch-term";
import {
  AUXILIARIES,
  WORD_TYPES,
  type ExtractedEntry,
  type FillableField,
  type Match,
  type PageExtraction,
  type SaveEntry,
} from "@/lib/entry-schema";
import type { Article } from "@/lib/database.types";
import { saveReviewedPage } from "@/app/(app)/scan/actions";

type FormValues = {
  dutch: string;
  english: string;
  article: "" | Article;
  word_type: SaveEntry["word_type"];
  plural: string;
  past_singular: string;
  past_plural: string;
  past_participle: string;
  auxiliary: "" | (typeof AUXILIARIES)[number];
  examples: { dutch: string; english: string }[];
};

type Row = {
  key: number;
  values: FormValues;
  aiFilled: FillableField[];
  suggestion: ExtractedEntry["suggestion"];
  unsure: boolean;
  matches: Match[];
  // "unresolved" until you decide what to do with a likely duplicate
  dup: "none" | "unresolved" | "merge" | "keep" | "skip";
  mergeInto: string | null;
  state: "pending" | "accepted" | "deleted";
  open: boolean;
};

function toRow(entry: ExtractedEntry, key: number, matches: Match[]): Row {
  return {
    key,
    values: {
      dutch: entry.dutch,
      english: entry.english,
      article: entry.article ?? "",
      word_type: entry.word_type,
      plural: entry.plural ?? "",
      past_singular: entry.past_singular ?? "",
      past_plural: entry.past_plural ?? "",
      past_participle: entry.past_participle ?? "",
      auxiliary: entry.auxiliary ?? "",
      examples: entry.examples.map((e) => ({ dutch: e.dutch, english: e.english ?? "" })),
    },
    aiFilled: entry.ai_filled,
    suggestion: entry.suggestion,
    unsure: entry.unsure,
    matches,
    dup: matches.length ? "unresolved" : "none",
    mergeInto: matches[0]?.entry_id ?? null,
    state: "pending",
    open: false,
  };
}

function toPayload(row: Row): SaveEntry {
  const v = row.values;
  const isNoun = v.word_type === "noun";
  const isVerb = v.word_type === "verb";
  const payload: SaveEntry = {
    dutch: v.dutch.trim(),
    english: v.english.trim(),
    article: isNoun && v.article ? v.article : null,
    word_type: v.word_type,
    plural: isNoun ? v.plural.trim() || null : null,
    past_singular: isVerb ? v.past_singular.trim() || null : null,
    past_plural: isVerb ? v.past_plural.trim() || null : null,
    past_participle: isVerb ? v.past_participle.trim() || null : null,
    auxiliary: isVerb && v.auxiliary ? v.auxiliary : null,
    examples: v.examples
      .filter((e) => e.dutch.trim())
      .map((e) => ({ dutch: e.dutch.trim(), english: e.english.trim() || null })),
    field_sources: {},
    merge_into: row.dup === "merge" ? row.mergeInto : null,
  };
  // Only mark fields that are still AI-provided and actually saved.
  for (const field of row.aiFilled) {
    const value = payload[field];
    if (value !== null && value !== "") payload.field_sources[field] = "ai";
  }
  return payload;
}

export function ReviewEditor({
  pageId,
  photoUrl,
  extraction,
}: {
  pageId: string;
  photoUrl: string | null;
  extraction: PageExtraction;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    extraction.entries.map((e, i) => toRow(e, i, extraction.matches[String(i)] ?? [])),
  );
  const [showPhoto, setShowPhoto] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const nextKey = useRef(extraction.entries.length);

  const updateRow = (key: number, patch: Partial<Row> | ((row: Row) => Partial<Row>)) => {
    setError(null);
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)));
  };

  const toSave = rows.filter((r) => r.state !== "deleted" && r.dup !== "skip");
  const unresolved = toSave.filter((r) => r.dup === "unresolved");

  function addRow() {
    const key = nextKey.current++;
    const blank: ExtractedEntry = {
      dutch: "",
      english: "",
      article: null,
      word_type: "noun",
      plural: null,
      past_singular: null,
      past_plural: null,
      past_participle: null,
      auxiliary: null,
      examples: [],
      ai_filled: [],
      suggestion: null,
      unsure: false,
    };
    setRows((list) => [...list, { ...toRow(blank, key, []), open: true }]);
  }

  function save() {
    setError(null);
    if (unresolved.length) {
      setError("Decide what to do with the words marked “Already saved”.");
      document.getElementById(`row-${unresolved[0].key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const empty = toSave.find((r) => !r.values.dutch.trim());
    if (empty) {
      setError("One of the words has no Dutch. Fill it in or delete it.");
      updateRow(empty.key, { open: true });
      document.getElementById(`row-${empty.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    startSaving(async () => {
      const result = await saveReviewedPage({ pageId, entries: toSave.map(toPayload) });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-3 pt-4">
        <Link href="/scan" className="btn-ghost">
          <ArrowLeft className="size-5" aria-hidden /> Scan
        </Link>
        {photoUrl && (
          <button className="btn-ghost" onClick={() => setShowPhoto((s) => !s)}>
            {showPhoto ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
            {showPhoto ? "Hide photo" : "Show photo"}
          </button>
        )}
      </header>

      {photoUrl && showPhoto && (
        <button
          onClick={() => setZoomed(true)}
          className="mx-5 mt-2 block h-56 overflow-hidden rounded-2xl border border-line bg-sunken"
          aria-label="Zoom photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
          <img src={photoUrl} alt="Notebook page" className="size-full object-cover object-top" />
        </button>
      )}

      <div className="px-5 pt-5 pb-2">
        <h1 className="font-dutch text-2xl">Review words</h1>
        <p className="text-sm text-muted">
          Tap a word to edit it. Swipe right to accept, left to delete.
        </p>
      </div>

      <ul className="flex flex-col gap-3 px-5 pb-6">
        {rows.map((row) => (
          <EntryRow key={row.key} row={row} onChange={(patch) => updateRow(row.key, patch)} />
        ))}
      </ul>

      <button onClick={addRow} className="btn-ghost mx-5 mb-6 self-start">
        <Plus className="size-5" aria-hidden /> Add a word
      </button>

      <div className="flex-1" />

      <div className="sticky bottom-0 z-10 border-t border-line bg-paper/95 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        {error && (
          <p role="alert" className="mb-2 text-sm text-danger">
            {error}
          </p>
        )}
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving
            ? "Saving…"
            : toSave.length === 0
              ? "Finish without saving words"
              : `Save ${toSave.length} ${toSave.length === 1 ? "word" : "words"}`}
        </button>
      </div>

      {zoomed && photoUrl && <ZoomedPhoto url={photoUrl} onClose={() => setZoomed(false)} />}
    </main>
  );
}

// ---------------------------------------------------------------------------

function EntryRow({ row, onChange }: { row: Row; onChange: (patch: Partial<Row> | ((r: Row) => Partial<Row>)) => void }) {
  const swipe = useSwipe({
    enabled: !row.open && row.state !== "deleted",
    onRight: () => onChange({ state: "accepted" }),
    onLeft: () => onChange({ state: "deleted", open: false }),
  });

  const setValue = <K extends keyof FormValues>(field: K, value: FormValues[K]) =>
    onChange((r) => ({
      values: { ...r.values, [field]: value },
      // Once you touch a field it's yours, not the AI's.
      aiFilled: r.aiFilled.filter((f) => f !== field),
    }));

  if (row.state === "deleted") {
    return (
      <li id={`row-${row.key}`} className="flex items-center justify-between rounded-2xl border border-dashed border-line-strong px-4 py-2 text-muted">
        <span className="truncate">
          Deleted · <span className="font-dutch line-through">{row.values.dutch || "empty"}</span>
        </span>
        <button className="btn-ghost" onClick={() => onChange({ state: "pending" })}>
          <Undo2 className="size-4" aria-hidden /> Undo
        </button>
      </li>
    );
  }

  const v = row.values;
  const accepted = row.state === "accepted";
  const skipped = row.dup === "skip";

  return (
    <li
      id={`row-${row.key}`}
      {...swipe.handlers}
      style={swipe.style}
      className={`rounded-2xl border bg-card transition-[border-color,opacity] ${
        accepted ? "border-accent" : row.dup === "unresolved" ? "border-warn" : "border-line"
      } ${skipped ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2 p-4 pb-3">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => onChange((r) => ({ open: !r.open }))}
          aria-expanded={row.open}
        >
          <p className="font-dutch text-2xl leading-tight break-words">
            {v.word_type === "noun" && v.article && (
              <>
                <ArticleTag article={v.article} className="text-base" />{" "}
              </>
            )}
            {v.dutch || <span className="text-muted">New word</span>}
          </p>
          <p className="mt-1 text-muted">
            {v.english || "—"} {row.aiFilled.includes("english") && <AiBadge />}
          </p>
        </button>
        <button
          className={`flex size-11 items-center justify-center rounded-full border ${
            accepted ? "border-accent bg-accent text-accent-ink" : "border-line-strong text-muted"
          }`}
          aria-label={accepted ? "Accepted" : "Accept"}
          aria-pressed={accepted}
          onClick={() => onChange((r) => ({ state: r.state === "accepted" ? "pending" : "accepted" }))}
        >
          <Check className="size-5" aria-hidden />
        </button>
        <button
          className="flex size-11 items-center justify-center rounded-full border border-line-strong text-muted"
          aria-label="Delete"
          onClick={() => onChange({ state: "deleted", open: false })}
        >
          <Trash2 className="size-5" aria-hidden />
        </button>
      </div>

      {(row.unsure || row.suggestion || row.matches.length > 0) && (
        <div className="flex flex-col gap-2 px-4 pb-3">
          {row.unsure && !row.suggestion && (
            <p className="flex items-center gap-1.5 text-sm text-warn">
              <AlertTriangle className="size-4 shrink-0" aria-hidden /> Hard to read — check it against the photo
            </p>
          )}
          {row.suggestion && (
            <div className="rounded-xl bg-warn-soft p-3 text-sm">
              <p>
                Did you mean <span className="font-dutch text-base">{row.suggestion.dutch}</span>?{" "}
                <span className="text-muted">{row.suggestion.reason}</span>
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-secondary min-h-9 px-3 text-sm"
                  onClick={() =>
                    onChange((r) => ({ values: { ...r.values, dutch: r.suggestion!.dutch }, suggestion: null, unsure: false }))
                  }
                >
                  Use correction
                </button>
                <button className="btn-ghost min-h-9 text-sm" onClick={() => onChange({ suggestion: null })}>
                  Keep mine
                </button>
              </div>
            </div>
          )}
          {row.matches.length > 0 && <DuplicateChoice row={row} onChange={onChange} />}
        </div>
      )}

      {row.open && (
        <div className="flex flex-col gap-3 border-t border-line p-4">
          <Field label="Dutch">
            <input className="field font-dutch text-lg" value={v.dutch} onChange={(e) => setValue("dutch", e.target.value)} autoCapitalize="off" />
          </Field>
          <Field label="English" ai={row.aiFilled.includes("english")}>
            <input className="field" value={v.english} onChange={(e) => setValue("english", e.target.value)} />
          </Field>
          <Field label="Word type" ai={row.aiFilled.includes("word_type")}>
            <select className="field" value={v.word_type} onChange={(e) => setValue("word_type", e.target.value as FormValues["word_type"])}>
              {WORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          {v.word_type === "noun" && (
            <>
              <Field label="Article" ai={row.aiFilled.includes("article")}>
                <div className="grid grid-cols-3 gap-2">
                  {(["de", "het", ""] as const).map((a) => (
                    <button
                      key={a || "none"}
                      type="button"
                      aria-pressed={v.article === a}
                      onClick={() => setValue("article", a)}
                      className={`h-11 rounded-xl border font-dutch text-lg ${
                        v.article === a
                          ? a === "de"
                            ? "border-de bg-de-soft text-de"
                            : a === "het"
                              ? "border-het bg-het-soft text-het"
                              : "border-ink"
                          : "border-line-strong text-muted"
                      }`}
                    >
                      {a || <span className="font-sans text-sm">none</span>}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Plural" ai={row.aiFilled.includes("plural")}>
                <input className="field font-dutch" value={v.plural} onChange={(e) => setValue("plural", e.target.value)} autoCapitalize="off" />
              </Field>
            </>
          )}

          {v.word_type === "verb" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Past (ik/hij)" ai={row.aiFilled.includes("past_singular")}>
                <input className="field font-dutch" value={v.past_singular} onChange={(e) => setValue("past_singular", e.target.value)} autoCapitalize="off" />
              </Field>
              <Field label="Past (wij)" ai={row.aiFilled.includes("past_plural")}>
                <input className="field font-dutch" value={v.past_plural} onChange={(e) => setValue("past_plural", e.target.value)} autoCapitalize="off" />
              </Field>
              <Field label="Participle" ai={row.aiFilled.includes("past_participle")}>
                <input className="field font-dutch" value={v.past_participle} onChange={(e) => setValue("past_participle", e.target.value)} autoCapitalize="off" />
              </Field>
              <Field label="Auxiliary" ai={row.aiFilled.includes("auxiliary")}>
                <select className="field" value={v.auxiliary} onChange={(e) => setValue("auxiliary", e.target.value as FormValues["auxiliary"])}>
                  <option value="">—</option>
                  {AUXILIARIES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">Example sentences</span>
            {v.examples.map((ex, i) => (
              <div key={i} className="flex gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <input
                    className="field font-dutch"
                    value={ex.dutch}
                    placeholder="Dutch sentence"
                    onChange={(e) => setValue("examples", v.examples.map((x, j) => (j === i ? { ...x, dutch: e.target.value } : x)))}
                  />
                  <input
                    className="field text-sm"
                    value={ex.english}
                    placeholder="Translation (optional)"
                    onChange={(e) => setValue("examples", v.examples.map((x, j) => (j === i ? { ...x, english: e.target.value } : x)))}
                  />
                </div>
                <button
                  className="btn-ghost self-start"
                  aria-label="Remove sentence"
                  onClick={() => setValue("examples", v.examples.filter((_, j) => j !== i))}
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
            ))}
            <button
              className="btn-ghost self-start text-sm"
              onClick={() => setValue("examples", [...v.examples, { dutch: "", english: "" }])}
            >
              <Plus className="size-4" aria-hidden /> Add sentence
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function DuplicateChoice({ row, onChange }: { row: Row; onChange: (patch: Partial<Row>) => void }) {
  const target = row.matches.find((m) => m.entry_id === row.mergeInto) ?? row.matches[0];
  const options = [
    { value: "merge", label: "Merge" },
    { value: "keep", label: "Keep both" },
    { value: "skip", label: "Skip" },
  ] as const;

  return (
    <div className={`rounded-xl p-3 text-sm ${row.dup === "unresolved" ? "bg-warn-soft" : "bg-sunken"}`}>
      <p className="flex items-start gap-1.5">
        <Copy className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <span>
          {target.similarity >= 0.999 ? "Already saved:" : "Similar to:"}{" "}
          <span className="font-dutch text-base">
            {target.article && <ArticleTag article={target.article} />} {target.dutch}
          </span>{" "}
          <span className="text-muted">— {target.english}</span>
        </span>
      </p>
      {row.matches.length > 1 && (
        <select
          className="field mt-2 py-2 text-sm"
          value={row.mergeInto ?? ""}
          onChange={(e) => onChange({ mergeInto: e.target.value })}
          aria-label="Which saved word"
        >
          {row.matches.map((m) => (
            <option key={m.entry_id} value={m.entry_id}>
              {m.article ? `${m.article} ` : ""}
              {m.dutch} — {m.english}
            </option>
          ))}
        </select>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="What to do with this duplicate">
        {options.map((o) => (
          <button
            key={o.value}
            aria-pressed={row.dup === o.value}
            onClick={() => onChange({ dup: o.value })}
            className={`h-9 rounded-lg border text-sm ${
              row.dup === o.value ? "border-accent bg-accent-soft text-ink" : "border-line-strong bg-card text-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {row.dup === "merge" && <p className="mt-2 text-muted">Fills in anything missing and adds the example sentences.</p>}
    </div>
  );
}

function Field({ label, ai, children }: { label: string; ai?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-sm text-muted">
        {label} {ai && <AiBadge />}
      </span>
      {children}
    </label>
  );
}

function ZoomedPhoto({ url, onClose }: { url: string; onClose: () => void }) {
  const [big, setBig] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white" aria-label="Close photo">
          <X className="size-6" aria-hidden />
        </button>
      </div>
      {/* Tap toggles between fit-to-screen and 2.5× — scroll to pan. */}
      <div className="flex-1 overflow-auto" onClick={() => setBig((b) => !b)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        <img src={url} alt="Notebook page" className={big ? "w-[250%] max-w-none" : "h-full w-full object-contain"} />
      </div>
    </div>
  );
}

// Horizontal swipe on a card. Vertical scrolling is left to the browser (touch-action: pan-y).
function useSwipe({ enabled, onLeft, onRight }: { enabled: boolean; onLeft: () => void; onRight: () => void }) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const THRESHOLD = 90;

  const handlers = enabled
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType === "mouse") return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        },
        onPointerMove: (e: React.PointerEvent) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const x = e.clientX - s.x;
          if (Math.abs(x) > Math.abs(e.clientY - s.y)) setDx(x);
        },
        onPointerUp: () => {
          if (dx > THRESHOLD) onRight();
          else if (dx < -THRESHOLD) onLeft();
          start.current = null;
          setDx(0);
        },
        onPointerCancel: () => {
          start.current = null;
          setDx(0);
        },
      }
    : {};

  const style: React.CSSProperties = {
    touchAction: "pan-y",
    transform: dx ? `translateX(${dx}px)` : undefined,
    transition: dx ? "none" : "transform 150ms ease-out",
    opacity: dx ? Math.max(0.4, 1 - Math.abs(dx) / 300) : undefined,
  };

  return { handlers, style };
}

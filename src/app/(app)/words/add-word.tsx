"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudOff, Plus, RefreshCw, X } from "lucide-react";
import { ARTICLES, WORD_TYPES } from "@/lib/entry-schema";
import { getPending, parsePending, setPending, usePendingRaw, type PendingWord } from "@/lib/pending-words";
import { addWord } from "./actions";

type Form = { dutch: string; english: string; article: "" | (typeof ARTICLES)[number]; word_type: (typeof WORD_TYPES)[number] };
const BLANK: Form = { dutch: "", english: "", article: "", word_type: "noun" };

export function AddWord() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(BLANK);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const dutchRef = useRef<HTMLInputElement>(null);
  const flushing = useRef(false);

  const raw = usePendingRaw();
  const pending = useMemo(() => parsePending(raw), [raw]);

  // Send everything waiting, oldest first. Stops at the first network failure.
  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    setSyncing(true);
    try {
      for (const word of getPending()) {
        if (word.error) continue;
        let result;
        try {
          result = await addWord(word);
        } catch {
          return; // still offline: keep the rest for next time
        }
        const rest = getPending();
        if ("error" in result) {
          setPending(rest.map((w) => (w.id === word.id ? { ...w, error: result.error } : w)));
        } else {
          setPending(rest.filter((w) => w.id !== word.id));
        }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    // Anything left from a previous visit goes out as soon as this page opens.
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const dutch = form.dutch.trim();
    if (!dutch) {
      setMessage("Type a Dutch word first.");
      return;
    }
    const word: PendingWord = {
      id: crypto.randomUUID(),
      dutch,
      english: form.english.trim(),
      article: form.word_type === "noun" && form.article ? form.article : null,
      word_type: form.word_type,
    };
    // Write it down first, so a dropped connection or closed tab can't lose it.
    if (!setPending([...getPending(), word])) {
      setMessage("Couldn't store the word on this device. Check your browser's storage settings.");
      return;
    }
    setMessage(null);
    setForm((f) => ({ ...BLANK, word_type: f.word_type }));
    dutchRef.current?.focus();
    void flush();
  }

  const waiting = pending.filter((w) => !w.error);
  const failed = pending.filter((w) => w.error);

  return (
    <section className="flex flex-col gap-3 px-5 pb-2">
      {open ? (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Add a word</h2>
            <button type="button" className="text-muted" aria-label="Close" onClick={() => setOpen(false)}>
              <X className="size-5" />
            </button>
          </div>
          <input
            ref={dutchRef}
            className="field"
            placeholder="Dutch"
            aria-label="Dutch"
            value={form.dutch}
            onChange={(e) => setForm({ ...form, dutch: e.target.value })}
            autoCapitalize="off"
            autoCorrect="off"
            lang="nl"
            autoFocus
          />
          <input
            className="field"
            placeholder="English"
            aria-label="English"
            value={form.english}
            onChange={(e) => setForm({ ...form, english: e.target.value })}
            autoCapitalize="off"
          />
          <div className="flex gap-2">
            <select
              className="field"
              aria-label="Word type"
              value={form.word_type}
              onChange={(e) => setForm({ ...form, word_type: e.target.value as Form["word_type"] })}
            >
              {WORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {form.word_type === "noun" && (
              <select
                className="field w-28 shrink-0"
                aria-label="Article"
                value={form.article}
                onChange={(e) => setForm({ ...form, article: e.target.value as Form["article"] })}
              >
                <option value="">article</option>
                {ARTICLES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
          </div>
          {message && <p className="text-sm text-danger">{message}</p>}
          <button className="btn-primary min-h-12 text-base" type="submit">
            Add word
          </button>
        </form>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setOpen(true)}>
          <Plus className="size-5" aria-hidden /> Add a word
        </button>
      )}

      {(waiting.length > 0 || failed.length > 0) && (
        <div className="flex flex-col gap-2 rounded-2xl bg-warn-soft p-4 text-sm" role="status">
          {waiting.length > 0 && (
            <>
              <p className="flex items-center gap-2 font-medium">
                {syncing ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : <CloudOff className="size-4" aria-hidden />}
                {waiting.length} saved on this device, {syncing ? "syncing…" : "waiting to sync"}
              </p>
              <ul className="flex flex-col gap-1 text-muted">
                {waiting.map((w) => (
                  <li key={w.id}>
                    {w.article ? `${w.article} ` : ""}
                    {w.dutch}
                    {w.english ? ` — ${w.english}` : ""}
                  </li>
                ))}
              </ul>
              {!syncing && (
                <button className="btn-ghost self-start" onClick={() => void flush()}>
                  Try now
                </button>
              )}
            </>
          )}
          {failed.map((w) => (
            <p key={w.id} className="flex items-start justify-between gap-2 text-danger">
              <span>
                “{w.dutch}” couldn&rsquo;t be saved: {w.error}
              </span>
              <button
                aria-label={`Discard ${w.dutch}`}
                onClick={() => setPending(getPending().filter((p) => p.id !== w.id))}
              >
                <X className="size-4" />
              </button>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

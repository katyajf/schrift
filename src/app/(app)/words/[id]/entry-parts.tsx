"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { AiBadge } from "@/components/dutch-term";
import { PlayButton } from "@/components/play-button";
import { AUXILIARIES, WORD_TYPES } from "@/lib/entry-schema";
import type { EntryRow, ExampleSentenceRow } from "@/lib/database.types";
import { addExample, addTag, deleteEntry, deleteExample, removeTag, updateEntry } from "../actions";

export function ExampleList({ entryId, examples }: { entryId: string; examples: ExampleSentenceRow[] }) {
  const [adding, setAdding] = useState(false);
  const [dutch, setDutch] = useState("");
  const [english, setEnglish] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await addExample(entryId, { dutch, english: english || null });
      if (result?.error) return setError(result.error);
      setDutch("");
      setEnglish("");
      setAdding(false);
      setError(null);
    });
  }

  return (
    <section>
      <h2 className="mb-3 text-sm text-muted">Examples</h2>
      {examples.length === 0 && !adding && <p className="text-muted">No example sentences yet.</p>}
      <ul className="flex flex-col gap-4">
        {examples.map((ex) => (
          <li key={ex.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-dutch text-lg leading-snug">{ex.dutch}</p>
              {ex.english && <p className="text-sm text-muted">{ex.english}</p>}
              {ex.source === "ai" && <AiBadge className="mt-1" />}
              {ex.source === "tutor" && <span className="mt-1 text-[11px] text-muted">from tutor</span>}
            </div>
            <PlayButton text={ex.dutch} size="sm" />
            <button
              className="flex size-9 items-center justify-center rounded-full text-muted active:bg-sunken"
              aria-label="Delete sentence"
              onClick={() => start(() => deleteExample(ex.id))}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <input className="field font-dutch" placeholder="Dutch sentence" value={dutch} onChange={(e) => setDutch(e.target.value)} autoFocus />
          <input className="field" placeholder="Translation (optional)" value={english} onChange={(e) => setEnglish(e.target.value)} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" disabled={pending}>
              Add
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="btn-ghost -ml-3 mt-2 text-sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add sentence
        </button>
      )}
    </section>
  );
}

export function TagEditor({
  entryId,
  tags,
  allTags,
}: {
  entryId: string;
  tags: { id: string; name: string }[];
  allTags: { id: string; name: string }[];
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const suggestions = allTags.filter((t) => !tags.some((x) => x.id === t.id));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    start(async () => {
      const result = await addTag(entryId, name);
      if (result?.error) return setError(result.error);
      setName("");
      setError(null);
    });
  }

  return (
    <section>
      <h2 className="mb-3 text-sm text-muted">Tags</h2>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span key={t.id} className="chip border-accent bg-accent-soft pr-1.5 text-ink">
            #{t.name}
            <button
              aria-label={`Remove tag ${t.name}`}
              className="flex size-6 items-center justify-center rounded-full active:bg-line"
              onClick={() => start(() => removeTag(entryId, t.id))}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        <form onSubmit={submit} className="flex">
          <input
            list="tag-suggestions"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="add tag"
            disabled={pending}
            autoCapitalize="off"
            enterKeyHint="done"
            className="h-9 w-28 rounded-full border border-dashed border-line-strong bg-transparent px-3.5 text-sm outline-none focus:border-accent"
          />
          <datalist id="tag-suggestions">
            {suggestions.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </form>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

export function SourcePhoto({ url, pageId }: { url: string; pageId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button className="flex w-full items-center justify-between text-sm text-muted" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Source page
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img src={url} alt="Notebook page this word came from" className="w-full" />
          </a>
          <Link href={`/words?page=${pageId}`} className="text-sm text-accent">
            All words from this page
          </Link>
        </div>
      )}
    </section>
  );
}

export function EntryEditor({ entry }: { entry: EntryRow }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    dutch: entry.dutch,
    english: entry.english,
    article: entry.article ?? "",
    word_type: entry.word_type,
    plural: entry.plural ?? "",
    past_singular: entry.past_singular ?? "",
    past_plural: entry.past_plural ?? "",
    past_participle: entry.past_participle ?? "",
    auxiliary: entry.auxiliary ?? "",
    notes: entry.notes ?? "",
  });
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await updateEntry(entry.id, form);
      if (result?.error) return setError(result.error);
      setError(null);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="flex gap-3">
        <button className="btn-secondary flex-1" onClick={() => setEditing(true)}>
          Edit
        </button>
        {confirmDelete ? (
          <button className="btn-secondary flex-1 border-danger text-danger" onClick={() => start(() => deleteEntry(entry.id))} disabled={pending}>
            Really delete?
          </button>
        ) : (
          <button className="btn-secondary flex-1 text-danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <Labeled label="Dutch">
        <input className="field font-dutch text-lg" value={form.dutch} onChange={set("dutch")} autoCapitalize="off" />
      </Labeled>
      <Labeled label="English">
        <input className="field" value={form.english} onChange={set("english")} />
      </Labeled>
      <Labeled label="Word type">
        <select className="field" value={form.word_type} onChange={set("word_type")}>
          {WORD_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Labeled>
      {form.word_type === "noun" && (
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Article">
            <select className="field" value={form.article} onChange={set("article")}>
              <option value="">—</option>
              <option value="de">de</option>
              <option value="het">het</option>
            </select>
          </Labeled>
          <Labeled label="Plural">
            <input className="field font-dutch" value={form.plural} onChange={set("plural")} autoCapitalize="off" />
          </Labeled>
        </div>
      )}
      {form.word_type === "verb" && (
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Past (ik/hij)">
            <input className="field font-dutch" value={form.past_singular} onChange={set("past_singular")} autoCapitalize="off" />
          </Labeled>
          <Labeled label="Past (wij)">
            <input className="field font-dutch" value={form.past_plural} onChange={set("past_plural")} autoCapitalize="off" />
          </Labeled>
          <Labeled label="Participle">
            <input className="field font-dutch" value={form.past_participle} onChange={set("past_participle")} autoCapitalize="off" />
          </Labeled>
          <Labeled label="Auxiliary">
            <select className="field" value={form.auxiliary} onChange={set("auxiliary")}>
              <option value="">—</option>
              {AUXILIARIES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Labeled>
        </div>
      )}
      <Labeled label="Notes">
        <textarea className="field min-h-24" value={form.notes} onChange={set("notes")} />
      </Labeled>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <button className="btn-secondary flex-1 border-accent" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

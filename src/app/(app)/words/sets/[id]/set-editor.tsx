"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { formatLessonDate } from "@/lib/dates";
import { updateSet } from "../actions";

export function SetHeader({ id, title, lessonDate }: { id: string; title: string; lessonDate: string }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title, lessonDate });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-dutch text-3xl leading-tight break-words">{title}</h1>
          <p className="mt-1 text-sm text-muted">{formatLessonDate(lessonDate)}</p>
        </div>
        <button className="btn-ghost shrink-0" onClick={() => setEditing(true)} aria-label="Rename set or change date">
          <Pencil className="size-4" aria-hidden /> Edit
        </button>
      </header>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await updateSet(id, form);
          if (result?.error) return setError(result.error);
          setError(null);
          setEditing(false);
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">Set name</span>
        <input className="field" value={form.title} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">Lesson date</span>
        <input type="date" className="field" value={form.lessonDate} onChange={(e) => setForm((f) => ({ ...f, lessonDate: e.target.value }))} />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
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

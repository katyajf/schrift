"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import type { WordType } from "@/lib/database.types";

export type WordFilters = {
  q: string;
  type: WordType | null;
  tag: string | null;
  added: "7" | "30" | null;
  page: string | null;
};

const TYPE_CHIPS: { value: WordType; label: string }[] = [
  { value: "noun", label: "Nouns" },
  { value: "verb", label: "Verbs" },
  { value: "adjective", label: "Adjectives" },
  { value: "phrase", label: "Phrases" },
];

export function WordsToolbar({ tags }: { tags: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isActive = (key: keyof WordFilters, value: string) => searchParams.get(key) === value;

  function navigate(next: Partial<Record<keyof WordFilters, string | null>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function onSearch(value: string) {
    setQ(value);
    // Debounce typing so every keystroke doesn't trigger a server render.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: value.trim() || null }), 250);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const toggle = (key: keyof WordFilters, value: string) => navigate({ [key]: isActive(key, value) ? null : value });

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Search words</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search Dutch or English"
          className="field pl-12"
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </label>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
        {searchParams.get("page") && (
          <button className="chip" aria-pressed onClick={() => navigate({ page: null })}>
            From one page <X className="size-3.5" aria-hidden />
          </button>
        )}
        <button className="chip" aria-pressed={isActive("added", "7")} onClick={() => toggle("added", "7")}>
          This week
        </button>
        <button className="chip" aria-pressed={isActive("added", "30")} onClick={() => toggle("added", "30")}>
          This month
        </button>
        {TYPE_CHIPS.map((c) => (
          <button key={c.value} className="chip" aria-pressed={isActive("type", c.value)} onClick={() => toggle("type", c.value)}>
            {c.label}
          </button>
        ))}
        {tags.map((t) => (
          <button key={t.id} className="chip" aria-pressed={isActive("tag", t.id)} onClick={() => toggle("tag", t.id)}>
            #{t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// Static stand-in while the toolbar streams in; no hooks, so it can prerender.
export function WordsToolbarSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <input className="field pl-12" placeholder="Search Dutch or English" disabled />
      </div>
      <div className="h-9" />
    </div>
  );
}

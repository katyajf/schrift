"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Volume2 } from "lucide-react";
import { setPreferredVoice, useSpeech } from "@/lib/speech/use-speech";
import { saveNewCardLimit } from "./actions";

export function NewCardLimit({ initial }: { initial: number | null }) {
  const [value, setValue] = useState(initial ?? 10);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function change(next: number) {
    const clamped = Math.max(0, Math.min(100, next));
    setValue(clamped);
    start(async () => {
      const result = await saveNewCardLimit(clamped);
      setMessage(result?.error ?? null);
    });
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-card p-4">
      <div>
        <p>New cards per day</p>
        <p className="text-sm text-muted">Each word has two: Dutch → English, then English → Dutch the day after</p>
        {message && <p className="text-sm text-danger">{message}</p>}
      </div>
      <div className="flex items-center gap-1" aria-busy={pending}>
        <button
          className="flex size-10 items-center justify-center rounded-full border border-line-strong text-lg"
          onClick={() => change(value - 5)}
          disabled={initial === null}
          aria-label="Fewer"
        >
          −
        </button>
        <span className="w-10 text-center text-lg tabular-nums">{initial === null ? "–" : value}</span>
        <button
          className="flex size-10 items-center justify-center rounded-full border border-line-strong text-lg"
          onClick={() => change(value + 5)}
          disabled={initial === null}
          aria-label="More"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function VoiceSetting() {
  const { status, voices, voiceId, speak } = useSpeech();
  const selected = voiceId && voices.some((v) => v.id === voiceId) ? voiceId : (voices[0]?.id ?? "");

  if (status === "loading") return <p className="text-muted">Looking for Dutch voices…</p>;

  if (status === "unavailable") {
    return (
      <div className="rounded-2xl bg-warn-soft p-4 text-sm">
        <p className="font-medium">No Dutch voice on this device</p>
        <p className="mt-1">
          Audio stays off rather than using an English voice. To add one: on iPhone, go to Settings → Accessibility →
          Spoken Content → Voices → Dutch and download an “Enhanced” voice. On Android, install Dutch in Google
          Text-to-speech. Then reopen the app.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select className="field flex-1" value={selected} onChange={(e) => setPreferredVoice(e.target.value)} aria-label="Dutch voice">
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} ({v.lang})
          </option>
        ))}
      </select>
      <button className="btn-secondary w-12 px-0" onClick={() => speak("Goedemorgen! Hoe gaat het met je?")} aria-label="Test voice">
        <Volume2 className="size-5" aria-hidden />
      </button>
    </div>
  );
}

type Theme = "system" | "light" | "dark";
const themeListeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function writeTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {}
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  themeListeners.forEach((l) => l());
}

export function ThemeSetting() {
  const theme = useSyncExternalStore(
    (cb) => {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
    readTheme,
    () => "system" as Theme,
  );

  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
      {(["system", "light", "dark"] as const).map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          onClick={() => writeTheme(t)}
          className={`h-11 rounded-xl border capitalize ${theme === t ? "border-accent bg-accent-soft" : "border-line-strong text-muted"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

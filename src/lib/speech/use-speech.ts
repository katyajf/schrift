"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BrowserSpeaker } from "./browser";
import type { Speaker, SpeakerVoice } from "./types";

// The one place that picks the speaker implementation.
let speaker: Speaker | null = null;
function getSpeaker() {
  speaker ??= new BrowserSpeaker();
  return speaker;
}

// The chosen voice is per device (voices differ between phone and laptop),
// so it lives in localStorage rather than the database.
const VOICE_KEY = "voice";
const listeners = new Set<() => void>();
function readVoice() {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}
function subscribeVoice(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function setPreferredVoice(id: string | null) {
  try {
    if (id) localStorage.setItem(VOICE_KEY, id);
    else localStorage.removeItem(VOICE_KEY);
  } catch {}
  listeners.forEach((l) => l());
}

export type SpeechStatus = "loading" | "ready" | "unavailable";

export function useSpeech() {
  const [voices, setVoices] = useState<SpeakerVoice[]>([]);
  const [status, setStatus] = useState<SpeechStatus>("loading");
  const voiceId = useSyncExternalStore(subscribeVoice, readVoice, () => null);

  useEffect(() => {
    let cancelled = false;
    getSpeaker()
      .listVoices()
      .then((list) => {
        if (cancelled) return;
        setVoices(list);
        setStatus(list.length ? "ready" : "unavailable");
      })
      .catch(() => !cancelled && setStatus("unavailable"));
    return () => {
      cancelled = true;
    };
  }, []);

  const speak = useCallback((text: string) => getSpeaker().speak(text, { voiceId }), [voiceId]);
  const stop = useCallback(() => getSpeaker().stop(), []);

  return { status, voices, voiceId, speak, stop };
}

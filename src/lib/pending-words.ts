import { useSyncExternalStore } from "react";
import type { AddWordInput } from "@/lib/entry-schema";

// Words typed while offline wait here, in this browser, until they can be sent.
// Every storage call is wrapped: private windows and blocked storage throw.

export type PendingWord = AddWordInput & {
  // Set when the server refused the word, so it isn't retried forever.
  error?: string;
};

const KEY = "schrift:pending-words";
const CHANGED = "schrift:pending-words-changed";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function parsePending(raw: string): PendingWord[] {
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? (list as PendingWord[]) : [];
  } catch {
    return [];
  }
}

export function getPending(): PendingWord[] {
  return parsePending(read());
}

/** Returns false if the browser refused to store it (the word would be lost). */
export function setPending(list: PendingWord[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGED));
  return true;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange); // another tab changed the queue
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// The raw string is the snapshot, so React sees a stable value between changes.
export function usePendingRaw(): string {
  return useSyncExternalStore(subscribe, read, () => "[]");
}

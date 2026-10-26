"use client";

import { useSyncExternalStore } from "react";

// Rendered on the client so the greeting and date use your phone's clock,
// not the server's (Vercel runs in UTC).
function greeting(hour: number) {
  if (hour < 6) return "Goedenacht";
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

const subscribe = () => () => {};

export function Greeting() {
  const now = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
  const date = now === null ? null : new Date(now * 60_000);

  return (
    <header className="min-h-20">
      <p className="text-sm text-muted">
        {date?.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" }) ?? " "}
      </p>
      <h1 className="mt-1 font-dutch text-4xl">{date ? greeting(date.getHours()) : " "}</h1>
    </header>
  );
}

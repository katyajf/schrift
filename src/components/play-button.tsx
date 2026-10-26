"use client";

import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useSpeech } from "@/lib/speech/use-speech";

export function PlayButton({ text, className = "", size = "md" }: { text: string; className?: string; size?: "sm" | "md" }) {
  const { status, speak } = useSpeech();
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState(false);
  const box = size === "sm" ? "size-9" : "size-11";
  const icon = size === "sm" ? "size-[18px]" : "size-5";

  async function play(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (status === "unavailable") {
      setNotice(true);
      setTimeout(() => setNotice(false), 2500);
      return;
    }
    setPlaying(true);
    try {
      await speak(text);
    } finally {
      setPlaying(false);
    }
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={play}
        aria-label={status === "unavailable" ? "No Dutch voice on this device" : `Play “${text}”`}
        className={`${box} flex shrink-0 items-center justify-center rounded-full transition ${
          playing ? "bg-accent-soft text-accent" : "text-muted active:bg-sunken"
        }`}
      >
        {status === "unavailable" ? <VolumeX className={icon} aria-hidden /> : <Volume2 className={icon} aria-hidden />}
      </button>
      {notice && (
        <span role="status" className="absolute top-full right-0 z-10 mt-1 w-52 rounded-lg bg-ink px-3 py-2 text-xs text-paper">
          This device has no Dutch voice. See Settings for how to add one.
        </span>
      )}
    </span>
  );
}

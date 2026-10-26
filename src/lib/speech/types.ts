// Anything that can say Dutch out loud. The browser's Web Speech API is the
// first implementation; Gemini TTS with cached files can be added in Phase 3.

export type SpeakerVoice = {
  id: string;
  name: string;
  lang: string;
};

export interface Speaker {
  /** Dutch voices this speaker can use, best first. Empty = can't speak Dutch here. */
  listVoices(): Promise<SpeakerVoice[]>;
  speak(text: string, options?: { voiceId?: string | null; rate?: number }): Promise<void>;
  stop(): void;
}

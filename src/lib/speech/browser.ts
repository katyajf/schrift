import type { Speaker, SpeakerVoice } from "./types";

// Higher score = more natural-sounding. Names vary per OS/browser:
// Apple ("Xander (Enhanced)", "Claire (Premium)"), Google ("Google Nederlands"),
// Microsoft Edge ("Microsoft Fenna Online (Natural)").
function score(voice: SpeechSynthesisVoice) {
  let s = 0;
  const lang = voice.lang.replace("_", "-").toLowerCase();
  if (lang === "nl-nl") s += 20;
  else if (lang === "nl-be") s += 10;
  if (/premium|enhanced|natural|neural|online/i.test(voice.name)) s += 30;
  if (/google/i.test(voice.name)) s += 15;
  if (/compact|eloquence/i.test(voice.name)) s -= 10;
  return s;
}

function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  // Chrome loads voices asynchronously; Safari sometimes never fires the event.
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

export class BrowserSpeaker implements Speaker {
  private voices: SpeechSynthesisVoice[] | null = null;

  static isSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private async dutchVoices() {
    if (!BrowserSpeaker.isSupported()) return [];
    if (!this.voices?.length) {
      this.voices = (await waitForVoices())
        .filter((v) => v.lang.toLowerCase().startsWith("nl"))
        .sort((a, b) => score(b) - score(a));
    }
    return this.voices;
  }

  async listVoices(): Promise<SpeakerVoice[]> {
    return (await this.dutchVoices()).map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }));
  }

  async speak(text: string, options: { voiceId?: string | null; rate?: number } = {}) {
    const voices = await this.dutchVoices();
    // Never fall back to a non-Dutch voice: it would teach the wrong pronunciation.
    if (!voices.length) throw new Error("No Dutch voice available");
    const voice = voices.find((v) => v.voiceURI === options.voiceId) ?? voices[0];

    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = options.rate ?? 0.9;

    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
  }

  stop() {
    if (BrowserSpeaker.isSupported()) window.speechSynthesis.cancel();
  }
}

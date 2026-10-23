import type { Mood } from "../engine/expression";

/** One recorded line. Produced by `npm run voices`, listed in voices/manifest.ts. */
export interface VoiceClip {
  /** File in voices/ (16-bit mono WAV). */
  file: string;
  duration: number;
  /** Loudness for lip sync, 60 samples per second. */
  envelope: string;
  provider: string;
  voice: string;
  text: string;
}

/**
 * Pure helpers shared by the engine (browser + node) and the voice generator (node only).
 * A spoken line is identified by a hash of (voice, text, mood), so the same line is only ever
 * generated once and re-renders read it from voices/.
 */

/** Delivery tags like [angry] or [whispers] steer ElevenLabs v3; they're never shown in bubbles. */
export const stripTags = (text: string) => text.replace(/\[[^\]]*\]\s*/g, "").trim();

/** FNV-1a, 32-bit, as 8 hex chars. Stable across node and browser. */
const hash = (value: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

export const lineKey = (voice: string, text: string, mood: Mood) => hash(`${voice}|${mood}|${text}`);

/**
 * Recorded clips are data, not code: the CLI registers voices/manifest.ts at startup, the render bundle gets the
 * scene's clips through inputProps, tests register their own. Keeping the manifest out of the engine means a new
 * recording never changes the webpack bundle.
 */
let registry: Record<string, VoiceClip> = {};
export const registerVoiceClips = (clips: Record<string, VoiceClip>) => {
  registry = { ...registry, ...clips };
};
export const findVoiceClip = (key: string): VoiceClip | undefined => registry[key];

/** Loudness (0..1) of a clip at `time` seconds, for lip sync. Envelope is 60 samples/s, one char each ("0"–"z"). */
export const ENVELOPE_RATE = 60;
const ENVELOPE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const encodeEnvelope = (levels: number[]) =>
  levels.map((level) => ENVELOPE_ALPHABET[Math.max(0, Math.min(61, Math.round(level * 61)))]).join("");
export const envelopeAt = (envelope: string, time: number) => {
  const index = Math.floor(time * ENVELOPE_RATE);
  if (index < 0 || index >= envelope.length) return 0;
  return ENVELOPE_ALPHABET.indexOf(envelope[index]) / 61;
};

/** Without a recorded clip, estimate how long a line takes to say (~2.8 words/s + a beat). */
export const estimateSpeechDuration = (text: string) => {
  const words = stripTags(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1.1, 0.5 + words / 2.8);
};

/** How the line should be performed for a given mood (ElevenLabs v3 audio tags). */
export const deliveryTags = (mood: Mood, text: string) => {
  if (/\[[^\]]+\]/.test(text)) return text; // the scene already directs the line
  const shouting = /!!|[A-Z]{3,}/.test(text);
  const tag: Record<Mood, string> = {
    neutral: "", happy: "[happy] ", angry: shouting ? "[shouting] [angry] " : "[angry] ", scared: "[nervous] [scared] ",
    shocked: "[surprised] ", smug: "[confident] [smug] ", sad: "[sad] ", pain: "[pained] [groaning] ", dazed: "[groggy] ",
  };
  return `${tag[mood]}${text}`;
};

import { clamp01, lerp } from "./math";

/**
 * Face parameters. Every character's face is driven by these, so moods work on everyone.
 * - browTilt: radians. Positive = inner ends up (worried/scared), negative = inner ends down (angry).
 * - browRaise: meters the brows move up.
 * - eyeScale: size of the eyes. sclera: 0 = cartoon dot eyes, 1 = wide white eyes with small pupils (fear/shock).
 * - mouthCurve: + smile, − frown. mouthOpen: resting open amount (0..1). mouthSkew: smirk to one side.
 * - redness: face flushes red (anger). sweat: nervous sweat drop. tremble: shaking head.
 */
export interface Face {
  browTilt: number;
  browRaise: number;
  eyeScale: number;
  sclera: number;
  mouthCurve: number;
  mouthOpen: number;
  mouthSkew: number;
  redness: number;
  sweat: number;
  tremble: number;
}

export const MOODS = {
  neutral: { browTilt: 0, browRaise: 0, eyeScale: 1, sclera: 0, mouthCurve: 0.15, mouthOpen: 0, mouthSkew: 0, redness: 0, sweat: 0, tremble: 0 },
  happy: { browTilt: 0.1, browRaise: 0.02, eyeScale: 1, sclera: 0, mouthCurve: 1, mouthOpen: 0.2, mouthSkew: 0, redness: 0, sweat: 0, tremble: 0 },
  angry: { browTilt: -0.55, browRaise: -0.02, eyeScale: 0.9, sclera: 0, mouthCurve: -0.8, mouthOpen: 0.15, mouthSkew: 0, redness: 0.55, sweat: 0, tremble: 0.15 },
  scared: { browTilt: 0.5, browRaise: 0.04, eyeScale: 1.25, sclera: 1, mouthCurve: -0.5, mouthOpen: 0.45, mouthSkew: 0, redness: 0, sweat: 1, tremble: 0.6 },
  shocked: { browTilt: 0.15, browRaise: 0.05, eyeScale: 1.3, sclera: 1, mouthCurve: 0, mouthOpen: 0.8, mouthSkew: 0, redness: 0, sweat: 0, tremble: 0 },
  smug: { browTilt: -0.15, browRaise: 0.01, eyeScale: 0.85, sclera: 0, mouthCurve: 0.6, mouthOpen: 0, mouthSkew: 1, redness: 0, sweat: 0, tremble: 0 },
  sad: { browTilt: 0.45, browRaise: 0, eyeScale: 0.95, sclera: 0, mouthCurve: -0.9, mouthOpen: 0, mouthSkew: 0, redness: 0, sweat: 0, tremble: 0 },
  /** Wincing: squeezed eyes, worried brows, grimace. */
  pain: { browTilt: 0.6, browRaise: -0.01, eyeScale: 0.45, sclera: 0, mouthCurve: -0.7, mouthOpen: 0.3, mouthSkew: 0.3, redness: 0.1, sweat: 0.6, tremble: 0.3 },
  /** Knocked out: eyes shut, mouth slack. */
  dazed: { browTilt: 0.2, browRaise: 0, eyeScale: 0.12, sclera: 0, mouthCurve: -0.2, mouthOpen: 0.35, mouthSkew: 0.6, redness: 0, sweat: 0, tremble: 0 },
} satisfies Record<string, Face>;

export type Mood = keyof typeof MOODS;
export const MOOD_NAMES = Object.keys(MOODS) as Mood[];

const FACE_KEYS = Object.keys(MOODS.neutral) as (keyof Face)[];
const BLEND_TIME = 0.25;

/** Face at time t given mood changes ({time, mood}) sorted by time. Each change blends in over 0.25s. */
export const faceAt = (changes: { time: number; mood: Mood }[], t: number): Face => {
  let face: Face = { ...MOODS.neutral };
  for (const change of changes) {
    if (change.time > t) break;
    const weight = clamp01((t - change.time) / BLEND_TIME);
    const smooth = weight * weight * (3 - 2 * weight);
    const target = MOODS[change.mood];
    const next = { ...face };
    for (const key of FACE_KEYS) next[key] = lerp(face[key], target[key], smooth);
    face = next;
  }
  return face;
};

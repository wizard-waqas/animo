import { RIG } from "../catalog/characters";
import { clamp, clamp01, lerp } from "./math";

/**
 * Joint angles in radians. Sign conventions (character facing +Z):
 * - *ShoulderX / *HipX: positive swings the limb forward.
 * - *ShoulderZ: positive raises the arm out to the side (both arms).
 * - *Elbow / *Knee: positive bends (elbow forward, knee backward).
 * - headX: positive looks down. headY: positive looks to the character's left. spineX: positive leans forward.
 * - rootY: vertical offset of the whole body in meters (unscaled). squash: vertical scale for cartoon squash & stretch.
 */
export interface Pose {
  rootY: number;
  spineX: number;
  spineY: number;
  spineZ: number;
  headX: number;
  headY: number;
  headZ: number;
  lShoulderX: number;
  lShoulderZ: number;
  lElbow: number;
  rShoulderX: number;
  rShoulderZ: number;
  rElbow: number;
  lHipX: number;
  lKnee: number;
  rHipX: number;
  rKnee: number;
  squash: number;
}

export const NEUTRAL_POSE: Pose = {
  rootY: 0, spineX: 0, spineY: 0, spineZ: 0, headX: 0, headY: 0, headZ: 0,
  lShoulderX: 0, lShoulderZ: 0.08, lElbow: 0.15, rShoulderX: 0, rShoulderZ: 0.08, rElbow: 0.15,
  lHipX: 0, lKnee: 0, rHipX: 0, rKnee: 0, squash: 1,
};

const POSE_KEYS = Object.keys(NEUTRAL_POSE) as (keyof Pose)[];
export const UPPER_BODY_KEYS: (keyof Pose)[] = [
  "spineX", "spineY", "spineZ", "headX", "headY", "headZ",
  "lShoulderX", "lShoulderZ", "lElbow", "rShoulderX", "rShoulderZ", "rElbow",
];

export const withPose = (overrides: Partial<Pose>): Pose => ({ ...NEUTRAL_POSE, ...overrides });

export const blendPose = (from: Pose, to: Pose, weight: number, keys: (keyof Pose)[] = POSE_KEYS): Pose => {
  if (weight <= 0) return from;
  const result = { ...from };
  for (const key of keys) result[key] = lerp(from[key], to[key], weight);
  return result;
};

const TAU = Math.PI * 2;
const wave = (t: number, hz: number, phase = 0) => Math.sin(TAU * hz * t + phase);
/** 0→1→0 envelope with soft edges, so clips start and end on the neutral pose. */
export const envelope = (time: number, duration: number, fade = 0.22) => {
  const fadeTime = Math.min(fade, duration / 2);
  const fadeIn = clamp01(time / fadeTime);
  const fadeOut = clamp01((duration - time) / fadeTime);
  const smooth = (x: number) => x * x * (3 - 2 * x);
  return smooth(Math.min(fadeIn, fadeOut));
};

export const idlePose = (time: number): Pose =>
  withPose({
    spineX: 0.02 * wave(time, 0.3),
    headY: 0.06 * wave(time, 0.13, 1),
    lShoulderZ: 0.09 + 0.02 * wave(time, 0.3),
    rShoulderZ: 0.09 + 0.02 * wave(time, 0.3),
    squash: 1 + 0.012 * wave(time, 0.3),
  });

/** Car-seat pose: legs stretched forward into the footwell so feet stay hidden inside the car body. */
export const SIT_POSE: Pose = withPose({
  lHipX: 1.4, rHipX: 1.4, lKnee: 0.45, rKnee: 0.45,
  lShoulderX: 0.7, rShoulderX: 0.7, lElbow: 0.9, rElbow: 0.9, lShoulderZ: 0.15, rShoulderZ: 0.15,
});

// ---------------------------------------------------------------------------
// Walk / run gait. Legs are driven by distance travelled, so feet don't slide.

export const STRIDE = { walk: 1.15, run: 1.9 } as const;

/**
 * Foot offset ahead of the hip for a leg at cycle phase p (0..1).
 * First half: stance (foot planted, moves back at exactly body speed). Second half: swing.
 */
const legCycle = (p: number, stride: number) => {
  const halfStride = stride / 2;
  if (p < 0.5) return { offset: halfStride / 2 - halfStride * (p / 0.5), lift: 0 };
  const swing = (p - 0.5) / 0.5;
  return { offset: -halfStride / 2 + halfStride * (0.5 - 0.5 * Math.cos(Math.PI * swing)), lift: Math.sin(Math.PI * swing) };
};

/**
 * @param distance unscaled meters walked (divide world distance by character height)
 * @param weight 0 = standing, 1 = full gait (scale with current speed)
 */
export const gaitPose = (distance: number, run: boolean, weight: number): Pose => {
  const stride = run ? STRIDE.run : STRIDE.walk;
  const phase = (((distance / stride + 0.25) % 1) + 1) % 1;
  const left = legCycle(phase, stride);
  const right = legCycle((phase + 0.5) % 1, stride);
  const legAngle = (offset: number) => Math.asin(clamp(offset / RIG.legLength, -0.95, 0.95));
  const leftAngle = legAngle(left.offset);
  const rightAngle = legAngle(right.offset);
  const stanceAngle = phase < 0.5 ? leftAngle : rightAngle;
  const kneeLift = run ? 1.7 : 0.95;
  const flight = run ? 0.06 * Math.abs(Math.sin(TAU * phase)) : 0;

  const gait = withPose({
    rootY: RIG.legLength * Math.cos(stanceAngle) - RIG.legLength + flight,
    spineX: run ? 0.22 : 0.05,
    spineY: 0.12 * (leftAngle - rightAngle),
    headX: run ? -0.12 : -0.02,
    lHipX: leftAngle + left.lift * 0.35,
    rHipX: rightAngle + right.lift * 0.35,
    lKnee: left.lift * kneeLift + (run ? 0.25 : 0.05),
    rKnee: right.lift * kneeLift + (run ? 0.25 : 0.05),
    lShoulderX: -leftAngle * (run ? 1.6 : 1.1),
    rShoulderX: -rightAngle * (run ? 1.6 : 1.1),
    lElbow: run ? 1.5 : 0.3,
    rElbow: run ? 1.5 : 0.3,
    lShoulderZ: 0.12,
    rShoulderZ: 0.12,
  });
  return blendPose(NEUTRAL_POSE, gait, weight);
};

// ---------------------------------------------------------------------------
// Clips. "gesture" clips only move the upper body, so they layer on top of walking or sitting.
// "body" clips take over the whole body and the character stands in place.

export interface ClipDefinition {
  layer: "gesture" | "body";
  defaultDuration: number;
  description: string;
  pose: (time: number, duration: number) => Pose;
}

export const CLIPS = {
  wave: {
    layer: "gesture", defaultDuration: 2, description: "Right arm up, waving side to side",
    pose: (t) => withPose({ rShoulderZ: 2.45 + 0.28 * wave(t, 2.4), rShoulderX: 0.25, rElbow: 0.45, headZ: 0.08, spineZ: -0.04 }),
  },
  "wave-both": {
    layer: "gesture", defaultDuration: 2, description: "Both arms waving overhead (excited)",
    pose: (t) => withPose({
      lShoulderZ: 2.5 + 0.3 * wave(t, 2.6), rShoulderZ: 2.5 + 0.3 * wave(t, 2.6, Math.PI),
      lElbow: 0.3, rElbow: 0.3, spineX: -0.06,
    }),
  },
  point: {
    layer: "gesture", defaultDuration: 1.6, description: "Points forward with the right arm",
    pose: () => withPose({ rShoulderX: 1.45, rShoulderZ: 0.05, rElbow: 0.05, spineY: 0.12, headX: -0.05 }),
  },
  cheer: {
    layer: "gesture", defaultDuration: 1.8, description: "Fists pumping overhead",
    pose: (t) => withPose({
      lShoulderZ: 2.65 + 0.18 * wave(t, 3), rShoulderZ: 2.65 + 0.18 * wave(t, 3),
      lElbow: 0.5 + 0.4 * wave(t, 3), rElbow: 0.5 + 0.4 * wave(t, 3), spineX: -0.12, headX: -0.18,
    }),
  },
  clap: {
    layer: "gesture", defaultDuration: 1.6, description: "Claps in front of the chest",
    pose: (t) => {
      const open = 0.5 + 0.5 * wave(t, 3);
      return withPose({ lShoulderX: 0.95, rShoulderX: 0.95, lShoulderZ: -0.3 + 0.45 * open, rShoulderZ: -0.3 + 0.45 * open, lElbow: 1.0, rElbow: 1.0 });
    },
  },
  nod: {
    layer: "gesture", defaultDuration: 1.2, description: "Nods yes",
    pose: (t) => withPose({ headX: 0.12 + 0.18 * wave(t, 2.2) }),
  },
  "shake-head": {
    layer: "gesture", defaultDuration: 1.2, description: "Shakes head no",
    pose: (t) => withPose({ headY: 0.45 * wave(t, 2.4) }),
  },
  shrug: {
    layer: "gesture", defaultDuration: 1.4, description: "Palms up shrug, head tilt",
    pose: () => withPose({ lShoulderZ: 0.55, rShoulderZ: 0.55, lShoulderX: 0.3, rShoulderX: 0.3, lElbow: 1.5, rElbow: 1.5, headZ: 0.22 }),
  },
  think: {
    layer: "gesture", defaultDuration: 2, description: "Hand on chin, head tilted",
    pose: () => withPose({ rShoulderX: 0.75, rShoulderZ: -0.1, rElbow: 2.35, headZ: -0.12, headX: 0.08, lShoulderX: 0.5, lElbow: 1.4, lShoulderZ: -0.2 }),
  },
  facepalm: {
    layer: "gesture", defaultDuration: 1.6, description: "Hand slaps face, head drops",
    pose: () => withPose({ rShoulderX: 1.05, rShoulderZ: -0.15, rElbow: 2.45, headX: 0.35, spineX: 0.1 }),
  },
  "look-around": {
    layer: "gesture", defaultDuration: 2.4, description: "Looks left then right",
    pose: (t, d) => withPose({ headY: 0.75 * Math.sin((TAU * t) / d) }),
  },
  "phone-call": {
    layer: "gesture", defaultDuration: 2.5, description: "Holds a phone to the ear",
    pose: (t) => withPose({ rShoulderX: 0.35, rShoulderZ: 0.35, rElbow: 2.55, headZ: -0.15 + 0.03 * wave(t, 0.8) }),
  },
  yell: {
    layer: "gesture", defaultDuration: 2, description: "Angry yelling: leans in, arms jabbing forward",
    pose: (t) => withPose({
      spineX: 0.18, headX: -0.15, headZ: 0.08 * wave(t, 2.5),
      rShoulderX: 0.9 + 0.35 * wave(t, 3), rElbow: 0.6 + 0.4 * wave(t, 3),
      lShoulderX: 0.6 + 0.3 * wave(t, 3, Math.PI), lShoulderZ: 0.35, lElbow: 1.2,
    }),
  },
  "arms-crossed": {
    layer: "gesture", defaultDuration: 2.5, description: "Arms crossed, chin up (confident / smug)",
    pose: () => withPose({
      lShoulderX: 0.75, rShoulderX: 0.8, lShoulderZ: -0.15, rShoulderZ: -0.15, lElbow: 2.1, rElbow: 2.05,
      headX: -0.1, spineX: -0.05,
    }),
  },
  cower: {
    layer: "body", defaultDuration: 2.5, description: "Scared: knees bent, hands up by the face, trembling",
    pose: (t) => withPose({
      rootY: -0.08, lKnee: 0.45, rKnee: 0.45, lHipX: 0.25, rHipX: 0.25, spineX: -0.12 + 0.02 * wave(t, 9),
      lShoulderX: 1.0, rShoulderX: 1.0, lShoulderZ: 0.3, rShoulderZ: 0.3, lElbow: 2.2 + 0.08 * wave(t, 11), rElbow: 2.2 + 0.08 * wave(t, 11, 1),
      headX: 0.05, headZ: 0.04 * wave(t, 13), squash: 0.97,
    }),
  },
  jump: {
    layer: "body", defaultDuration: 1.0, description: "Crouch, jump with arms up, squash on landing",
    pose: (t, d) => {
      const u = t / d;
      if (u < 0.25) {
        const crouch = Math.sin((u / 0.25) * (Math.PI / 2));
        return withPose({ rootY: -0.12 * crouch, lKnee: 0.8 * crouch, rKnee: 0.8 * crouch, lHipX: 0.4 * crouch, rHipX: 0.4 * crouch, spineX: 0.2 * crouch, squash: 1 - 0.08 * crouch });
      }
      if (u < 0.75) {
        const air = (u - 0.25) / 0.5;
        const height = 4 * 0.55 * air * (1 - air);
        return withPose({ rootY: height, lShoulderZ: 2.6, rShoulderZ: 2.6, lKnee: 0.5, rKnee: 0.5, squash: 1.08 - 0.08 * air });
      }
      const land = (u - 0.75) / 0.25;
      const squash = Math.sin(land * Math.PI);
      return withPose({ rootY: -0.1 * squash, lKnee: 0.7 * squash, rKnee: 0.7 * squash, lHipX: 0.35 * squash, rHipX: 0.35 * squash, squash: 1 - 0.1 * squash });
    },
  },
  dance: {
    layer: "body", defaultDuration: 3, description: "Bouncy side-step dance with arm pumps",
    pose: (t) => {
      const beat = 2.2;
      const bounce = Math.abs(wave(t, beat / 2));
      return withPose({
        rootY: -0.06 * bounce, spineZ: 0.15 * wave(t, beat / 2), headZ: -0.12 * wave(t, beat / 2),
        lKnee: 0.35 * bounce, rKnee: 0.35 * bounce, lHipX: 0.2 * bounce, rHipX: 0.2 * bounce,
        lShoulderZ: 1.4 + 1.0 * wave(t, beat / 2), rShoulderZ: 1.4 - 1.0 * wave(t, beat / 2),
        lElbow: 1.2, rElbow: 1.2, squash: 1 + 0.04 * wave(t, beat),
      });
    },
  },
  "sit-ground": {
    layer: "body", defaultDuration: 3, description: "Sits down cross-legged-ish on the ground",
    pose: () => withPose({ rootY: -0.62, lHipX: 1.5, rHipX: 1.5, lKnee: 1.9, rKnee: 1.9, lShoulderX: 0.4, rShoulderX: 0.4, lElbow: 0.6, rElbow: 0.6 }),
  },
  "fall-over": {
    layer: "body", defaultDuration: 1.6, description: "Cartoon stumble backwards onto the butt",
    pose: (t, d) => {
      const u = clamp01(t / (d * 0.5));
      const drop = u * u;
      return withPose({
        rootY: -0.62 * drop, spineX: -0.5 * drop, lHipX: 1.5 * drop, rHipX: 1.2 * drop, lKnee: 0.6 * drop, rKnee: 1.2 * drop,
        lShoulderZ: 1.6 * drop, rShoulderZ: 1.6 * drop, headX: -0.2 * drop, squash: 1 - 0.06 * Math.sin(u * Math.PI),
      });
    },
  },
} satisfies Record<string, ClipDefinition>;

export type ClipName = keyof typeof CLIPS;
export const CLIP_NAMES = Object.keys(CLIPS) as ClipName[];
export const clipDefinition = (name: ClipName): ClipDefinition => CLIPS[name];

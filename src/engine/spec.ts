import { z } from "zod";
import { CAR_MODELS, SEAT_NAMES } from "../catalog/cars";
import { CHARACTER_MODELS } from "../catalog/characters";
import { EASE_NAMES } from "./easing";
import { MOOD_NAMES } from "./expression";
import { CLIP_NAMES } from "./pose";

/**
 * The scene spec is plain JSON-able data. Scenes are written with the helpers in dsl.ts,
 * which produce this shape, and it is validated here before anything renders.
 */

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

const finite = z.number().finite();
export const vec2Schema = z.tuple([finite, finite]);
export const vec3Schema = z.tuple([finite, finite, finite]);

export const SPOTS = ["front", "behind", "left", "right"] as const;

export const anchorSchema = z.object({
  actor: z.string(),
  /** "door:<seat>" for cars, or a spot around any actor. */
  anchor: z.union([z.string().regex(/^door:/), enumOf(SPOTS)]),
  distance: finite.positive().optional(),
});
export const targetSchema = z.union([vec2Schema, anchorSchema]);

export const STYLES = ["sunny", "sunset", "night", "overcast"] as const;
export const SETS = ["suburb", "city", "highway", "parking-lot", "empty"] as const;
export const FORMATS = ["vertical", "landscape", "square"] as const;
export const PROP_TYPES = [
  "tree", "pine", "bush", "house", "building", "cone", "lamp", "bench", "mailbox", "garage",
  "chair", "table", "mug", "dashcam", "bump", "porch",
] as const;
export const SOUND_NAMES = ["crash", "honk", "boing", "thud", "whoosh", "door-slam", "pop", "screech", "splat"] as const;

export const FOLLOW_PRESETS = ["wide", "tracking", "low", "high", "overhead", "chase", "front", "side", "side-left", "close", "close-front"] as const;

const characterActions = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("walk"), actor: z.string(), target: targetSchema,
    run: z.boolean().default(false), speed: finite.positive().optional(), facing: finite.optional(),
  }),
  z.object({ type: z.literal("turn"), actor: z.string(), toward: z.union([targetSchema, finite]), duration: finite.positive().optional() }),
  z.object({ type: z.literal("clip"), actor: z.string(), clip: enumOf(CLIP_NAMES), duration: finite.positive().optional() }),
  /** Duration defaults to the recorded voice clip's length (or an estimate until voices are generated). */
  z.object({ type: z.literal("say"), actor: z.string(), text: z.string().min(1).max(120), duration: finite.positive().optional() }),
  z.object({ type: z.literal("enter"), actor: z.string(), car: z.string(), seat: enumOf(SEAT_NAMES) }),
  z.object({ type: z.literal("exit"), actor: z.string() }),
  /** Jump straight to a spot (only on a camera cut — it's a teleport). */
  z.object({ type: z.literal("place"), actor: z.string(), at: vec2Schema, facing: finite.optional() }),
  z.object({ type: z.literal("feel"), actor: z.string(), mood: enumOf(MOOD_NAMES) }),
  z.object({ type: z.literal("tase"), actor: z.string(), target: z.string(), duration: finite.positive().default(2.4) }),
  z.object({ type: z.literal("yank-dashcam"), actor: z.string(), car: z.string(), duration: finite.positive().default(3) }),
]);

const carActions = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("drive"), actor: z.string(),
    to: targetSchema.optional(), through: z.array(vec2Schema).min(1).optional(),
    duration: finite.positive().optional(), speed: finite.positive().optional(),
    ease: enumOf(EASE_NAMES).default("cruise"), facing: finite.optional(), reverse: z.boolean().default(false),
    fromSpeed: finite.min(0).optional(), endSpeed: finite.min(0).optional(),
  }),
  z.object({
    type: z.literal("crash"), actor: z.string(), into: z.union([z.string(), vec2Schema]),
    impactSpeed: finite.positive().optional(),
    /** Braking (m/s²) on the way in — a late, not-hard-enough stop. */
    brake: finite.min(0).optional(),
  }),
  z.object({
    type: z.literal("honk"), actor: z.string(), duration: finite.positive().default(0.4),
    times: z.number().int().min(1).max(5).default(1), word: z.boolean().default(true),
  }),
  z.object({ type: z.literal("siren"), actor: z.string(), on: z.boolean(), sound: z.boolean().default(true) }),
  z.object({
    type: z.literal("hop"), actor: z.string(), height: finite.positive().default(0.6), duration: finite.positive().default(0.7),
    /** "boing" for a cartoon hop, "thud" for a heavy bounce (a truck over a bump). */
    sound: z.enum(["boing", "thud"]).default("boing"),
  }),
  /** Mud flies off this car (a dirt truck) and splatters all over another car. */
  z.object({ type: z.literal("mud"), actor: z.string(), onto: z.string(), amount: z.number().int().min(1).max(40).default(26) }),
  z.object({ type: z.literal("door"), actor: z.string(), door: enumOf(SEAT_NAMES), open: z.boolean(), duration: finite.positive().default(0.4) }),
]);

const focusSchema = z.union([z.string(), vec2Schema, vec3Schema]);

export const shotSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("static"), position: vec3Schema, lookAt: focusSchema }),
  z.object({
    mode: z.literal("follow"), target: z.string(), preset: enumOf(FOLLOW_PRESETS).default("wide"),
    offset: vec3Schema.optional(), local: z.boolean().optional(), smooth: finite.min(0).default(0.35),
  }),
  z.object({
    mode: z.literal("orbit"), target: focusSchema, radius: finite.positive().default(7), height: finite.default(2.2),
    fromDeg: finite.default(20), toDeg: finite.default(80), duration: finite.positive().default(4),
  }),
  z.object({
    mode: z.literal("move"), position: vec3Schema, lookAt: focusSchema,
    duration: finite.positive().default(2), ease: enumOf(EASE_NAMES).default("smooth"),
  }),
  /** Play back earlier footage from a car's dashcam (time from → to), with a REC overlay. */
  z.object({ mode: z.literal("replay"), car: z.string(), from: finite.min(0), to: finite.positive() }),
]);

const sceneActions = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("camera"), actor: z.literal("camera"), shot: shotSchema,
    blend: finite.min(0).default(0), fov: finite.min(10).max(110).optional(),
  }),
  z.object({ type: z.literal("shake"), actor: z.literal("camera"), intensity: finite.positive().default(0.3), duration: finite.positive().default(0.5) }),
  z.object({
    type: z.literal("sound"), actor: z.literal("sound"), name: enumOf(SOUND_NAMES),
    at: vec3Schema.optional(), volume: finite.min(0).max(2).default(1),
  }),
  /** Hard cut to another location: the set changes; actors and props tagged with another set are hidden. */
  z.object({ type: z.literal("location"), actor: z.literal("world"), set: enumOf(SETS) }),
  z.object({
    type: z.literal("caption"), actor: z.literal("overlay"), text: z.string().min(1).max(120),
    duration: finite.positive().default(2.5), position: z.enum(["top", "center", "bottom"]).default("bottom"),
    size: z.enum(["title", "normal"]).default("normal"),
  }),
]);

export const actionSchema = z.union([characterActions, carActions, sceneActions]);

export const timelineEntrySchema = z.object({
  at: finite.min(0).optional(),
  /** Start when the previous action ends, plus this delay (seconds). */
  after: finite.optional(),
  /** What to wait for: an actor id (its latest listed action) or a cue name. Defaults to the same actor. */
  afterActor: z.string().optional(),
  /** Cue name other entries can wait for with after("name", ...). */
  id: z.string().optional(),
  action: actionSchema,
});

export const characterSpecSchema = z.object({
  kind: z.literal("character"),
  model: enumOf(CHARACTER_MODELS),
  at: vec2Schema,
  facing: finite.default(0),
  colors: z.object({ shirt: z.string(), pants: z.string(), hair: z.string(), skin: z.string(), shoes: z.string() }).partial().default({}),
  /** Start already sitting in a car. */
  seatedIn: z.object({ car: z.string(), seat: enumOf(SEAT_NAMES) }).optional(),
  /** Voice id for spoken lines (ElevenLabs voice id or Google voice name). Defaults per character model. */
  voice: z.string().optional(),
  /** Only on screen (and heard) while this set is showing — for clips that cut between locations. */
  set: enumOf(SETS).optional(),
});

export const carSpecSchema = z.object({
  kind: z.literal("car"),
  model: enumOf(CAR_MODELS),
  at: vec2Schema,
  facing: finite.default(90),
  color: z.string().optional(),
  label: z.string().max(18).optional(),
  /** Little dashcam on the windshield with a blinking record light. */
  dashcam: z.boolean().default(false),
  /** Text painted across the back (a phone number on a work truck's tailgate). */
  rearLabel: z.string().max(24).optional(),
  /** Starts covered in mud. */
  muddy: z.boolean().default(false),
  /** Only on screen (and heard) while this set is showing. */
  set: enumOf(SETS).optional(),
});

export const propSchema = z.object({
  type: enumOf(PROP_TYPES),
  at: vec2Schema,
  facing: finite.default(0),
  scale: finite.positive().default(1),
  color: z.string().optional(),
  /** Height of the ground under it (e.g. a mug on a table). */
  y: finite.optional(),
  /** Only shown while this set is showing. */
  set: enumOf(SETS).optional(),
  /** Appears at this time, or when a cue ends (+ delay). */
  from: z.union([finite, z.object({ cue: z.string(), delay: finite.default(0) })]).optional(),
});

export const sceneSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "scene id must be kebab-case"),
  title: z.string().optional(),
  duration: finite.positive().max(60),
  fps: z.union([z.literal(30), z.literal(60)]).default(60),
  format: enumOf(FORMATS).default("vertical"),
  style: enumOf(STYLES).default("sunny"),
  set: enumOf(SETS).default("suburb"),
  props: z.array(propSchema).default([]),
  cast: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/, "actor ids must be kebab-case"), z.union([characterSpecSchema, carSpecSchema])),
  timeline: z.array(timelineEntrySchema),
  /** Sound effects + background ambience. */
  sound: z.object({
    enabled: z.boolean().default(true), ambience: z.boolean().default(true), volume: finite.min(0).max(2).default(1),
    /** Spoken dialogue for say() lines (generated with `npm run voices`). */
    voices: z.boolean().default(true),
  }).default({}),
});

export type Anchor = z.infer<typeof anchorSchema>;
export type Target = z.infer<typeof targetSchema>;
export type Action = z.infer<typeof actionSchema>;
export type ActionInput = z.input<typeof actionSchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type TimelineEntryInput = z.input<typeof timelineEntrySchema>;
export type CharacterSpec = z.infer<typeof characterSpecSchema>;
export type CarSpec = z.infer<typeof carSpecSchema>;
export type PropSpec = z.infer<typeof propSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type ShotInput = z.input<typeof shotSchema>;
export type SceneSpec = z.infer<typeof sceneSchema>;
export type SceneInput = z.input<typeof sceneSchema>;
export type StyleName = (typeof STYLES)[number];
export type SetName = (typeof SETS)[number];
export type FollowPreset = (typeof FOLLOW_PRESETS)[number];
export type Format = (typeof FORMATS)[number];
export type SoundName = (typeof SOUND_NAMES)[number];

export const FORMAT_SIZES: Record<Format, { width: number; height: number; fov: number }> = {
  vertical: { width: 1080, height: 1920, fov: 62 },
  landscape: { width: 1920, height: 1080, fov: 36 },
  square: { width: 1080, height: 1080, fov: 45 },
};

/** Parse + validate, throwing one readable message listing every problem. */
export const parseScene = (input: SceneInput): SceneSpec => {
  const result = sceneSchema.safeParse(input);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => `  - ${issue.path.join(".") || "(scene)"}: ${issue.message}`);
  const sceneId = typeof input === "object" && input && "id" in input ? String(input.id) : "?";
  throw new Error(`Scene "${sceneId}" is invalid:\n${problems.join("\n")}`);
};

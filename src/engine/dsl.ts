import type { CarModel, SeatName } from "../catalog/cars";
import type { CharacterModel } from "../catalog/characters";
import type { EaseName } from "./easing";
import type { Vec2, Vec3 } from "./math";
import { arcPoints } from "./path";
import type { Mood } from "./expression";
import type { ClipName } from "./pose";
import {
  type ActionInput, type Anchor, type FollowPreset, type PropSpec, type SceneInput, type SceneSpec, type Target,
  type SoundName, type TimelineEntryInput, SPOTS, parseScene,
} from "./spec";

/**
 * Scene-writing helpers. A scene file looks like:
 *
 *   const mike = character("mike", "casual-guy", { at: [2, 5] });
 *   const sedan = car("sedan", "sedan", { at: [-30, 1.8], facing: 90 });
 *   export default scene({ id: "demo", duration: 10, cast: [mike, sedan], timeline: [
 *     at(0, sedan.driveTo([0, 1.8], { duration: 4, ease: "arrive" })),
 *     after(sedan, mike.enter(sedan, "passenger")),   // when the car has stopped
 *     next(mike.play("wave")),                         // when mike is seated
 *     after(mike, sedan.driveTo([40, 1.8])),           // when mike is done waving
 *   ]});
 */

type Spot = (typeof SPOTS)[number];
type ActorRef = { id: string } | string;
type Focus = ActorRef | Vec2 | Vec3;

const idOf = (ref: ActorRef) => (typeof ref === "string" ? ref : ref.id);
const focusOf = (focus: Focus) => (Array.isArray(focus) ? focus : idOf(focus));

/** A timeline entry. Call .as("name") to make it a cue that after("name", ...) can wait for. */
export type Entry = TimelineEntryInput & { as: (cue: string) => Entry };
const entry = (fields: TimelineEntryInput): Entry => ({
  ...fields,
  as(cue: string) {
    return { ...this, id: cue };
  },
});

/** Start an action at an absolute time in seconds. */
export const at = (time: number, action: ActionInput): Entry => entry({ at: time, action });
/**
 * Start an action when the same actor's previous action ends (+ optional delay in seconds).
 * (Named `next`, not `then`: a module exporting `then` looks like a Promise and hangs `await import()`.)
 */
export const next = (action: ActionInput, delay = 0): Entry => entry({ after: delay, action });
/**
 * Start an action when another actor's most recently listed action ends, or when a named cue ends (+ optional delay).
 *   after(mike, sedan.driveTo([40, 1.8]), 0.3)        — the car leaves once Mike's latest action is done
 *   after("mike-seated", camera.follow(sedan, "chase")) — wait for the entry marked .as("mike-seated")
 */
export const after = (actorOrCue: ActorRef, action: ActionInput, delay = 0): Entry =>
  entry({ after: delay, afterActor: idOf(actorOrCue), action });

interface CharacterOptions {
  at: Vec2;
  facing?: number;
  colors?: { shirt?: string; pants?: string; hair?: string; skin?: string; shoes?: string };
  seatedIn?: { car: ActorRef; seat: SeatName };
  /** Voice for spoken lines (ElevenLabs voice id / Google voice name). Defaults per character model. */
  voice?: string;
}

export const character = (id: string, model: CharacterModel, options: CharacterOptions) => ({
  id,
  spec: {
    kind: "character" as const,
    model,
    at: options.at,
    facing: options.facing,
    colors: options.colors,
    seatedIn: options.seatedIn && { car: idOf(options.seatedIn.car), seat: options.seatedIn.seat },
    voice: options.voice,
  },
  walkTo: (target: Target, opts: { speed?: number; facing?: number } = {}): ActionInput => ({ type: "walk", actor: id, target, run: false, ...opts }),
  runTo: (target: Target, opts: { speed?: number; facing?: number } = {}): ActionInput => ({ type: "walk", actor: id, target, run: true, ...opts }),
  /** Turn to a heading in degrees, or to face a point / actor spot. */
  turnTo: (toward: Target | number, opts: { duration?: number } = {}): ActionInput => ({ type: "turn", actor: id, toward, ...opts }),
  face: (other: ActorRef, opts: { duration?: number } = {}): ActionInput => ({ type: "turn", actor: id, toward: { actor: idOf(other), anchor: "front", distance: 0.01 }, ...opts }),
  play: (clip: ClipName, opts: { duration?: number } = {}): ActionInput => ({ type: "clip", actor: id, clip, ...opts }),
  /**
   * Speak a line: speech bubble + realistic voice (after `npm run voices`). Lasts as long as the recording
   * unless `duration` is given. Delivery follows the current mood; [tags] like [whispers] direct it further.
   */
  say: (text: string, opts: { duration?: number } = {}): ActionInput => ({ type: "say", actor: id, text, ...opts }),
  /**
   * Fire a taser at someone: arm out, wires + crackling electricity, they go rigid and fall flat (and stay
   * down until their next action — use target.play("get-up")).
   */
  tase: (target: ActorRef, opts: { duration?: number } = {}): ActionInput => ({ type: "tase", actor: id, target: idOf(target), ...opts }),
  /** Lean into a car's open driver door and yank at its dashcam (it rattles on its mount). Stand at the door first. */
  yankDashcam: (vehicle: ActorRef, opts: { duration?: number } = {}): ActionInput => ({ type: "yank-dashcam", actor: id, car: idOf(vehicle), ...opts }),
  /** Change facial expression: neutral, happy, angry, scared, shocked, smug, sad, pain, dazed. Blends in over 0.25s. */
  feel: (mood: Mood): ActionInput => ({ type: "feel", actor: id, mood }),
  /** Walks to the door if needed, opens it, sits down, closes it. */
  enter: (vehicle: ActorRef, seat: SeatName = "driver"): ActionInput => ({ type: "enter", actor: id, car: idOf(vehicle), seat }),
  exit: (): ActionInput => ({ type: "exit", actor: id }),
  /** A point next to this character, e.g. somebody.walkTo(mike.spot("front", 1.2)). */
  spot: (spot: Spot, distance?: number): Anchor => ({ actor: id, anchor: spot, distance }),
});

interface CarOptions {
  at: Vec2;
  /** Degrees. 90 = driving toward +X (screen right with the default camera). */
  facing?: number;
  color?: string;
  /** Short text painted on the doors (e.g. a business name). */
  label?: string;
  /** Dashcam on the windshield. */
  dashcam?: boolean;
}

interface DriveOptions {
  /** Seconds. Defaults to distance / speed. Ignored when fromSpeed/endSpeed are given. */
  duration?: number;
  /** m/s at the start (default: the car's current speed). Use to start a scene already moving. */
  fromSpeed?: number;
  /** m/s at the end. With fromSpeed/endSpeed the car accelerates evenly between them — no stopping between drives. */
  endSpeed?: number;
  /** m/s average. Default 8 (~18 mph). */
  speed?: number;
  ease?: EaseName;
  /** Heading in degrees to arrive at (driveTo only). */
  facing?: number;
  reverse?: boolean;
}

export const car = (id: string, model: CarModel, options: CarOptions) => ({
  id,
  spec: { kind: "car" as const, model, at: options.at, facing: options.facing, color: options.color, label: options.label, dashcam: options.dashcam },
  driveTo: (to: Target, opts: DriveOptions = {}): ActionInput => ({ type: "drive", actor: id, to, ...opts }),
  /** Drive a smooth curve through every point (current position is the implicit start). */
  driveThrough: (points: Vec2[], opts: Omit<DriveOptions, "facing"> = {}): ActionInput => ({ type: "drive", actor: id, through: points, ...opts }),
  hop: (opts: { height?: number; duration?: number } = {}): ActionInput => ({ type: "hop", actor: id, ...opts }),
  /**
   * Drive into another car (or a point) and crash: stops on contact, bounces back, shoves the other car,
   * impact burst + debris + smoke + "CRASH!", camera shake and crash sound. Starts from the current speed;
   * `brake` (m/s²) slows it on the way in. The target car can be moving — contact time is simulated.
   */
  crashInto: (target: ActorRef | Vec2, opts: { impactSpeed?: number; brake?: number } = {}): ActionInput =>
    ({ type: "crash", actor: id, into: Array.isArray(target) ? target : idOf(target), ...opts }),
  honk: (opts: { duration?: number; times?: number; word?: boolean } = {}): ActionInput => ({ type: "honk", actor: id, ...opts }),
  /** Police light bar + siren on/off. siren(true, { sound: false }) = lights flashing, siren quiet. */
  siren: (on = true, opts: { sound?: boolean } = {}): ActionInput => ({ type: "siren", actor: id, on, ...opts }),
  openDoor: (door: SeatName = "driver"): ActionInput => ({ type: "door", actor: id, door, open: true }),
  closeDoor: (door: SeatName = "driver"): ActionInput => ({ type: "door", actor: id, door, open: false }),
  /** Where a person stands to use this door. */
  door: (seat: SeatName = "driver"): Anchor => ({ actor: id, anchor: `door:${seat}` }),
  spot: (spot: Spot, distance?: number): Anchor => ({ actor: id, anchor: spot, distance }),
});

interface ShotOptions {
  /** Seconds to blend from the previous shot instead of cutting. */
  blend?: number;
  fov?: number;
}

export const camera = {
  /** Cut to a fixed camera. */
  still: (position: Vec3, lookAt: Focus, opts: ShotOptions = {}): ActionInput =>
    ({ type: "camera", actor: "camera", shot: { mode: "static", position, lookAt: focusOf(lookAt) }, ...opts }),
  follow: (target: ActorRef, preset: FollowPreset = "wide", opts: ShotOptions & { offset?: Vec3; local?: boolean; smooth?: number } = {}): ActionInput => {
    const { blend, fov, ...followOptions } = opts;
    return { type: "camera", actor: "camera", shot: { mode: "follow", target: idOf(target), preset, ...followOptions }, blend, fov };
  },
  orbit: (target: Focus, opts: ShotOptions & { radius?: number; height?: number; fromDeg?: number; toDeg?: number; duration?: number } = {}): ActionInput => {
    const { blend, fov, ...orbitOptions } = opts;
    return { type: "camera", actor: "camera", shot: { mode: "orbit", target: focusOf(target), ...orbitOptions }, blend, fov };
  },
  /** Glide from wherever the camera is to a new position. */
  moveTo: (position: Vec3, lookAt: Focus, opts: { duration?: number; ease?: EaseName; fov?: number } = {}): ActionInput => {
    const { fov, ...moveOptions } = opts;
    return { type: "camera", actor: "camera", shot: { mode: "move", position, lookAt: focusOf(lookAt), ...moveOptions }, fov };
  },
  shake: (opts: { intensity?: number; duration?: number } = {}): ActionInput => ({ type: "shake", actor: "camera", ...opts }),
  /**
   * Show earlier footage from a car's dashcam: the scene from `from` to `to` (seconds) replays from inside that
   * car, with a REC overlay and the original audio as if from a small screen. Cut away after (to - from) seconds.
   */
  replay: (vehicle: ActorRef, opts: { from: number; to: number }): ActionInput =>
    ({ type: "camera", actor: "camera", shot: { mode: "replay", car: idOf(vehicle), from: opts.from, to: opts.to } }),
};

export const caption = (text: string, opts: { duration?: number; position?: "top" | "center" | "bottom"; size?: "title" | "normal" } = {}): ActionInput =>
  ({ type: "caption", actor: "overlay", text, ...opts });

/** One-off sound effect, optionally placed in the world (for volume/panning). */
export const sound = (name: SoundName, opts: { at?: Vec3; volume?: number } = {}): ActionInput => ({ type: "sound", actor: "sound", name, ...opts });

export const prop = (type: PropSpec["type"], at: Vec2, opts: { facing?: number; scale?: number; color?: string } = {}) => ({ type, at, ...opts });

export const path = { arc: arcPoints };

type Handle = { id: string; spec: SceneInput["cast"][string] };

export const scene = (input: Omit<SceneInput, "cast"> & { cast: Handle[] }): SceneSpec => {
  const cast: SceneInput["cast"] = {};
  for (const handle of input.cast) {
    if (cast[handle.id]) throw new Error(`Duplicate actor id "${handle.id}"`);
    cast[handle.id] = handle.spec;
  }
  return parseScene({ ...input, cast });
};

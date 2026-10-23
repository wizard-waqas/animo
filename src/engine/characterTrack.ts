import type { SeatName } from "../catalog/cars";
import { type CharacterLook, RIG } from "../catalog/characters";
import type { CarTrack } from "./carTrack";
import { type Face, type Mood, faceAt } from "./expression";
import type { VoiceClip } from "../../voices/manifest";
import { envelopeAt, estimateSpeechDuration, findVoiceClip, lineKey, stripTags } from "../voice/lines";
import { type Vec2, type Vec3, DEG, angleDelta, clamp01, distance2, headingOf, lerp, lerpAngle, progress, sub2 } from "./math";
import { type Path, smoothPath } from "./path";
import { type Obstacle, routeAround } from "./route";
import {
  type ClipName, type HandItem, type Pose, NEUTRAL_POSE, SIT_POSE, UPPER_BODY_KEYS, blendPose, clipDefinition, envelope, gaitPose, idlePose,
} from "./pose";

export interface CharacterState {
  /** Root (ground point between the feet) in world space. */
  pos: Vec3;
  facing: number;
  pose: Pose;
  ridingIn?: string;
  face?: Face;
  /** 0..1 mouth opening from speech (lip sync). */
  talk?: number;
  /** Item in the right hand (phone during film / phone-call, mug, check). */
  item?: HandItem;
  /** Walking/running/turning-step info (distance in rig units), used to place footstep sounds. */
  gait?: { distance: number; run: boolean; weight: number };
}

export const WALK_SPEED = 1.55;
export const RUN_SPEED = 3.4;
const ENTER_DURATION = 1.7;
const EXIT_DURATION = 1.6;
const END_TURN_DURATION = 0.45;
const smoothStep = (x: number) => {
  const clamped = clamp01(x);
  return clamped * clamped * (3 - 2 * clamped);
};

/** `pose` is set when a clip left the body in a held pose (lying down after being tased…). */
type RestState = { mode: "stand"; pos: Vec2; facing: number; pose?: Pose } | { mode: "ride"; car: string; seat: SeatName };

/** How long the next action takes to blend out of a held pose. */
const UNHOLD_BLEND = 0.45;

type BodySegment = { start: number; end: number; cut: number; fromPose?: Pose } & (
  | { kind: "walk"; route: Vec2[]; path?: Path; distance: number; run: boolean; speed: number; ramp: number; moveDuration: number; startFacing: number; endFacing?: number }
  | { kind: "turn"; pos: Vec2; from: number; to: number }
  | { kind: "clip"; pos: Vec2; facing: number; clip: ClipName; hold: boolean }
  | { kind: "enter"; car: string; seat: SeatName; from: Vec2; fromFacing: number }
  | { kind: "exit"; car: string; seat: SeatName }
);

interface Gesture { start: number; end: number; clip: ClipName }
export interface Speech {
  start: number;
  end: number;
  /** Text shown in the bubble (delivery tags removed). */
  text: string;
  /** Text as written (with tags), what the voice is asked to say. */
  script: string;
  mood: Mood;
  /** Identifies the recording: hash of voice, mood and text. */
  key: string;
  clip?: VoiceClip;
}

/** Which upper-body joints a gesture actually moves, so other joints keep doing what they were doing. */
const gestureKeyCache = new Map<ClipName, (keyof Pose)[]>();
const gestureKeys = (clip: ClipName) => {
  const cached = gestureKeyCache.get(clip);
  if (cached) return cached;
  const definition = clipDefinition(clip);
  const keys = UPPER_BODY_KEYS.filter((key) =>
    [0.1, 0.37, 0.71, 1.13].some((time) => Math.abs(definition.pose(time, definition.defaultDuration)[key] - NEUTRAL_POSE[key]) > 1e-3),
  );
  gestureKeyCache.set(clip, keys);
  return keys;
};

export class CharacterTrack {
  readonly segments: BodySegment[] = [];
  readonly gestures: Gesture[] = [];
  readonly speech: Speech[] = [];
  readonly moods: { time: number; mood: Mood }[] = [];
  private readonly initial: RestState;

  constructor(
    readonly id: string,
    readonly look: CharacterLook,
    start: { pos: Vec2; facing: number; seatedIn?: { car: string; seat: SeatName } },
    private readonly cars: Record<string, CarTrack>,
    /** Voice identity for spoken lines (see voices.ts). */
    readonly voice = "model:casual-guy",
  ) {
    this.initial = start.seatedIn
      ? { mode: "ride", car: start.seatedIn.car, seat: start.seatedIn.seat }
      : { mode: "stand", pos: start.pos, facing: start.facing };
  }

  // ---------------------------------------------------------------- planning

  /** State the character is in at time t once any running segment is considered finished. */
  restAt(t: number): RestState {
    const segment = this.segmentAt(t);
    if (!segment) return this.initial;
    if (segment.kind === "enter") return { mode: "ride", car: segment.car, seat: segment.seat };
    if (segment.kind === "exit") {
      const exitState = this.evaluateSegment(segment, Math.min(t, segment.cut, segment.end));
      return { mode: "stand", pos: [exitState.pos[0], exitState.pos[2]], facing: exitState.facing };
    }
    const state = this.evaluateSegment(segment, Math.min(t, segment.cut, segment.end));
    if (segment.kind === "clip" && state.ridingIn) return this.restBefore(segment);
    if (segment.kind === "clip" && segment.hold) {
      const definition = clipDefinition(segment.clip);
      const length = segment.end - segment.start;
      return { mode: "stand", pos: segment.pos, facing: segment.facing, pose: definition.pose(length, length) };
    }
    return { mode: "stand", pos: [state.pos[0], state.pos[2]], facing: state.facing };
  }

  /** Latest time another actor's planning looked at where this character is. */
  private readUntil = -Infinity;

  markRead(t: number) {
    this.readUntil = Math.max(this.readUntil, t);
  }

  private assertUnread(start: number, what: string) {
    if (start < this.readUntil - 1e-6) {
      throw new Error(
        `${this.id}: "${what}" at ${start.toFixed(2)}s is listed after an action that already used ${this.id}'s position at ${this.readUntil.toFixed(2)}s. ` +
          `Move it earlier in the timeline.`,
      );
    }
  }

  standingAt(t: number, action: string) {
    this.assertUnread(t, action);
    this.interruptAt(t);
    const rest = this.restAt(t);
    if (rest.mode === "ride") throw new Error(`${this.id} is sitting in ${rest.car} at t=${t.toFixed(2)}s and can't ${action}. Add ${this.id}.exit() first.`);
    this.pendingFromPose = rest.pose;
    return rest;
  }

  /** Held pose the next pushed segment blends out of (set by standingAt). */
  private pendingFromPose: Pose | undefined;

  private push(segment: BodySegment) {
    this.segments.push({ ...segment, fromPose: this.pendingFromPose });
    this.pendingFromPose = undefined;
  }

  addWalk(start: number, to: Vec2, options: { run: boolean; speed?: number; endFacing?: number }) {
    const rest = this.standingAt(start, "walk");
    if (distance2(rest.pos, to) < 0.05) {
      return options.endFacing === undefined ? start : this.addTurn(start, options.endFacing);
    }
    const route = routeAround(rest.pos, to, this.parkedCarsAt(start, rest.pos, to));
    // Detours get a smooth curve through their corners so the walker doesn't change direction instantly.
    const path = route.length > 2 ? smoothPath(route) : undefined;
    const distance = path ? path.length : distance2(route[0], route[1]);
    const speed = options.speed ?? ((options.run ? RUN_SPEED : WALK_SPEED) * this.look.height) / 0.95;
    // Speed up and slow down over a short fixed ramp; very short walks just ramp up and down.
    const ramp = Math.min(options.run ? 0.5 : 0.35, distance / speed);
    const moveDuration = distance / speed + ramp;
    const end = moveDuration + (options.endFacing === undefined ? 0 : END_TURN_DURATION);
    this.push({
      kind: "walk", start, end: start + end, cut: Infinity, route, path, distance, run: options.run, speed, ramp, moveDuration,
      startFacing: rest.facing, endFacing: options.endFacing,
    });
    return start + end;
  }

  /** Cars standing still near the walk (from → to) at time t, as obstacles to walk around. */
  private parkedCarsAt(t: number, from: Vec2, to: Vec2): Obstacle[] {
    const nearPath = (point: Vec2) => {
      const leg = sub2(to, from);
      const lengthSquared = leg[0] * leg[0] + leg[1] * leg[1] || 1;
      const along = Math.max(0, Math.min(1, ((point[0] - from[0]) * leg[0] + (point[1] - from[1]) * leg[1]) / lengthSquared));
      return distance2(point, [from[0] + leg[0] * along, from[1] + leg[1] * along]) < 8;
    };
    return Object.values(this.cars)
      .filter((car) => nearPath(car.kinematics(t).pos) && Math.abs(car.state(t).speed) < 0.1)
      .map((car) => {
        // Only cars that can affect this route count as "used" (see the listing-order guard).
        car.markRead(t);
        const { pos, heading } = car.kinematics(t);
        return { center: pos, heading, halfWidth: car.shape.width / 2, halfLength: car.shape.length / 2 };
      });
  }

  addTurn(start: number, toFacing: number, duration?: number) {
    const rest = this.standingAt(start, "turn");
    const turnAmount = Math.abs(angleDelta(rest.facing, toFacing));
    const turnDuration = duration ?? Math.max(0.3, turnAmount / (220 * DEG));
    this.push({ kind: "turn", start, end: start + turnDuration, cut: Infinity, pos: rest.pos, from: rest.facing, to: toFacing });
    return start + turnDuration;
  }

  addClip(start: number, clip: ClipName, duration?: number) {
    const definition = clipDefinition(clip);
    const clipDuration = duration ?? definition.defaultDuration;
    if (definition.layer === "gesture") {
      this.gestures.push({ start, end: start + clipDuration, clip });
      return start + clipDuration;
    }
    const rest = this.standingAt(start, `play "${clip}"`);
    this.push({ kind: "clip", start, end: start + clipDuration, cut: Infinity, pos: rest.pos, facing: rest.facing, clip, hold: Boolean(definition.holds) });
    return start + clipDuration;
  }

  /** Moments this character teleported (place), where a jump in position is intended. */
  readonly jumps: number[] = [];

  addPlace(start: number, pos: Vec2, facing?: number) {
    const rest = this.standingAt(start, "place");
    const heading = facing ?? rest.facing;
    this.pendingFromPose = undefined;
    this.push({ kind: "turn", start, end: start, cut: Infinity, pos, from: heading, to: heading });
    this.jumps.push(start);
    return start;
  }

  addMood(start: number, mood: Mood) {
    this.moods.push({ time: start, mood });
    this.moods.sort((a, b) => a.time - b.time);
    return start;
  }

  face(t: number) {
    return faceAt(this.moods, t);
  }

  addSpeech(start: number, script: string, duration?: number) {
    const mood = [...this.moods].reverse().find((change) => change.time <= start)?.mood ?? "neutral";
    const key = lineKey(this.voice, script, mood);
    const clip = findVoiceClip(key);
    // A recorded line sets its own length (plus a beat so the bubble doesn't vanish mid-word).
    const length = duration ?? (clip ? clip.duration + 0.25 : estimateSpeechDuration(script));
    this.speech.push({ start, end: start + length, text: stripTags(script), script, mood, key, clip });
    return start + length;
  }

  /** How open the mouth is from speech at time t (0..1): follows the recording's loudness, or flaps without one. */
  talkLevel(t: number) {
    for (const line of this.speech) {
      if (t < line.start || t > line.end) continue;
      if (line.clip) return Math.min(1, envelopeAt(line.clip.envelope, t - line.start) * 1.4);
      return 0.5 + 0.5 * Math.abs(Math.sin(t * 14));
    }
    return 0;
  }

  /** Walks to the door if needed, then gets in. Returns the end time. */
  addEnter(start: number, carId: string, seat: SeatName) {
    const rest = this.standingAt(start, `get into ${carId}`);
    const car = this.cars[carId];
    car.markRead(start);
    const seatInfo = car.seatWorld(seat, start);
    const facingCar = seatInfo.heading - seatInfo.side * 90 * DEG;
    let enterStart = start;
    if (distance2(rest.pos, seatInfo.doorStand) > 0.15) enterStart = this.addWalk(start, seatInfo.doorStand, { run: false, endFacing: facingCar });
    const end = enterStart + ENTER_DURATION;
    this.push({ kind: "enter", start: enterStart, end, cut: Infinity, car: carId, seat, from: seatInfo.doorStand, fromFacing: facingCar });
    car.addDoor(seat, enterStart, true);
    car.addDoor(seat, enterStart + 1.25, false);
    return end;
  }

  addExit(start: number) {
    this.assertUnread(start, "exit");
    this.interruptAt(start);
    const rest = this.restAt(start);
    if (rest.mode !== "ride") throw new Error(`${this.id} isn't in a car at t=${start.toFixed(2)}s, so it can't exit.`);
    const car = this.cars[rest.car];
    this.push({ kind: "exit", start, end: start + EXIT_DURATION, cut: Infinity, car: rest.car, seat: rest.seat });
    car.addDoor(rest.seat, start, true);
    car.addDoor(rest.seat, start + 1.15, false);
    return start + EXIT_DURATION;
  }

  /** The car this character is climbing into or out of at time t, if any. */
  boardingAt(t: number) {
    const segment = this.segmentAt(t);
    if (segment && (segment.kind === "enter" || segment.kind === "exit") && t < segment.end) return segment.car;
    return undefined;
  }

  /** Is this character's body inside a car right now (entering, exiting or seated)? */
  isInVehicle(t: number) {
    const segment = this.segmentAt(t);
    if (segment && (segment.kind === "enter" || segment.kind === "exit") && t < segment.end) return true;
    return this.restAt(t).mode === "ride";
  }

  // -------------------------------------------------------------- evaluation

  state(t: number): CharacterState {
    const segment = this.segmentAt(t);
    let base: CharacterState;
    if (segment && t < Math.min(segment.cut, segment.end)) {
      base = this.evaluateSegment(segment, t);
      // Coming out of a held pose (e.g. lying down): blend from it instead of snapping.
      const sinceStart = t - segment.start;
      if (segment.fromPose && sinceStart < UNHOLD_BLEND) {
        const weight = sinceStart / UNHOLD_BLEND;
        base = { ...base, pose: blendPose(segment.fromPose, base.pose, weight * weight * (3 - 2 * weight)) };
      }
    } else base = this.evaluateRest(this.restAt(t), t);
    return { ...base, pose: this.applyGestures(base.pose, t), face: this.face(t), talk: this.talkLevel(t), item: this.itemAt(t) };
  }

  private evaluateRest(rest: RestState, t: number): CharacterState {
    if (rest.mode === "stand") return { pos: [rest.pos[0], 0, rest.pos[1]], facing: rest.facing, pose: rest.pose ?? idlePose(t) };
    return this.ridingState(rest.car, rest.seat, t, SIT_POSE);
  }

  private ridingState(carId: string, seat: SeatName, t: number, pose: Pose): CharacterState {
    const seatInfo = this.cars[carId].seatWorld(seat, t);
    const rootHeight = seatInfo.pos[1] - RIG.hipHeight * this.look.height;
    return { pos: [seatInfo.pos[0], rootHeight, seatInfo.pos[2]], facing: seatInfo.heading, pose, ridingIn: carId };
  }

  private evaluateSegment(segment: BodySegment, t: number): CharacterState {
    const localTime = t - segment.start;
    const duration = segment.end - segment.start;
    switch (segment.kind) {
      case "walk": {
        const travelled = trapezoidDistance(localTime, segment.distance, segment.speed, segment.ramp);
        const along = (distance: number) => (segment.path ? segment.path.pointAt(distance) : pointAlong(segment.route, distance));
        const pos = along(travelled);
        // Face a point a little further along the route, so corners are rounded off naturally.
        const lookAhead = along(Math.min(segment.distance, travelled + 0.6));
        const lookBehind = along(Math.max(0, travelled - 0.05));
        const travelFacing = distance2(lookAhead, lookBehind) > 1e-4
          ? headingOf(sub2(lookAhead, lookBehind))
          : headingOf(sub2(segment.route[segment.route.length - 1], segment.route[segment.route.length - 2]));
        const turnIn = Math.min(0.4, segment.moveDuration * 0.4);
        let facing = lerpAngle(segment.startFacing, travelFacing, smoothStep(localTime / turnIn));
        let turnSteps = 0;
        let turnWeight = 0;
        if (segment.endFacing !== undefined && localTime > segment.moveDuration) {
          const turnProgress = progress(localTime, segment.moveDuration, segment.moveDuration + END_TURN_DURATION);
          const finalTravelFacing = headingOf(sub2(segment.route[segment.route.length - 1], segment.route[segment.route.length - 2]));
          facing = lerpAngle(finalTravelFacing, segment.endFacing, smoothStep(turnProgress));
          turnSteps = Math.abs(angleDelta(finalTravelFacing, segment.endFacing)) * 0.3 * turnProgress;
          turnWeight = Math.sin(Math.PI * turnProgress) * 0.6;
        }
        // Gait strength follows actual speed, so legs slow down as the body does.
        const speedNow = (trapezoidDistance(localTime + 0.01, segment.distance, segment.speed, segment.ramp) - trapezoidDistance(localTime - 0.01, segment.distance, segment.speed, segment.ramp)) / 0.02;
        const gaitWeight = clamp01(speedNow / (segment.speed * 0.55));
        const scaledDistance = (travelled + turnSteps) / this.look.height;
        const weight = Math.max(gaitWeight, turnWeight);
        const pose = blendPose(idlePose(t), gaitPose(scaledDistance, segment.run, 1), weight);
        return { pos: [pos[0], 0, pos[1]], facing, pose, gait: { distance: scaledDistance, run: segment.run, weight } };
      }
      case "turn": {
        const u = progress(localTime, 0, duration);
        const facing = lerpAngle(segment.from, segment.to, smoothStep(u));
        const steps = Math.abs(angleDelta(segment.from, segment.to)) * 0.3 * u;
        const stepWeight = Math.sin(Math.PI * u) * 0.6;
        const pose = blendPose(idlePose(t), gaitPose(steps / this.look.height, false, 1), stepWeight);
        return { pos: [segment.pos[0], 0, segment.pos[1]], facing, pose, gait: { distance: steps / this.look.height, run: false, weight: stepWeight } };
      }
      case "clip": {
        const definition = clipDefinition(segment.clip);
        // Held clips only fade in; they end in their final pose.
        const weight = segment.hold ? Math.min(1, envelope(localTime, duration * 4)) : envelope(localTime, duration);
        const pose = blendPose(idlePose(t), definition.pose(localTime, duration), weight);
        return { pos: [segment.pos[0], 0, segment.pos[1]], facing: segment.facing, pose };
      }
      case "enter": {
        const move = smoothStep(progress(localTime, 0.3, 1.2));
        const seated = this.ridingState(segment.car, segment.seat, t, SIT_POSE);
        return {
          pos: [
            lerp(segment.from[0], seated.pos[0], move),
            lerp(0, seated.pos[1], move) + 0.14 * Math.sin(Math.PI * move),
            lerp(segment.from[1], seated.pos[2], move),
          ],
          facing: lerpAngle(segment.fromFacing, seated.facing, move),
          pose: blendPose(idlePose(t), SIT_POSE, move),
          ridingIn: move > 0.5 ? segment.car : undefined,
        };
      }
      case "exit": {
        const move = smoothStep(progress(localTime, 0.3, 1.1));
        const seated = this.ridingState(segment.car, segment.seat, t, SIT_POSE);
        const seatInfo = this.cars[segment.car].seatWorld(segment.seat, t);
        const facingOut = seatInfo.heading + seatInfo.side * 90 * DEG;
        return {
          pos: [
            lerp(seated.pos[0], seatInfo.doorStand[0], move),
            lerp(seated.pos[1], 0, move) + 0.14 * Math.sin(Math.PI * move),
            lerp(seated.pos[2], seatInfo.doorStand[1], move),
          ],
          facing: lerpAngle(seated.facing, facingOut, move),
          pose: blendPose(SIT_POSE, idlePose(t), move),
          ridingIn: move < 0.5 ? segment.car : undefined,
        };
      }
    }
  }

  private applyGestures(pose: Pose, t: number) {
    let result = pose;
    for (const gesture of this.gestures) {
      if (t < gesture.start || t > gesture.end) continue;
      const duration = gesture.end - gesture.start;
      const localTime = t - gesture.start;
      const gesturePose = clipDefinition(gesture.clip).pose(localTime, duration);
      result = blendPose(result, gesturePose, envelope(localTime, duration), gestureKeys(gesture.clip));
    }
    return result;
  }

  /** The hand item shows while its gesture is mostly raised, so it doesn't pop in at the hip. */
  private itemAt(t: number) {
    for (const gesture of this.gestures) {
      const { item, itemUntil } = clipDefinition(gesture.clip);
      if (!item || t < gesture.start || t > gesture.end) continue;
      const length = gesture.end - gesture.start;
      if (itemUntil !== undefined && t > gesture.start + length * itemUntil) continue;
      if (envelope(t - gesture.start, length) > 0.4 || (itemUntil !== undefined && t > gesture.start + 0.1)) return item;
    }
    return undefined;
  }

  private segmentAt(t: number) {
    let active: BodySegment | undefined;
    for (const segment of this.segments) if (segment.start <= t) active = segment;
    return active;
  }

  private restBefore(segment: BodySegment): RestState {
    const index = this.segments.indexOf(segment);
    return index > 0 ? this.restAt(this.segments[index - 1].start + 1e-6) : this.initial;
  }

  private interruptAt(t: number) {
    const active = this.segmentAt(t);
    if (active && t < active.end) active.cut = Math.min(active.cut, t);
  }

  busyUntil() {
    return Math.max(0, ...this.segments.map((segment) => Math.min(segment.cut, segment.end)));
  }
}

/** Distance covered after `time` seconds: ramp up to `speed`, cruise, ramp down, stop exactly at `distance`. */
export const trapezoidDistance = (time: number, distance: number, speed: number, ramp: number) => {
  const total = distance / speed + ramp;
  const t = Math.max(0, Math.min(time, total));
  if (ramp <= 0) return Math.min(distance, speed * t);
  if (t < ramp) return (speed * t * t) / (2 * ramp);
  if (t < total - ramp) return speed * (t - ramp / 2);
  const remaining = total - t;
  return distance - (speed * remaining * remaining) / (2 * ramp);
};

/** Point at a given distance along a polyline. */
const pointAlong = (route: Vec2[], distance: number): Vec2 => {
  let remaining = distance;
  for (let i = 1; i < route.length; i++) {
    const legLength = distance2(route[i - 1], route[i]);
    if (remaining <= legLength || i === route.length - 1) {
      const fraction = legLength > 0 ? Math.min(1, remaining / legLength) : 1;
      return [lerp(route[i - 1][0], route[i][0], fraction), lerp(route[i - 1][1], route[i][1], fraction)];
    }
    remaining -= legLength;
  }
  return route[route.length - 1];
};

/** Height of a character's face, used for camera framing and speech bubbles. */
export const headHeight = (look: CharacterLook) => (RIG.hipHeight + RIG.headHeight) * look.height;

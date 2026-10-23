import { ease } from "./easing";
import { type Vec2, type Vec3, DEG, lerp, lerp3, progress, rotate2, wobble, angleDelta } from "./math";
import type { FollowPreset, Shot } from "./spec";

export interface CameraState { position: Vec3; lookAt: Vec3; fov: number }

/** How the camera sees an actor: the point to frame and which way it faces. */
export type FocusResolver = (target: string, t: number) => { point: Vec3; heading: number };

/** Offsets are relative to the framed point. "local" offsets rotate with the target's heading. */
export const FOLLOW_PRESETS: Record<FollowPreset, { offset: Vec3; local: boolean; description: string }> = {
  wide: { offset: [0, 2.5, 14], local: false, description: "Wide establishing view from the front of the set" },
  tracking: { offset: [0, 0.6, 8.5], local: false, description: "Side-on dolly that slides along with the target" },
  low: { offset: [0, -0.5, 6.5], local: false, description: "Low hero angle looking up" },
  high: { offset: [0, 9, 9], local: false, description: "High angle looking down at 45°" },
  overhead: { offset: [0, 22, 0.1], local: false, description: "Straight down, map view" },
  chase: { offset: [0, 1.6, -8], local: true, description: "Behind the target, looking where it is going" },
  front: { offset: [0, 0.6, 7], local: true, description: "In front of the target, looking back at it" },
  side: { offset: [-7, 0.5, 0], local: true, description: "Beside the target (its right side)" },
  "side-left": { offset: [7, 0.5, 0], local: true, description: "Beside the target (its left / driver side)" },
  close: { offset: [0.9, 0.05, 2.4], local: true, description: "Close 3/4 shot of a face" },
  "close-front": { offset: [0, 0, 2.1], local: true, description: "Close, straight-on face shot" },
};

interface CompiledShot {
  start: number;
  blend: number;
  fov: number;
  shot: Shot;
  /** For "move" shots: where the camera was when the move began. */
  from?: CameraState;
}

interface Shake { start: number; end: number; intensity: number }

const DEFAULT_SHOT: Shot = { mode: "static", position: [0, 3.5, 16], lookAt: [0, 1, 0] };
const SMOOTH_SAMPLE_RATE = 30;

export class CameraTrack {
  private readonly shots: CompiledShot[] = [];
  private readonly shakes: Shake[] = [];
  /** Moments (crash impacts) the follow smoothing must not look across, so hits land hard. */
  private readonly breaks: number[] = [];

  constructor(
    private readonly resolveFocus: FocusResolver,
    private readonly defaultFov: number,
    private readonly sceneDuration: number,
  ) {}

  addShot(start: number, shot: Shot, blend: number, fov?: number) {
    const compiled: CompiledShot = { start, blend, fov: fov ?? this.defaultFov, shot };
    if (shot.mode === "move") compiled.from = this.state(start);
    this.shots.push(compiled);
    this.shots.sort((a, b) => a.start - b.start);
    const length = shot.mode === "move" || shot.mode === "orbit" ? shot.duration : 0;
    return start + Math.max(length, blend);
  }

  addBreak(time: number) {
    this.breaks.push(time);
    this.breaks.sort((a, b) => a - b);
  }

  addShake(start: number, intensity: number, duration: number) {
    this.shakes.push({ start, end: start + duration, intensity });
    return start + duration;
  }

  hasShotAt(t: number) {
    return this.shots.some((shot) => shot.start <= t);
  }

  state(t: number): CameraState {
    const index = this.shotIndexAt(t);
    let state: CameraState;
    if (index < 0) state = this.evaluate({ start: 0, blend: 0, fov: this.defaultFov, shot: DEFAULT_SHOT }, t);
    else {
      const current = this.shots[index];
      state = this.evaluate(current, t);
      if (current.blend > 0 && index > 0 && t < current.start + current.blend) {
        const previous = this.evaluate(this.shots[index - 1], t);
        const weight = ease("smooth", progress(t, current.start, current.start + current.blend));
        state = {
          position: lerp3(previous.position, state.position, weight),
          lookAt: lerp3(previous.lookAt, state.lookAt, weight),
          fov: lerp(previous.fov, state.fov, weight),
        };
      }
    }
    return this.applyShake(state, t);
  }

  private evaluate(compiled: CompiledShot, t: number): CameraState {
    const { shot, fov, start } = compiled;
    switch (shot.mode) {
      case "static":
        return { position: shot.position, lookAt: this.focusPoint(shot.lookAt, t), fov };
      case "follow": {
        const preset = FOLLOW_PRESETS[shot.preset];
        const offset = shot.offset ?? preset.offset;
        const local = shot.local ?? (shot.offset ? false : preset.local);
        const { point, heading } = this.smoothedFocus(shot.target, t, start, shot.smooth);
        const horizontal: Vec2 = local ? rotate2([offset[0], offset[2]], heading) : [offset[0], offset[2]];
        return { position: [point[0] + horizontal[0], point[1] + offset[1], point[2] + horizontal[1]], lookAt: point, fov };
      }
      case "orbit": {
        const point = typeof shot.target === "string"
          ? this.smoothedFocus(shot.target, t, start, 0.3).point
          : this.focusPoint(shot.target, t);
        const angle = lerp(shot.fromDeg, shot.toDeg, ease("smooth", progress(t, start, start + shot.duration))) * DEG;
        return {
          position: [point[0] + Math.sin(angle) * shot.radius, point[1] + shot.height, point[2] + Math.cos(angle) * shot.radius],
          lookAt: point,
          fov,
        };
      }
      case "move": {
        const from = compiled.from!;
        const weight = ease(shot.ease, progress(t, start, start + shot.duration));
        return {
          position: lerp3(from.position, shot.position, weight),
          lookAt: lerp3(from.lookAt, this.focusPoint(shot.lookAt, t), weight),
          fov: lerp(from.fov, fov, weight),
        };
      }
    }
  }

  private focusPoint(focus: string | Vec2 | Vec3, t: number): Vec3 {
    if (typeof focus === "string") return this.resolveFocus(focus, t).point;
    if (focus.length === 2) return [focus[0], 0.8, focus[1]];
    return focus;
  }

  /**
   * Centered (look-ahead) smoothing: the camera averages the target's path over a window
   * around t. Because the whole scene is known in advance this has no lag, yet still
   * irons out jerks — like a real camera operator who knows the choreography.
   */
  private smoothedFocus(target: string, t: number, shotStart: number, smooth: number) {
    if (smooth <= 0) return this.resolveFocus(target, t);
    const sigma = smooth / 2;
    const step = 1 / SMOOTH_SAMPLE_RATE;
    const center = this.resolveFocus(target, t);
    let totalWeight = 0;
    const point: Vec3 = [0, 0, 0];
    let headingOffset = 0;
    // The smoothing window stays within the shot and between impacts.
    const windowStart = Math.max(shotStart, ...this.breaks.filter((time) => time <= t));
    const windowEnd = Math.min(this.sceneDuration, ...this.breaks.filter((time) => time > t));
    for (let offset = -2 * sigma; offset <= 2 * sigma + 1e-9; offset += step) {
      const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
      const sample = this.focusWithinWindow(target, t + offset, windowStart, windowEnd);
      point[0] += sample.point[0] * weight;
      point[1] += sample.point[1] * weight;
      point[2] += sample.point[2] * weight;
      headingOffset += angleDelta(center.heading, sample.heading) * weight;
      totalWeight += weight;
    }
    return {
      point: [point[0] / totalWeight, point[1] / totalWeight, point[2] / totalWeight] as Vec3,
      heading: center.heading + headingOffset / totalWeight,
    };
  }

  /**
   * The target's focus at time t, but outside [windowStart, windowEnd] the motion is extended in a
   * straight line instead of clamped. Clamping would make the camera lag and then catch up (a hitch).
   */
  private focusWithinWindow(target: string, t: number, windowStart: number, windowEnd: number) {
    const edge = t < windowStart ? windowStart : t > windowEnd ? windowEnd : undefined;
    if (edge === undefined) return this.resolveFocus(target, t);
    const step = 1 / 30;
    const atStart = edge === windowStart;
    const inside = this.resolveFocus(target, atStart ? edge : edge - 1e-4);
    const neighbour = this.resolveFocus(target, atStart ? edge + step : edge - step);
    const direction = atStart ? 1 : -1;
    const scale = ((t - edge) / step) * direction;
    return {
      point: [0, 1, 2].map((axis) => inside.point[axis] + (neighbour.point[axis] - inside.point[axis]) * scale) as Vec3,
      heading: inside.heading + angleDelta(inside.heading, neighbour.heading) * scale,
    };
  }

  private applyShake(state: CameraState, t: number): CameraState {
    let amount = 0;
    for (const shake of this.shakes) {
      if (t < shake.start || t > shake.end) continue;
      const remaining = 1 - progress(t, shake.start, shake.end);
      amount += shake.intensity * remaining * remaining;
    }
    if (amount === 0) return state;
    const jitter: Vec3 = [wobble(t, 1) * amount * 0.4, wobble(t, 2) * amount * 0.3, wobble(t, 3) * amount * 0.2];
    return {
      ...state,
      position: [state.position[0] + jitter[0], state.position[1] + jitter[1], state.position[2] + jitter[2]],
      lookAt: [state.lookAt[0] + jitter[0] * 0.5, state.lookAt[1] + jitter[1] * 0.5, state.lookAt[2]],
    };
  }

  private shotIndexAt(t: number) {
    let index = -1;
    this.shots.forEach((shot, i) => {
      if (shot.start <= t) index = i;
    });
    return index;
  }

  /** Times of hard cuts (shots with no blend), where a jump in camera position is intended. */
  cutTimes() {
    return this.shots.filter((shot) => shot.blend === 0).map((shot) => shot.start);
  }

  /** Time windows of camera shakes (intentionally jittery). */
  shakeWindows() {
    return this.shakes.map((shake) => [shake.start, shake.end] as const);
  }

  describe() {
    return this.shots.map((shot) => ({ start: shot.start, mode: shot.shot.mode, shot: shot.shot }));
  }
}

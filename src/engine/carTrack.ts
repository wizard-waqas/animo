import { type CarShape, type SeatName, SEAT_NAMES, availableSeats, seatLayout } from "../catalog/cars";
import { type EaseName, ease } from "./easing";
import { type Vec2, type Vec3, DEG, add2, angleDelta, clamp, forwardOf, headingOf, lerp, progress, rotate2, scale2, sub2 } from "./math";
import { type Path, bezierPath, smoothPath } from "./path";

export interface CarState {
  /** Ground position [x, z]. */
  pos: Vec2;
  heading: number;
  /** Height of the hop arc (0 on the ground). */
  lift: number;
  /** Front wheel steering angle (radians, positive = left). */
  steer: number;
  /** Wheel rotation in radians. */
  wheelSpin: number;
  /** Body sway from the suspension springs (radians / meters). */
  pitch: number;
  roll: number;
  heave: number;
  /** Signed speed in m/s. */
  speed: number;
  doors: Record<SeatName, number>;
}

type DriveSegment = {
  start: number;
  plannedEnd: number;
  /** When a later action interrupts this one. */
  cut: number;
  odometerAtStart: number;
} & (
  | {
      kind: "path"; path: Path; easeName: EaseName; reverse: boolean;
      /** Constant-acceleration profile instead of an ease: distance fraction = ramp·u + (1 − ramp)·u². */
      ramp?: number;
    }
  /** Pushed by a crash: slides and spins with locked wheels (no steering, no wheel spin). */
  | { kind: "shove"; fromPos: Vec2; toPos: Vec2; fromHeading: number; toHeading: number }
);

interface Hop { start: number; end: number; height: number }
export interface Impact { time: number; speed: number; /** World direction of the force on this car. */ direction: Vec2 }
export interface Honk { start: number; duration: number; times: number }
interface DoorEvent { door: SeatName; start: number; duration: number; open: boolean }

interface Kinematics { pos: Vec2; heading: number; odometer: number; curvature: number; reverse: boolean }

const SPRING_STEP = 1 / 120;
const DERIVATIVE_STEP = 1 / 60;

/** Everything a car does over the scene, evaluated as a pure function of time. */
export class CarTrack {
  private readonly drives: DriveSegment[] = [];
  private readonly hops: Hop[] = [];
  private readonly doorEvents: DoorEvent[] = [];
  readonly impacts: Impact[] = [];
  readonly honks: Honk[] = [];
  private springs: { pitch: Float32Array; roll: Float32Array; heave: Float32Array } | null = null;
  /** Latest time another actor's planning has looked at where this car is. */
  private readUntil = -Infinity;

  constructor(
    readonly id: string,
    readonly shape: CarShape,
    private readonly startPos: Vec2,
    private readonly startHeading: number,
  ) {}

  /** Another actor planned something around this car's position at time t. */
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

  /** Plan a drive. Returns the end time. */
  addDrive(start: number, options: {
    to?: Vec2; through?: Vec2[]; arriveHeading?: number; duration?: number; speed?: number; easeName: EaseName; reverse: boolean;
    /** Speed (m/s) at the start. Defaults to however fast the car is already going. */
    fromSpeed?: number;
    /** Speed (m/s) at the end. Setting this (or fromSpeed) switches to a smooth constant-acceleration profile. */
    endSpeed?: number;
  }): number {
    this.assertUnread(start, "drive");
    const speedNow = this.speedAt(start);
    this.interruptAt(start);
    const current = this.kinematics(start);
    const leaveHeading = options.reverse ? current.heading + Math.PI : current.heading;
    let path: Path;
    if (options.through) {
      // If the first point isn't straight ahead, add a lead-in along the current heading so the
      // curve leaves smoothly instead of kinking the car's heading (which jolts anyone inside).
      const firstLeg = sub2(options.through[0], current.pos);
      const offAngle = Math.abs(angleDelta(leaveHeading, headingOf(firstLeg)));
      const leadIn = add2(current.pos, scale2(forwardOf(leaveHeading), Math.min(3, Math.hypot(...firstLeg) / 3)));
      path = smoothPath(offAngle > 0.05 * DEG ? [current.pos, leadIn, ...options.through] : [current.pos, ...options.through]);
    } else {
      const to = options.to!;
      const arrive = options.arriveHeading === undefined ? undefined : options.reverse ? options.arriveHeading + Math.PI : options.arriveHeading;
      path = bezierPath(current.pos, leaveHeading, to, arrive);
    }
    let duration: number;
    let ramp: number | undefined;
    if (options.fromSpeed !== undefined || options.endSpeed !== undefined) {
      const startSpeed = options.fromSpeed ?? speedNow;
      const endSpeed = options.endSpeed ?? startSpeed;
      if (startSpeed + endSpeed < 0.1) throw new Error(`${this.id}: a drive can't start and end at speed 0 — give endSpeed`);
      duration = (2 * path.length) / (startSpeed + endSpeed);
      ramp = (2 * startSpeed) / (startSpeed + endSpeed);
    } else {
      const averageSpeed = options.speed ?? 8;
      duration = options.duration ?? Math.max(0.5, path.length / averageSpeed);
    }
    this.drives.push({
      kind: "path", start, plannedEnd: start + duration, cut: Infinity, path, easeName: options.easeName,
      reverse: options.reverse, odometerAtStart: current.odometer, ramp,
    });
    return start + duration;
  }

  /** Forward speed (m/s) just before time t, from the plan so far. */
  speedAt(t: number) {
    const step = 0.02;
    if (t < step) return 0;
    return Math.abs(this.kinematics(t).odometer - this.kinematics(t - step).odometer) / step;
  }

  /** Slide by `offset` and rotate by `spin` radians with locked wheels (crash knock-on). */
  addShove(start: number, offset: Vec2, spin: number, duration: number) {
    this.assertUnread(start, "shove");
    this.interruptAt(start);
    const current = this.kinematics(start);
    this.drives.push({
      kind: "shove", start, plannedEnd: start + duration, cut: Infinity, odometerAtStart: current.odometer,
      fromPos: current.pos, toPos: add2(current.pos, offset), fromHeading: current.heading, toHeading: current.heading + spin,
    });
    return start + duration;
  }

  addImpact(time: number, speed: number, direction: Vec2) {
    this.impacts.push({ time, speed, direction });
  }

  addHonk(start: number, duration: number, times: number) {
    this.honks.push({ start, duration, times });
    const gap = 0.12;
    return start + times * duration + (times - 1) * gap;
  }

  /** Door swings for the sound track: when each open/close starts and how long it takes. */
  doorMoves() {
    return this.doorEvents.map((event) => ({ ...event }));
  }

  addHop(start: number, height: number, duration: number) {
    this.assertUnread(start, "hop");
    this.hops.push({ start, end: start + duration, height });
    return start + duration;
  }

  addDoor(door: SeatName, start: number, open: boolean, duration = 0.4) {
    this.doorEvents.push({ door, start, duration, open });
    this.doorEvents.sort((a, b) => a.start - b.start);
    return start + duration;
  }

  /** Plain kinematics: where the car is, without springs. */
  kinematics(t: number): Kinematics {
    const drive = this.activeDrive(t);
    if (!drive) return { pos: this.startPos, heading: this.startHeading, odometer: 0, curvature: 0, reverse: false };
    const clampedTime = Math.min(t, drive.cut, drive.plannedEnd);
    const u = progress(clampedTime, drive.start, drive.plannedEnd);
    if (drive.kind === "shove") {
      const slide = ease("out", u);
      return {
        pos: [lerp(drive.fromPos[0], drive.toPos[0], slide), lerp(drive.fromPos[1], drive.toPos[1], slide)],
        heading: lerp(drive.fromHeading, drive.toHeading, slide),
        odometer: drive.odometerAtStart,
        curvature: 0,
        reverse: false,
      };
    }
    const fraction = drive.ramp === undefined ? ease(drive.easeName, u) : drive.ramp * u + (1 - drive.ramp) * u * u;
    const distance = drive.path.length * fraction;
    const tangentHeading = drive.path.headingAt(distance);
    const pathCurvature = drive.path.curvatureAt(distance);
    return {
      pos: drive.path.pointAt(distance),
      heading: drive.reverse ? tangentHeading + Math.PI : tangentHeading,
      odometer: drive.odometerAtStart + (drive.reverse ? -distance : distance),
      curvature: drive.reverse ? -pathCurvature : pathCurvature,
      reverse: drive.reverse,
    };
  }

  lift(t: number) {
    let lift = 0;
    for (const hop of this.hops) {
      if (t < hop.start || t > hop.end) continue;
      const u = progress(t, hop.start, hop.end);
      lift += 4 * hop.height * u * (1 - u);
    }
    return lift;
  }

  doorOpenness(door: SeatName, t: number) {
    const events = this.doorEvents.filter((event) => event.door === door);
    let openness = 0;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (t < event.start) break;
      const nextStart = events[i + 1]?.start ?? Infinity;
      const until = Math.min(t, nextStart);
      const u = progress(until, event.start, event.start + event.duration);
      const swing = u * u * (3 - 2 * u);
      openness = lerp(openness, event.open ? 1 : 0, swing);
    }
    return openness;
  }

  /** Simulates the suspension once for the whole scene so every frame is deterministic. */
  finalize(duration: number) {
    const count = Math.ceil(duration / SPRING_STEP) + 2;
    const pitch = new Float32Array(count);
    const roll = new Float32Array(count);
    const heave = new Float32Array(count);
    const spring = { pitch: [0, 0], roll: [0, 0], heave: [0, 0] };
    const step = (state: number[], target: number, omega: number, damping: number) => {
      const acceleration = omega * omega * (target - state[0]) - 2 * damping * omega * state[1];
      state[1] += acceleration * SPRING_STEP;
      state[0] += state[1] * SPRING_STEP;
    };
    const impactSteps = new Map(this.impacts.map((impact) => [Math.round(impact.time / SPRING_STEP), impact]));
    for (let i = 0; i < count; i++) {
      const t = i * SPRING_STEP;
      const impact = impactSteps.get(i);
      if (impact) {
        // Body lags behind the force: pushed forward → nose up, pushed left → roof leans right.
        const local = rotate2(impact.direction, -this.kinematics(t).heading);
        const kick = Math.min(impact.speed, 15) * 0.09;
        spring.pitch[1] -= kick * local[1];
        spring.roll[1] += kick * local[0];
        spring.heave[1] -= kick * 0.4;
      }
      const { speed, acceleration, yawRate, verticalAcceleration } = this.derivatives(t);
      const nearImpact = this.impacts.some((hit) => Math.abs(hit.time - t) < 0.06);
      step(spring.pitch, nearImpact ? 0 : clamp(-0.008 * acceleration, -0.055, 0.055), 9, 0.42);
      step(spring.roll, clamp(0.012 * speed * yawRate, -0.09, 0.09), 9, 0.42);
      step(spring.heave, clamp(-0.004 * verticalAcceleration, -0.18, 0.12), 15, 0.28);
      pitch[i] = spring.pitch[0];
      roll[i] = spring.roll[0];
      heave[i] = spring.heave[0];
    }
    this.springs = { pitch, roll, heave };
  }

  state(t: number): CarState {
    const now = this.kinematics(t);
    const { speed } = this.derivatives(t);
    const steer = clamp(Math.atan(this.shape.wheelbase * now.curvature), -35 * DEG, 35 * DEG);
    const doors = {} as Record<SeatName, number>;
    for (const seat of SEAT_NAMES) doors[seat] = this.doorOpenness(seat, t);
    return {
      pos: now.pos,
      heading: now.heading,
      lift: this.lift(t),
      steer: Math.abs(speed) > 0.05 ? steer : 0,
      wheelSpin: now.odometer / this.shape.wheelRadius,
      pitch: this.sampleSpring("pitch", t),
      roll: this.sampleSpring("roll", t),
      heave: this.sampleSpring("heave", t),
      speed,
      doors,
    };
  }

  /** Convert a local [x, z] point on this car to world [x, z] at time t. */
  localToWorld(local: Vec2, t: number): Vec2 {
    const { pos, heading } = this.kinematics(t);
    return add2(pos, rotate2(local, heading));
  }

  seatWorld(seat: SeatName, t: number): { pos: Vec3; heading: number; doorStand: Vec2; side: 1 | -1 } {
    const layout = seatLayout(this.shape, seat);
    if (!layout) throw new Error(`${this.id} (${this.shape.label}) has no "${seat}" seat. It has: ${availableSeats(this.shape).join(", ")}`);
    const { heading } = this.kinematics(t);
    const seatGround = this.localToWorld(layout.seat, t);
    const height = layout.hipHeight + this.lift(t) + this.sampleSpring("heave", t);
    return { pos: [seatGround[0], height, seatGround[1]], heading, doorStand: this.localToWorld(layout.doorStand, t), side: layout.side };
  }

  /** True if the world point is inside this car's footprint (+ margin) at time t. */
  contains(point: Vec2, t: number, margin = 0.15) {
    const { pos, heading } = this.kinematics(t);
    const local = rotate2(sub2(point, pos), -heading);
    return Math.abs(local[0]) < this.shape.width / 2 + margin && Math.abs(local[1]) < this.shape.length / 2 + margin;
  }

  corners(t: number): Vec2[] {
    const halfWidth = this.shape.width / 2;
    const halfLength = this.shape.length / 2;
    return [[halfWidth, halfLength], [-halfWidth, halfLength], [-halfWidth, -halfLength], [halfWidth, -halfLength]]
      .map((corner) => this.localToWorld(corner as Vec2, t));
  }

  /** Hop takeoffs and landings are meant to be sudden. */
  hopWindows() {
    return this.hops.map((hop) => [hop.start, hop.end] as const);
  }

  /** Crash impact times: sudden stops are intended there. */
  impactWindows() {
    return this.impacts.map((impact) => [impact.time, impact.time] as const);
  }

  busyUntil() {
    const ends = this.drives.map((drive) => Math.min(drive.cut, drive.plannedEnd));
    return Math.max(0, ...ends);
  }

  /**
   * Speed and accelerations by finite differences. Near t=0 the window shifts forward,
   * so a car that enters the scene already moving doesn't register as a huge jolt.
   */
  private derivatives(t: number) {
    const h = DERIVATIVE_STEP;
    const center = Math.max(t, h);
    const before = this.kinematics(center - h);
    const now = this.kinematics(center);
    const after = this.kinematics(center + h);
    const speed = (after.odometer - before.odometer) / (2 * h);
    const acceleration = (after.odometer - 2 * now.odometer + before.odometer) / (h * h);
    const yawRate = angleDelta(before.heading, after.heading) / (2 * h);
    const verticalAcceleration = (this.lift(center + h) - 2 * this.lift(center) + this.lift(center - h)) / (h * h);
    return { speed, acceleration, yawRate, verticalAcceleration };
  }

  private sampleSpring(channel: "pitch" | "roll" | "heave", t: number) {
    if (!this.springs) return 0;
    const samples = this.springs[channel];
    const position = clamp(t / SPRING_STEP, 0, samples.length - 1);
    const index = Math.floor(position);
    const next = Math.min(index + 1, samples.length - 1);
    return lerp(samples[index], samples[next], position - index);
  }

  private activeDrive(t: number) {
    let active: DriveSegment | undefined;
    for (const drive of this.drives) if (drive.start <= t) active = drive;
    return active;
  }

  private interruptAt(t: number) {
    const active = this.activeDrive(t);
    if (active && t < active.plannedEnd) active.cut = Math.min(active.cut, t);
  }
}

export const headingToward = (from: Vec2, to: Vec2) => headingOf(sub2(to, from));

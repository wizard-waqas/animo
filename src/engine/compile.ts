import { CARS, isBike, mudSpots } from "../catalog/cars";
import { PROP_BOUNDS, SET_PROPS } from "../catalog/sets";
import { CHARACTERS, type CharacterLook } from "../catalog/characters";
import { type CameraState, CameraTrack } from "./cameraTrack";
import { type CarState, CarTrack } from "./carTrack";
import { type CharacterState, CharacterTrack, headHeight } from "./characterTrack";
import { voiceIdentity } from "../voice/voices";
import { KICK_CONTACT, clipDefinition } from "./pose";
import { type Vec2, type Vec3, DEG, add2, angleDelta, clamp, distance2, headingOf, length2, rotate2, scale2, sub2 } from "./math";
import { type Action, type PropSpec, type SceneSpec, type SetName, type SoundName, type Target, FORMAT_SIZES } from "./spec";

export interface TimelineRow { actor: string; label: string; start: number; end: number }

export interface Caption { start: number; end: number; text: string; position: "top" | "center" | "bottom"; size: "title" | "normal" }

/** A crash: where/when the cars touched, for the impact burst, debris, smoke and sound. */
export interface Crash { time: number; point: Vec3; speed: number; direction: Vec2; colors: string[]; cars: string[] }
/** Comic onomatopoeia popping up in the scene ("HONK!", "CRASH!"). */
export interface Word { text: string; start: number; end: number; actor?: string; point?: Vec3; style: "crash" | "honk" | "splat" }
/** A clump of mud in flight: thrown at `start` from `from` with velocity `velocity`, lands at `end`. */
export interface MudBlob { start: number; end: number; from: Vec3; velocity: Vec3; size: number }
/** A prop with its appearance (and traffic-light green) times resolved. */
export type ScenePropSpec = PropSpec & { fromTime?: number; greenTime?: number };
/** A taser shot: wires from the officer's hand to the target; crackling electricity while `zapEnd` hasn't passed. */
export interface Zap { start: number; zapEnd: number; wiresEnd: number; officer: string; target: string }

/** One-off sound placed with sound(...). */
export interface SoundCue { time: number; name: SoundName; point?: Vec3; volume: number }

export interface CompiledScene {
  spec: SceneSpec;
  cars: Record<string, CarTrack>;
  characters: Record<string, CharacterTrack>;
  looks: Record<string, CharacterLook>;
  camera: CameraTrack;
  captions: Caption[];
  crashes: Crash[];
  words: Word[];
  soundCues: SoundCue[];
  zaps: Zap[];
  mud: MudBlob[];
  /** Scene props (not the set's own dressing), with cue-based appearance times resolved. */
  props: ScenePropSpec[];
  /** Location cuts, in time order. The first entry is the scene's starting set at t=0. */
  locations: { time: number; set: SetName }[];
  timeline: TimelineRow[];
  /** Named entries (`.as("cue")`) with when they start and end. */
  cues: Record<string, { start: number; end: number }>;
  warnings: string[];
}

export interface FrameState {
  t: number;
  cars: Record<string, CarState>;
  characters: Record<string, CharacterState>;
  camera: CameraState;
  captions: Caption[];
  bubbles: { actor: string; text: string; start: number; end: number; head: Vec3; style: "normal" | "shout" | "shaky" }[];
  /** Crashes that have happened by time t (their effects play out after `time`). */
  crashes: Crash[];
  words: (Word & { point: Vec3 })[];
  zaps: { hand: Vec3; body: Vec3; electrified: boolean; t: number }[];
  mud: { point: Vec3; size: number; stretch: Vec3 }[];
  /** The location showing now, its scene props, and the actors that belong to another location (not drawn). */
  set: SetName;
  props: ScenePropSpec[];
  offstage: string[];
  /** Set while showing dashcam footage: the scene is shown as it was at `sourceTime`. */
  replay?: { car: string; sourceTime: number; progress: number };
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const fmtPoint = (p: Vec2) => `(${fmt(p[0])}, ${fmt(p[1])})`;

/**
 * Turn a scene spec into tracks that can be evaluated at any time.
 * Cars compile first (characters ride in them), then characters, then camera and overlays.
 */
export const compileScene = (spec: SceneSpec): CompiledScene => {
  const warnings: string[] = [];
  const timeline: TimelineRow[] = [];
  const cars: Record<string, CarTrack> = {};
  const characters: Record<string, CharacterTrack> = {};
  const looks: Record<string, CharacterLook> = {};

  for (const [id, actor] of Object.entries(spec.cast)) {
    if (actor.kind !== "car") continue;
    cars[id] = new CarTrack(id, CARS[actor.model], actor.at, actor.facing * DEG);
    if (actor.muddy) mudSpots(CARS[actor.model]).forEach((_, spot) => cars[id].addMud(spot, -Infinity));
  }
  for (const [id, actor] of Object.entries(spec.cast)) {
    if (actor.kind !== "character") continue;
    const base: CharacterLook = CHARACTERS[actor.model];
    const look = { ...base, ...stripUndefined(actor.colors) };
    looks[id] = look;
    if (actor.seatedIn && !cars[actor.seatedIn.car]) throw new Error(`${id} starts seated in unknown car "${actor.seatedIn.car}"`);
    characters[id] = new CharacterTrack(id, look, { pos: actor.at, facing: actor.facing * DEG, seatedIn: actor.seatedIn }, cars, voiceIdentity(actor.model, actor.voice));
  }

  const resolveTarget = (target: Target, t: number): { pos: Vec2; facing?: number } => {
    if (Array.isArray(target)) return { pos: target };
    const carTrack = cars[target.actor];
    const characterTrack = characters[target.actor];
    if (!carTrack && !characterTrack) throw new Error(`Unknown actor "${target.actor}" in anchor`);
    (carTrack ?? characterTrack).markRead(t);
    if (target.anchor.startsWith("door:")) {
      if (!carTrack) throw new Error(`"${target.actor}" is not a car, so it has no doors`);
      const seat = target.anchor.slice(5) as Parameters<CarTrack["seatWorld"]>[0];
      const seatInfo = carTrack.seatWorld(seat, t);
      return { pos: seatInfo.doorStand, facing: seatInfo.heading - seatInfo.side * 90 * DEG };
    }
    const spot = target.anchor as "front" | "behind" | "left" | "right";
    const distance = target.distance ?? 1;
    const { pos, heading, halfWidth, halfLength } = carTrack
      ? { ...carTrack.kinematics(t), halfWidth: carTrack.shape.width / 2, halfLength: carTrack.shape.length / 2 }
      : (() => {
          const state = characterTrack.state(t);
          return { pos: [state.pos[0], state.pos[2]] as Vec2, heading: state.facing, halfWidth: 0.15, halfLength: 0.15 };
        })();
    const localSpots: Record<typeof spot, Vec2> = {
      front: [0, halfLength + distance],
      behind: [0, -(halfLength + distance)],
      left: [halfWidth + distance, 0],
      right: [-(halfWidth + distance), 0],
    };
    const spotPos = add2(pos, rotate2(localSpots[spot], heading));
    return { pos: spotPos, facing: headingOf(sub2(pos, spotPos)) };
  };

  // Actors are planned in the order actions are written (each actor's own actions must be chronological).
  // Camera and overlays go last so they can follow and frame everyone's final motion.
  const lastEnd: Record<string, number> = {};
  const lastStart: Record<string, number> = {};
  const cueEnd: Record<string, number> = {};
  const cues: CompiledScene["cues"] = {};
  for (const entry of spec.timeline) {
    if (!entry.id) continue;
    if (spec.cast[entry.id] || SCENE_ACTORS.includes(entry.id)) throw new Error(`Cue name "${entry.id}" clashes with an actor id`);
    if (spec.timeline.filter((other) => other.id === entry.id).length > 1) throw new Error(`Cue name "${entry.id}" is used twice`);
  }
  const startOf = (entry: SceneSpec["timeline"][number]) => {
    if (entry.at !== undefined) return entry.at;
    const waitFor = entry.afterActor ?? entry.action.actor;
    const referenceEnd = cueEnd[waitFor] ?? lastEnd[waitFor];
    if (entry.afterActor && referenceEnd === undefined) {
      const isCue = spec.timeline.some((other) => other.id === waitFor);
      throw new Error(isCue
        ? `after("${waitFor}", ...): that cue must be listed earlier (camera/overlay entries are planned after everything else)`
        : `after(${waitFor}, ...): ${waitFor} has no actions listed before this point in the timeline`);
    }
    return (referenceEnd ?? 0) + (entry.after ?? 0);
  };
  const isSceneLevel = (entry: SceneSpec["timeline"][number]) => SCENE_ACTORS.includes(entry.action.actor);
  const ordered = [...spec.timeline.filter((entry) => !isSceneLevel(entry)), ...spec.timeline.filter(isSceneLevel)];
  for (const entry of spec.timeline) {
    const actor = entry.action.actor;
    if (!(actor in cars) && !(actor in characters) && !SCENE_ACTORS.includes(actor)) {
      throw new Error(`Timeline uses unknown actor "${actor}". Add it to cast.`);
    }
  }

  const camera = new CameraTrack((target, t) => {
    if (cars[target]) {
      const state = cars[target].kinematics(t);
      const lift = cars[target].lift(t);
      return { point: [state.pos[0], 0.9 + lift, state.pos[1]], heading: state.heading };
    }
    if (characters[target]) {
      const state = characters[target].state(t);
      return { point: [state.pos[0], state.pos[1] + headHeight(looks[target]) * 0.88, state.pos[2]], heading: state.facing };
    }
    throw new Error(`Camera target "${target}" is not in the cast`);
  }, FORMAT_SIZES[spec.format].fov, spec.duration);
  const captions: Caption[] = [];
  const crashes: Crash[] = [];
  const words: Word[] = [];
  const soundCues: SoundCue[] = [];
  const zaps: Zap[] = [];
  const mud: MudBlob[] = [];
  const locations: CompiledScene["locations"] = [{ time: 0, set: spec.set }];
  camera.dashcamPose = (carId, t) => {
    const track = cars[carId];
    if (!track) throw new Error(`replay: "${carId}" is not a car`);
    const { pos, heading } = track.kinematics(t);
    const front = track.shape.cabinCenter + track.shape.cabinLength / 2;
    const lift = track.lift(t);
    // At the dashcam's lens (the cabin is hidden while replaying), looking a little down the road.
    const eye = add2(pos, rotate2([0.12, front - 0.05], heading));
    const ahead = add2(pos, rotate2([0.12, front + 25], heading));
    return { position: [eye[0], track.shape.roof - 0.28 + lift, eye[1]], lookAt: [ahead[0], track.shape.roof - 1.3 + lift, ahead[1]] };
  };
  const carColor = (id: string) => {
    const actor = spec.cast[id];
    return actor.kind === "car" ? actor.color ?? CARS[actor.model].color : "#888888";
  };

  /**
   * Drive into a car (moving or parked) or a point and crash. The striker keeps going from its current
   * speed, braking at `brake` m/s² if given; the engine steps both cars forward to find the moment of contact.
   * On impact: striker bounces back, victim is shoved (by the closing speed), burst + debris + smoke + shake.
   */
  const planCrash = (strikerId: string, into: string | Vec2, start: number, options: { impactSpeed?: number; brake?: number }) => {
    const striker = cars[strikerId];
    const now = striker.kinematics(start);
    const victim = typeof into === "string" ? cars[into] : undefined;
    if (typeof into === "string" && !victim) throw new Error(`${strikerId}.crashInto: "${into}" is not a car in the cast`);
    victim?.markRead(start);
    const currentSpeed = striker.speedAt(start);
    const startSpeed = currentSpeed < 0.5 ? 0 : currentSpeed;
    const halfLength = striker.shape.length / 2;
    // Backing into something: it travels tail-first, so it keeps facing away from the hit.
    const reversing = startSpeed > 0 && now.reverse;
    const facingFor = (travel: Vec2) => headingOf(travel) + (reversing ? Math.PI : 0);

    let direction: Vec2;
    let impactTime: number;
    let impactSpeed: number;
    let stopPoint: Vec2;
    if (victim) {
      // Moving or parked victim: simulate forward until the bumpers touch.
      const parkedTarget = victim.kinematics(start).pos;
      direction = startSpeed > 0 ? rotate2([0, reversing ? -1 : 1], now.heading) : scale2(sub2(parkedTarget, now.pos), 1 / Math.max(length2(sub2(parkedTarget, now.pos)), 1e-6));
      const acceleration = startSpeed > 0 ? -(options.brake ?? 0) : 5;
      const step = 1 / 240;
      let hit: number | undefined;
      for (let elapsed = step; elapsed < 30; elapsed += step) {
        const speed = startSpeed + acceleration * elapsed;
        if (speed <= 0) throw new Error(`${strikerId}.crashInto(${victim.id}): with brake ${options.brake} it stops before reaching ${victim.id}. Use a smaller brake.`);
        const travelled = startSpeed * elapsed + 0.5 * acceleration * elapsed * elapsed;
        const strikerPos = add2(now.pos, scale2(direction, travelled));
        const target = victim.kinematics(start + elapsed);
        const offset = sub2(target.pos, strikerPos);
        const ahead = offset[0] * direction[0] + offset[1] * direction[1];
        const sideways = Math.abs(offset[0] * direction[1] - offset[1] * direction[0]);
        const forward = rotate2([0, 1], target.heading);
        const side = rotate2([1, 0], target.heading);
        const reach = Math.abs(direction[0] * forward[0] + direction[1] * forward[1]) * (victim.shape.length / 2)
          + Math.abs(direction[0] * side[0] + direction[1] * side[1]) * (victim.shape.width / 2);
        const lined_up = sideways < (victim.shape.width + striker.shape.width) / 2;
        if (lined_up && ahead > 0 && ahead - reach - halfLength <= 0.06) {
          hit = elapsed;
          break;
        }
      }
      if (hit === undefined) throw new Error(`${strikerId}.crashInto(${victim.id}): never reaches ${victim.id} — are they in the same lane, ahead of ${strikerId}?`);
      impactTime = start + hit;
      const strikerSpeed = startSpeed + acceleration * hit;
      stopPoint = add2(now.pos, scale2(direction, startSpeed * hit + 0.5 * acceleration * hit * hit));
      striker.addDrive(start, { to: stopPoint, arriveHeading: facingFor(direction), fromSpeed: startSpeed, endSpeed: strikerSpeed, easeName: "linear", reverse: reversing });
      const victimSpeed = victim.speedAt(impactTime);
      impactSpeed = Math.max(1, strikerSpeed - victimSpeed);
    } else {
      const point = into as Vec2;
      const toTarget = sub2(point, now.pos);
      direction = scale2(toTarget, 1 / Math.max(length2(toTarget), 1e-6));
      stopPoint = sub2(point, scale2(direction, halfLength + 0.06));
      impactSpeed = options.impactSpeed ?? (startSpeed > 1 ? startSpeed : 12);
      impactTime = striker.addDrive(start, {
        to: stopPoint, arriveHeading: facingFor(direction), fromSpeed: startSpeed, endSpeed: impactSpeed, easeName: "linear", reverse: reversing,
      });
    }

    const contact = add2(stopPoint, scale2(direction, halfLength + 0.03));
    striker.addImpact(impactTime, impactSpeed, scale2(direction, -1));
    striker.addShove(impactTime, scale2(direction, -(0.25 + 0.03 * impactSpeed)), 0, 0.55);
    if (victim) {
      const victimPos = victim.kinematics(impactTime).pos;
      const push = clamp(0.12 * impactSpeed + 0.25 * victim.speedAt(impactTime), 0.4, 4);
      const offCenter = direction[0] * (contact[1] - victimPos[1]) - direction[1] * (contact[0] - victimPos[0]);
      const spin = (offCenter >= 0 ? 1 : -1) * clamp(0.006 * impactSpeed, 0.02, 0.12);
      victim.addImpact(impactTime, impactSpeed, direction);
      victim.addShove(impactTime, scale2(direction, push), spin, 0.8);
    }
    const point: Vec3 = [contact[0], 0.75, contact[1]];
    crashes.push({ time: impactTime, point, speed: impactSpeed, direction, colors: [carColor(strikerId), ...(victim ? [carColor(victim.id)] : [])], cars: [strikerId, ...(victim ? [victim.id] : [])] });
    words.push({ text: "CRASH!", start: impactTime, end: impactTime + 1.1, point: [point[0], 2.4, point[2]], style: "crash" });
    camera.addShake(impactTime, clamp(0.12 + 0.025 * impactSpeed, 0.15, 0.55), 0.7);
    camera.addBreak(impactTime);
    return { end: impactTime, label: `crash into ${victim ? victim.id : fmtPoint(into as Vec2)} (closing speed ${fmt(impactSpeed)} m/s)` };
  };

  /**
   * Mud flies off the back of `truckId` and splatters onto `ontoId`: each clump is thrown on a ballistic arc
   * that lands on one of the target's mud spots exactly when (and where) the target car will be.
   */
  const planMud = (truckId: string, ontoId: string, start: number, amount: number) => {
    const truck = cars[truckId];
    const target = cars[ontoId];
    if (!target) throw new Error(`${truckId}.mud: "${ontoId}" is not a car in the cast`);
    target.markRead(start);
    const spots = mudSpots(target.shape).slice(0, amount);
    let seed = 5;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const gravity = 9.8;
    let firstLanding = Infinity;
    let lastLanding = start;
    spots.forEach((spot, index) => {
      const thrown = start + 0.32 * (index / spots.length) + random() * 0.05;
      const flight = 0.5 + random() * 0.25;
      const lands = thrown + flight;
      const releaseLocal: Vec2 = [(random() * 2 - 1) * truck.shape.width * 0.3, -truck.shape.length / 2 + 0.3];
      const release = truck.localToWorld(releaseLocal, thrown);
      const from: Vec3 = [release[0], truck.shape.roof - 0.1 + truck.lift(thrown), release[1]];
      const landing = target.localToWorld([spot.pos[0], spot.pos[2]], lands);
      const to: Vec3 = [landing[0], spot.pos[1] + target.lift(lands), landing[1]];
      const velocity: Vec3 = [(to[0] - from[0]) / flight, (to[1] - from[1] + 0.5 * gravity * flight * flight) / flight, (to[2] - from[2]) / flight];
      mud.push({ start: thrown, end: lands, from, velocity, size: spot.size });
      target.addMud(index, lands);
      firstLanding = Math.min(firstLanding, lands);
      lastLanding = Math.max(lastLanding, lands);
    });
    words.push({ text: "SPLAT!", start: firstLanding, end: firstLanding + 1.2, actor: ontoId, style: "splat" });
    return { end: lastLanding, label: `mud onto ${ontoId} (${spots.length} splats, landing ${fmt(firstLanding)}–${fmt(lastLanding)}s)` };
  };

  /**
   * Kick a passing motorcycle over: find when it comes level with the kicker, time the kick's contact to that
   * moment, then tip the bike away from the kick (it slides to a stop on its side) and throw the rider off.
   */
  const planKickOver = (kickerId: string, bikeId: string, start: number) => {
    const kicker = characters[kickerId];
    const bike = cars[bikeId];
    if (!bike || !isBike(bike.shape)) throw new Error(`${kickerId}.kickOver: "${bikeId}" is not a motorcycle in the cast`);
    const kickerState = kicker.state(start);
    const here: Vec2 = [kickerState.pos[0], kickerState.pos[2]];
    const localAt = (t: number) => {
      const { pos, heading } = bike.kinematics(t);
      return rotate2(sub2(here, pos), -heading);
    };
    let contact: number | undefined;
    for (let t = start; t < start + 30; t += 1 / 240) {
      // The foot lands on the tank, just ahead of the rider.
      if (localAt(t)[1] <= 0.3) {
        contact = t;
        break;
      }
    }
    if (contact === undefined) throw new Error(`${kickerId}.kickOver(${bikeId}): ${bikeId} never rides past ${kickerId} after ${fmt(start)}s`);
    if (localAt(contact)[1] < 0) throw new Error(`${kickerId}.kickOver(${bikeId}): ${bikeId} has already passed ${kickerId} at ${fmt(start)}s — get there earlier`);
    const lateral = localAt(contact)[0];
    if (Math.abs(lateral) > 1.6 || Math.abs(lateral) < 0.6) {
      throw new Error(`${kickerId}.kickOver(${bikeId}): ${kickerId} is ${fmt(Math.abs(lateral))}m from ${bikeId}'s path — stand 0.7–1.5m beside it`);
    }
    const kickDuration = clipDefinition("kick").defaultDuration;
    const kickStart = contact - KICK_CONTACT * kickDuration;
    if (kickStart < start) throw new Error(`${kickerId}.kickOver(${bikeId}): ${bikeId} is already level with ${kickerId} at ${fmt(start)}s — start the kick earlier`);
    const { pos: bikePos, heading } = bike.kinematics(contact);
    // Square up to the bike just before kicking.
    const facing = headingOf(sub2(bikePos, here));
    const turnStart = Math.max(start, kickStart - 0.35);
    if (Math.abs(angleDelta(kickerState.facing, facing)) > 10 * DEG) kicker.addTurn(turnStart, facing, kickStart - turnStart || 0.01);
    const kickEnd = kicker.addClip(kickStart, "kick");

    // Away from the kicker: kicked from its left (+X) it falls onto its right.
    const side = lateral > 0 ? -1 : 1;
    const away = rotate2([-Math.sign(lateral), 0], heading);
    const speed = bike.speedAt(contact);
    bike.addImpact(contact, Math.max(speed, 4), away);
    const down = bike.addTip(contact, side, { slideDecel: 6, spin: side * 0.4 });
    bike.markRead(contact);
    soundCues.push({ time: contact, name: "thud", point: [bikePos[0], 0.7, bikePos[1]], volume: 0.9 });
    soundCues.push({ time: down, name: "crash", point: [bikePos[0], 0.3, bikePos[1]], volume: 0.55 });
    words.push({ text: "WHAM!", start: contact, end: contact + 1.1, point: [bikePos[0], 2.3, bikePos[1]], style: "crash" });
    camera.addShake(contact, 0.25, 0.5);

    // The rider flies forward off the kicker's side (clear of the bike sliding along on its other side).
    let end = Math.max(kickEnd, down);
    let thrownLabel = "";
    for (const [riderId, rider] of Object.entries(characters)) {
      if (rider.seatedIn(contact)?.car !== bikeId) continue;
      const flight = 1.1;
      const landing = add2(bikePos, rotate2([Math.sign(lateral) * 1.0, Math.max(2, speed * flight * 0.6)], heading));
      const landed = rider.addThrown(contact, landing, heading, flight);
      rider.addMood(contact, "shocked");
      rider.addMood(landed, "dazed");
      soundCues.push({ time: landed, name: "thud", point: [landing[0], 0.3, landing[1]], volume: 1 });
      end = Math.max(end, landed);
      thrownLabel = `, ${riderId} thrown to ${fmtPoint(landing)}`;
    }
    return { end, label: `kicks ${bikeId} over at ${fmt(contact)}s (${fmt(speed)} m/s)${thrownLabel}` };
  };

  const runAction = (action: Action, start: number): { end: number; label: string } => {
    switch (action.type) {
      case "drive": {
        const car = cars[action.actor];
        if (!action.to && !action.through) throw new Error(`${action.actor}: drive needs "to" or "through"`);
        const to = action.to ? resolveTarget(action.to, start).pos : undefined;
        const speedBefore = car.speedAt(start);
        const end = car.addDrive(start, {
          to, through: action.through, arriveHeading: action.facing === undefined ? undefined : action.facing * DEG,
          duration: action.duration, speed: action.speed, easeName: action.ease, reverse: action.reverse,
          fromSpeed: action.fromSpeed, endSpeed: action.endSpeed,
        });
        const lastPoint = action.through?.[action.through.length - 1];
        const where = to ? `to ${fmtPoint(to)}` : `through ${action.through!.length} points, ending ${fmtPoint(lastPoint!)}`;
        const startSpeed = action.fromSpeed ?? speedBefore;
        const speeds = action.fromSpeed !== undefined || action.endSpeed !== undefined
          ? `${fmt(startSpeed)}→${fmt(action.endSpeed ?? startSpeed)} m/s`
          : action.ease;
        return { end, label: `${action.reverse ? "reverse" : "drive"} ${where} [${speeds}]` };
      }
      case "crash":
        return planCrash(action.actor, action.into, start, { impactSpeed: action.impactSpeed, brake: action.brake });
      case "honk": {
        const end = cars[action.actor].addHonk(start, action.duration, action.times);
        if (action.word) words.push({ text: action.times > 1 ? "HONK HONK!" : "HONK!", start, end: end + 0.3, actor: action.actor, style: "honk" });
        return { end, label: `honk ×${action.times}` };
      }
      case "hop":
        return { end: cars[action.actor].addHop(start, action.height, action.duration, action.sound), label: `hop ${action.height}m` };
      case "mud":
        return planMud(action.actor, action.onto, start, action.amount);
      case "location":
        locations.push({ time: start, set: action.set });
        locations.sort((a, b) => a.time - b.time);
        return { end: start, label: `cut to location "${action.set}"` };
      case "door":
        return { end: cars[action.actor].addDoor(action.door, start, action.open, action.duration), label: `${action.open ? "open" : "close"} ${action.door} door` };
      case "walk": {
        const target = resolveTarget(action.target, start);
        const endFacing = action.facing !== undefined ? action.facing * DEG : target.facing;
        const end = characters[action.actor].addWalk(start, target.pos, { run: action.run, speed: action.speed, endFacing });
        return { end, label: `${action.run ? "run" : "walk"} to ${fmtPoint(target.pos)}` };
      }
      case "turn": {
        const character = characters[action.actor];
        let facing: number;
        if (typeof action.toward === "number") facing = action.toward * DEG;
        else {
          const here = character.state(start).pos;
          if (!Array.isArray(action.toward)) (cars[action.toward.actor] ?? characters[action.toward.actor])?.markRead(start);
          const towardPos = Array.isArray(action.toward)
            ? action.toward
            : action.toward.anchor === "front" && action.toward.distance === 0.01
              ? actorGroundPos(action.toward.actor, start)
              : resolveTarget(action.toward, start).pos;
          facing = headingOf(sub2(towardPos, [here[0], here[2]]));
        }
        return { end: character.addTurn(start, facing, action.duration), label: `turn to ${fmt(facing / DEG)}°` };
      }
      case "clip":
        return { end: characters[action.actor].addClip(start, action.clip, action.duration), label: `play ${action.clip}` };
      case "say": {
        const end = characters[action.actor].addSpeech(start, action.text, action.duration);
        const line = characters[action.actor].speech[characters[action.actor].speech.length - 1];
        const recorded = line.clip ? `🎙 ${fmt(line.clip.duration)}s` : "no voice yet";
        return { end, label: `say "${line.text.replace(/\n/g, " ")}" (${recorded})` };
      }
      case "enter": {
        if (!cars[action.car]) throw new Error(`${action.actor}.enter: unknown car "${action.car}"`);
        return { end: characters[action.actor].addEnter(start, action.car, action.seat), label: `get into ${action.car} (${action.seat})` };
      }
      case "exit":
        return { end: characters[action.actor].addExit(start), label: "get out of car" };
      case "place":
        return { end: characters[action.actor].addPlace(start, action.at, action.facing === undefined ? undefined : action.facing * DEG), label: `placed at ${fmtPoint(action.at)}` };
      case "feel":
        return { end: characters[action.actor].addMood(start, action.mood), label: `feels ${action.mood}` };
      case "tase": {
        const officer = characters[action.actor];
        const target = characters[action.target];
        if (!target) throw new Error(`${action.actor}.tase: "${action.target}" is not a person in the cast`);
        target.markRead(start);
        const here = officer.state(start).pos;
        const there = target.state(start).pos;
        const aimed = officer.addTurn(start, headingOf(sub2([there[0], there[2]], [here[0], here[2]])), 0.3);
        officer.addClip(start, "point", aimed - start + action.duration);
        target.addMood(aimed, "shocked");
        const down = target.addClip(aimed, "tased", action.duration);
        target.addMood(aimed + action.duration * 0.75, "dazed");
        zaps.push({ start: aimed, zapEnd: aimed + action.duration * 0.6, wiresEnd: down + 1.2, officer: action.actor, target: action.target });
        return { end: down, label: `tases ${action.target}` };
      }
      case "yank-dashcam": {
        const person = characters[action.actor];
        const vehicle = cars[action.car];
        if (!vehicle) throw new Error(`${action.actor}.yankDashcam: "${action.car}" is not a car`);
        vehicle.markRead(start);
        const door = vehicle.seatWorld("driver", start);
        const here = person.state(start).pos;
        let reachStart = start;
        if (distance2([here[0], here[2]], door.doorStand) > 0.3) {
          reachStart = person.addWalk(start, door.doorStand, { run: true, endFacing: door.heading - door.side * 90 * DEG });
        }
        vehicle.addDoor("driver", reachStart, true, 0.35);
        const end = person.addClip(reachStart + 0.3, "reach-in", action.duration);
        vehicle.addDashcamTug(reachStart + 0.5, action.duration - 0.4);
        return { end, label: `yanks at ${action.car}'s dashcam` };
      }
      case "kick-over":
        return planKickOver(action.actor, action.car, start);
      case "siren":
        return { end: cars[action.actor].setSiren(start, action.on, action.sound), label: `siren ${action.on ? (action.sound ? "on" : "lights only") : "off"}` };
      case "sound":
        soundCues.push({ time: start, name: action.name, point: action.at, volume: action.volume });
        return { end: start, label: `sound "${action.name}"` };
      case "camera": {
        const shot = action.shot;
        if ("target" in shot && typeof shot.target === "string" && !cars[shot.target] && !characters[shot.target]) {
          throw new Error(`Camera target "${shot.target}" is not in the cast`);
        }
        const end = camera.addShot(start, shot, action.blend, action.fov);
        const subject = "target" in shot ? ` ${JSON.stringify(shot.target)}` : "";
        const preset = shot.mode === "follow" ? ` (${shot.preset})` : "";
        return { end, label: `${action.blend > 0 ? `blend ${action.blend}s → ` : "cut → "}${shot.mode}${subject}${preset}` };
      }
      case "shake":
        return { end: camera.addShake(start, action.intensity, action.duration), label: `shake ${action.intensity}` };
      case "caption":
        captions.push({ start, end: start + action.duration, text: action.text, position: action.position, size: action.size });
        return { end: start + action.duration, label: `caption "${action.text}"` };
    }
  };

  const actorGroundPos = (actor: string, t: number): Vec2 => {
    if (cars[actor]) return cars[actor].kinematics(t).pos;
    const state = characters[actor].state(t);
    return [state.pos[0], state.pos[2]];
  };

  for (const entry of ordered) {
    const actor = entry.action.actor;
    const start = startOf(entry);
    // Only actions that move the body/vehicle must be listed in time order; speech, moods, gestures,
    // honks and sirens are separate layers and can be listed anywhere.
    const layered = ["say", "feel", "honk", "siren", "door"].includes(entry.action.type)
      || (entry.action.type === "clip" && clipDefinition(entry.action.clip).layer === "gesture");
    if (!layered && lastStart[actor] !== undefined && start < lastStart[actor] - 1e-9) {
      throw new Error(`${actor}: actions must be listed in time order (one starts at ${fmt(start)}s after one at ${fmt(lastStart[actor])}s)`);
    }
    const { end, label: actionLabel } = runAction(entry.action, start);
    const label = entry.id ? `${actionLabel}  #${entry.id}` : actionLabel;
    if (!layered) lastStart[actor] = start;
    lastEnd[actor] = end;
    if (entry.id) {
      cueEnd[entry.id] = end;
      cues[entry.id] = { start, end };
    }
    timeline.push({ actor, label, start, end });
    // Driving out of shot past the end is normal; anything else running long is probably a timing mistake.
    if (end > spec.duration + 1e-6 && entry.action.type !== "drive") warnings.push(`${actor}: "${label}" ends at ${fmt(end)}s, after the scene ends (${spec.duration}s)`);
  }

  for (const [id, car] of Object.entries(cars)) {
    car.driverIn = (t) => Object.values(characters).some((person) => {
      const seat = person.seatedIn(t);
      return seat?.car === id && seat.seat === "driver";
    });
    car.finalize(spec.duration);
  }
  const resolveWhen = (prop: PropSpec, when: PropSpec["from"], what: string) => {
    if (when === undefined || typeof when === "number") return when;
    const cue = cues[when.cue];
    if (!cue) throw new Error(`A ${prop.type} prop ${what} cue "${when.cue}", which isn't in the timeline`);
    return cue.end + when.delay;
  };
  const props: ScenePropSpec[] = spec.props.map((prop) => ({
    ...prop, fromTime: resolveWhen(prop, prop.from, "appears from"), greenTime: resolveWhen(prop, prop.green, "turns green at"),
  }));
  const setAt = (t: number) => locationAt(locations, t);
  if (!camera.hasShotAt(0)) warnings.push("No camera shot at t=0 — using the default wide shot until the first camera action.");
  warnings.push(...findBlockedShots(spec, camera, props, setAt));
  const unrecorded = Object.values(characters).flatMap((track) => track.speech.filter((line) => !line.clip));
  if (spec.sound.enabled && spec.sound.voices && unrecorded.length > 0) {
    warnings.push(`${unrecorded.length} spoken line(s) have no voice recording yet (timing is estimated) — run \`npm run voices -- ${spec.id}\``);
  }
  warnings.push(...findSpeedJumps(spec.duration, cars));
  warnings.push(...findCollisions(spec, cars, characters));

  timeline.sort((a, b) => a.start - b.start || a.actor.localeCompare(b.actor));
  return { spec, cars, characters, looks, camera, captions, crashes, words, soundCues, zaps, mud, props, locations, timeline, cues, warnings };
};

const SCENE_ACTORS = ["camera", "overlay", "sound", "world"];

export const locationAt = (locations: CompiledScene["locations"], t: number) => {
  let set = locations[0].set;
  for (const location of locations) if (location.time <= t) set = location.set;
  return set;
};

/** Is this actor on screen (and audible) at time t? Actors tagged with a set only appear in that set. */
export const onstage = (scene: CompiledScene, actor: string, t: number) => {
  const spec = scene.spec.cast[actor];
  return !spec?.set || spec.set === locationAt(scene.locations, t);
};

export const evaluateScene = (scene: CompiledScene, realTime: number): FrameState => {
  // During dashcam footage the world is shown as it was earlier; the camera rides inside the car.
  const replay = scene.camera.replayAt(realTime);
  const t = replay ? replay.sourceTime : realTime;
  const cars: Record<string, CarState> = {};
  for (const [id, track] of Object.entries(scene.cars)) cars[id] = track.state(t);
  const characters: Record<string, CharacterState> = {};
  const bubbles: FrameState["bubbles"] = [];
  for (const [id, track] of Object.entries(scene.characters)) {
    const state = track.state(t);
    characters[id] = state;
    if (replay) continue;
    for (const speech of track.speech) {
      if (t < speech.start || t > speech.end) continue;
      const head: Vec3 = [state.pos[0], state.pos[1] + headHeight(scene.looks[id]) + 0.35, state.pos[2]];
      const face = state.face;
      const style = face && face.redness > 0.3 ? "shout" : face && face.tremble > 0.4 ? "shaky" : "normal";
      bubbles.push({ actor: id, text: speech.text, start: speech.start, end: speech.end, head, style });
    }
  }
  const set = locationAt(scene.locations, t);
  const offstage = Object.keys(scene.spec.cast).filter((id) => !onstage(scene, id, t));
  const mud: FrameState["mud"] = [];
  for (const blob of scene.mud) {
    if (t < blob.start || t > blob.end) continue;
    const age = t - blob.start;
    const point: Vec3 = [blob.from[0] + blob.velocity[0] * age, blob.from[1] + blob.velocity[1] * age - 4.9 * age * age, blob.from[2] + blob.velocity[2] * age];
    const vertical = blob.velocity[1] - 9.8 * age;
    mud.push({ point, size: blob.size, stretch: [blob.velocity[0], vertical, blob.velocity[2]] });
  }
  const words: FrameState["words"] = [];
  for (const word of replay ? [] : scene.words) {
    if (t < word.start || t > word.end) continue;
    const car = word.actor ? cars[word.actor] : undefined;
    const point: Vec3 = word.point ?? (car ? [car.pos[0], 1.9 + car.lift, car.pos[1]] : [0, 2, 0]);
    words.push({ ...word, point });
  }
  const zaps: FrameState["zaps"] = [];
  for (const zap of scene.zaps) {
    if (t < zap.start || t > zap.wiresEnd) continue;
    const officer = characters[zap.officer];
    const target = characters[zap.target];
    const officerHeight = scene.looks[zap.officer].height;
    const forward = rotate2([0, 1], officer.facing);
    const right = rotate2([-1, 0], officer.facing);
    const hand: Vec3 = [officer.pos[0] + forward[0] * 0.62 + right[0] * 0.24, officer.pos[1] + 1.2 * officerHeight, officer.pos[2] + forward[1] * 0.62 + right[1] * 0.24];
    // Torso follows the target's pose as they topple: hips, then up the (tilting) spine.
    const targetHeight = scene.looks[zap.target].height;
    const hip = (0.72 + target.pose.rootY) * targetHeight;
    const lean = target.pose.spineX;
    const targetForward = rotate2([0, 1], target.facing);
    const body: Vec3 = [
      target.pos[0] + targetForward[0] * Math.sin(lean) * 0.3 * targetHeight,
      target.pos[1] + hip + Math.cos(lean) * 0.3 * targetHeight,
      target.pos[2] + targetForward[1] * Math.sin(lean) * 0.3 * targetHeight,
    ];
    zaps.push({ hand, body, electrified: t < zap.zapEnd, t });
  }
  return {
    t,
    cars,
    characters,
    camera: scene.camera.state(realTime),
    captions: replay ? [] : scene.captions.filter((caption) => realTime >= caption.start && realTime <= caption.end),
    bubbles,
    crashes: scene.crashes.filter((crash) => t >= crash.time),
    words,
    zaps,
    mud,
    set,
    props: scene.props.filter((prop) => (!prop.set || prop.set === set) && (prop.fromTime === undefined || t >= prop.fromTime)),
    offstage,
    replay: replay && { car: replay.car, sourceTime: replay.sourceTime, progress: (realTime - replay.start) / (replay.end - replay.start) },
  };
};

/** Sample the scene and report people walking through cars and cars crashing into each other. */
const findCollisions = (spec: SceneSpec, cars: Record<string, CarTrack>, characters: Record<string, CharacterTrack>) => {
  const duration = spec.duration;
  const warnings = new Set<string>();
  const carIds = Object.keys(cars);
  // Actors in different locations never meet.
  const apart = (a: string, b: string) => Boolean(spec.cast[a].set && spec.cast[b].set && spec.cast[a].set !== spec.cast[b].set);
  for (let t = 0; t <= duration; t += 0.1) {
    for (const [id, character] of Object.entries(characters)) {
      const boardingCar = character.boardingAt(t);
      if (boardingCar && Math.abs(cars[boardingCar].state(t).speed) > 0.2) {
        warnings.add(`${boardingCar} is moving while ${id} gets in/out around t=${fmt(Math.round(t * 2) / 2)}s`);
      }
      if (character.isInVehicle(t)) continue;
      const state = character.state(t);
      const point: Vec2 = [state.pos[0], state.pos[2]];
      for (const carId of carIds) {
        if (apart(id, carId)) continue;
        if (cars[carId].contains(point, t, 0.1)) warnings.add(`${id} overlaps ${carId} around t=${fmt(Math.round(t * 2) / 2)}s (walking through it, or the car drives through them?)`);
      }
    }
    for (let i = 0; i < carIds.length; i++) {
      for (let j = i + 1; j < carIds.length; j++) {
        if (apart(carIds[i], carIds[j])) continue;
        const a = cars[carIds[i]];
        const b = cars[carIds[j]];
        const touching = a.corners(t).some((corner) => b.contains(corner, t, 0)) || b.corners(t).some((corner) => a.contains(corner, t, 0));
        if (touching) warnings.add(`${carIds[i]} and ${carIds[j]} overlap around t=${fmt(Math.round(t * 2) / 2)}s`);
      }
    }
    const characterIds = Object.keys(characters);
    for (let i = 0; i < characterIds.length; i++) {
      for (let j = i + 1; j < characterIds.length; j++) {
        if (apart(characterIds[i], characterIds[j])) continue;
        const a = characters[characterIds[i]];
        const b = characters[characterIds[j]];
        if (a.isInVehicle(t) || b.isInVehicle(t)) continue;
        const pa = a.state(t).pos;
        const pb = b.state(t).pos;
        if (distance2([pa[0], pa[2]], [pb[0], pb[2]]) < 0.45) warnings.add(`${characterIds[i]} and ${characterIds[j]} are inside each other around t=${fmt(Math.round(t * 2) / 2)}s`);
      }
    }
  }
  return dedupeByActorPair([...warnings]);
};

/** Warn when set dressing sits between the camera and what it's looking at (or the camera is inside a prop). */
const findBlockedShots = (spec: SceneSpec, camera: CameraTrack, sceneProps: ScenePropSpec[], setAt: (t: number) => SetName) => {
  const warnings = new Map<string, number[]>();
  for (let t = 0; t <= spec.duration; t += 0.25) {
    const { position, lookAt } = camera.state(t);
    // During a dashcam replay the camera is in the earlier moment's location.
    const set = setAt(camera.replayAt(t)?.sourceTime ?? t);
    const props = [...SET_PROPS[set], ...sceneProps.filter((prop) => (!prop.set || prop.set === set) && (prop.fromTime === undefined || t >= prop.fromTime))];
    for (const prop of props) {
      const bounds = PROP_BOUNDS[prop.type];
      const radius = bounds.radius * prop.scale;
      const height = bounds.height * prop.scale;
      for (let u = 0; u <= 0.9; u += 0.05) {
        const x = position[0] + (lookAt[0] - position[0]) * u;
        const y = position[1] + (lookAt[1] - position[1]) * u;
        const z = position[2] + (lookAt[2] - position[2]) * u;
        if (y < height + (prop.y ?? 0) && y > (prop.y ?? 0) && Math.hypot(x - prop.at[0], z - prop.at[1]) < radius) {
          const key = `${prop.type} at ${fmtPoint(prop.at)}`;
          warnings.set(key, [...(warnings.get(key) ?? []), t]);
          break;
        }
      }
    }
  }
  return [...warnings.entries()].map(([prop, times]) =>
    `A ${prop} blocks the camera's view from t=${fmt(times[0])}s to t=${fmt(times[times.length - 1])}s — move the camera or the prop`,
  );
};

/** A car going from 0 to full speed (or full speed to 0) in one frame looks broken. Usually the wrong ease. */
const findSpeedJumps = (duration: number, cars: Record<string, CarTrack>) => {
  const warnings: string[] = [];
  const step = 1 / 30;
  for (const [id, car] of Object.entries(cars)) {
    const nearImpact = (t: number) =>
      car.impacts.some((impact) => t > impact.time - 0.25 && t < impact.time + 0.25)
      || car.launches.some((launch) => t > launch - 0.25 && t < launch + 0.25);
    // Stop short of the end: the speed estimate looks slightly past t, and nothing moves after the scene ends.
    for (let t = 0.1; t < duration - step - 0.05; t += step) {
      if (nearImpact(t)) continue;
      const before = car.state(t).speed;
      const after = car.state(t + step).speed;
      if (Math.abs(after - before) > 3) {
        const what = Math.abs(after) < Math.abs(before) ? "stops dead" : "jumps to full speed";
        warnings.push(`${id} ${what} at t=${fmt(t)}s (${fmt(Math.abs(before))} → ${fmt(Math.abs(after))} m/s). Use ease "cruise"/"arrive" to slow down, "cruise"/"depart" to start from a stop, or keep the drive going past the end of the scene.`);
        break;
      }
    }
  }
  return warnings;
};

/** Keep only the first time each pair collides so the report stays short. */
const dedupeByActorPair = (warnings: string[]) => {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = warning.replace(/around t=.*$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const stripUndefined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * Smoothness check: sample every frame and report hitches — a sudden change in velocity or acceleration
 * (a spike in the third difference, i.e. jerk) in the camera or any actor. Fast but smooth moves pass.
 * Hard cuts, camera shakes and car hop takeoffs/landings are skipped because those are meant to be abrupt.
 */
export const findJolts = (scene: CompiledScene, fps = 60) => {
  const frames = Math.floor(scene.spec.duration * fps);
  const margin = 3 / fps;
  const near = (t: number, windows: (readonly [number, number])[]) =>
    windows.some(([start, end]) => t > start - margin && t < end + margin) ||
    windows.some(([start, end]) => Math.abs(t - start) < margin || Math.abs(t - end) < margin);
  const replays = scene.camera.replayWindows().map((window) => [window.start, window.end] as const);
  const cameraSkips = [...scene.camera.cutTimes().map((cut) => [cut, cut] as const), ...scene.camera.shakeWindows(), ...replays];
  const skipsFor = (key: string) => {
    if (key.startsWith("camera")) return cameraSkips;
    if (scene.camera.replayWindows().length) return [...replays, ...skipsForActor(key)];
    return skipsForActor(key);
  };
  const skipsForActor = (key: string) => {
    // Hop takeoffs/landings are meant to be sudden — for the car and anyone riding in it.
    const hopMoments = (car: CarTrack) => [
      ...car.hopWindows().flatMap(([start, end]) => [[start, start], [end, end]] as const),
      ...car.impactWindows(),
      ...car.launches.map((launch) => [launch, launch] as const),
    ];
    if (scene.cars[key]) return hopMoments(scene.cars[key]);
    const teleports = (scene.characters[key]?.jumps ?? []).map((time) => [time, time] as const);
    return [...Object.values(scene.cars).flatMap(hopMoments), ...teleports];
  };
  const tracks: Record<string, Vec3[]> = {};
  const push = (key: string, point: Vec3) => (tracks[key] ??= []).push(point);
  for (let frame = 0; frame <= frames; frame++) {
    const state = evaluateScene(scene, frame / fps);
    push("camera", state.camera.position);
    push("camera aim", state.camera.lookAt);
    for (const [id, car] of Object.entries(state.cars)) push(id, [car.pos[0], car.lift, car.pos[1]]);
    for (const [id, person] of Object.entries(state.characters)) push(id, person.pos);
  }
  // Third difference in meters. 0.006 ≈ a 0.35 m/s velocity jump or a 20 m/s² acceleration jump at 60fps.
  const threshold = 0.006 * (60 / fps) ** 3;
  const jolts: string[] = [];
  for (const [key, points] of Object.entries(tracks)) {
    const skips = skipsFor(key);
    for (let i = 1; i < points.length - 2; i++) {
      const t = i / fps;
      if (near(t, skips as (readonly [number, number])[])) continue;
      const jerk = Math.hypot(
        ...[0, 1, 2].map((axis) => points[i + 2][axis] - 3 * points[i + 1][axis] + 3 * points[i][axis] - points[i - 1][axis]),
      );
      if (jerk > threshold) {
        jolts.push(key.startsWith("camera")
          ? `${key} lurches at t=${fmt(t)}s — the camera moves too far too fast (use a longer blend, or a hard cut)`
          : `${key} hitches at t=${fmt(t)}s — sudden change in speed`);
        i += Math.round(fps / 2);
      }
    }
  }
  return jolts;
};

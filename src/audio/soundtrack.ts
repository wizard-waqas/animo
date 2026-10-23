import type { CompiledScene } from "../engine/compile";
import type { Vec3 } from "../engine/math";
import { PUNCH_BEAT, STRIDE } from "../engine/pose";
import type { SoundName } from "../engine/spec";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Lowpass, Rng, SAMPLE_RATE, StereoBus, decodeWav, panGains } from "./dsp";
import * as sounds from "./sounds";

/**
 * Build the whole soundtrack from the compiled scene. Nothing is placed by hand:
 * - footsteps land on each foot plant of the walk cycle; engines follow each car's speed;
 *   tire squeal kicks in on hard braking or tight turns; doors, hops and clips make their own sounds;
 * - honks, crashes and sound() cues come from the timeline;
 * - every sound is panned and attenuated by where it is relative to the camera.
 */

export interface SoundEvent { time: number; kind: string; actor?: string }
export interface Soundtrack { bus: StereoBus; events: SoundEvent[]; screech: { actor: string; start: number; end: number }[] }

const GAINS = { footstep: 0.32, door: 0.5, engine: 0.55, tires: 0.5, screech: 0.32, honk: 0.5, crash: 1.0, hop: 0.6, clip: 0.45, ambience: 1, voice: 0.95 };

export const buildSoundtrack = (scene: CompiledScene): Soundtrack => {
  const duration = scene.spec.duration;
  const bus = new StereoBus(duration);
  const events: SoundEvent[] = [];
  const screechSpans: Soundtrack["screech"] = [];
  const rng = new Rng(duration * 31 + scene.spec.id.length);

  /** Gain and pan for a sound at `point`, heard from the camera at time t. */
  const placement = (point: Vec3 | undefined, t: number) => {
    if (!point) return { gain: 1, pan: 0 };
    const camera = scene.camera.state(Math.min(Math.max(t, 0), duration));
    const forward = normalize(sub(camera.lookAt, camera.position));
    const right = normalize([-forward[2], 0, forward[0]]);
    const offset = sub(point, camera.position);
    const distance = Math.hypot(offset[0], offset[1], offset[2]);
    const direction = distance > 1e-6 ? [offset[0] / distance, offset[1] / distance, offset[2] / distance] : [0, 0, 0];
    const pan = Math.max(-1, Math.min(1, (direction[0] * right[0] + direction[2] * right[2]) * 1.2)) * 0.8;
    const gain = 1 / (1 + Math.max(0, distance - 4) / 7);
    return { gain, pan };
  };
  const play = (sound: Float32Array, time: number, point: Vec3 | undefined, level: number, kind: string, actor?: string) => {
    if (time >= duration) return;
    const { gain, pan } = placement(point, time);
    bus.place(sound, time, gain * level, pan);
    events.push({ time, kind, actor });
  };

  // ----- people
  for (const [id, track] of Object.entries(scene.characters)) {
    const look = scene.looks[id];
    const step = 1 / 240;
    let previousLeft: number | undefined;
    let previousRight: number | undefined;
    for (let t = 0; t < duration; t += step) {
      const state = track.state(t);
      if (!state.gait || state.ridingIn || state.gait.weight < 0.3) {
        previousLeft = previousRight = undefined;
        continue;
      }
      const stride = state.gait.run ? STRIDE.run : STRIDE.walk;
      const left = Math.floor(state.gait.distance / stride + 0.25);
      const right = Math.floor(state.gait.distance / stride + 0.75);
      const planted = (previousLeft !== undefined && left !== previousLeft) || (previousRight !== undefined && right !== previousRight);
      if (planted) {
        const level = GAINS.footstep * Math.min(1.2, state.gait.weight + 0.2) * (state.gait.run ? 1.35 : 1);
        play(sounds.footstep(rng, look.height, state.gait.run), t, state.pos, level, "footstep", id);
      }
      previousLeft = left;
      previousRight = right;
    }
    for (const segment of track.segments) {
      if (segment.kind !== "clip" || segment.start >= Math.min(segment.cut, segment.end)) continue;
      const length = segment.end - segment.start;
      const at = (fraction: number) => segment.start + length * fraction;
      const where = track.state(segment.start).pos;
      if (segment.clip === "jump") play(sounds.thud(rng, look.height), at(0.75), where, GAINS.clip, "jump-land", id);
      if (segment.clip === "knocked-out") play(sounds.thud(rng, look.height * 1.5), at(0.72), where, GAINS.clip * 1.3, "fall", id);
      if (segment.clip === "fall-over") play(sounds.thud(rng, look.height * 1.3), at(0.5), where, GAINS.clip * 1.2, "fall", id);
      if (segment.clip === "dance") for (let beat = segment.start; beat < segment.end; beat += 1 / 1.1) play(sounds.footstep(rng, look.height, false), beat, where, GAINS.footstep, "footstep", id);
    }
    for (const gesture of track.gestures) {
      const where = track.state(gesture.start).pos;
      if (gesture.clip === "punch") {
        // Each punch reaches full extension 40% into its beat.
        for (let time = gesture.start + PUNCH_BEAT * 0.4; time < gesture.end; time += PUNCH_BEAT) {
          play(sounds.smack(rng), time, [where[0], 1.4, where[2]], GAINS.clip * 1.4, "punch", id);
        }
        continue;
      }
      if (gesture.clip !== "clap") continue;
      // The clap pose closes the hands at t = (0.75 + k) / 3 seconds.
      for (let k = 0; ; k++) {
        const time = gesture.start + (0.75 + k) / 3;
        if (time > gesture.end - 0.1) break;
        if (time > gesture.start + 0.15) play(sounds.clap(rng), time, [where[0], 1.2, where[2]], GAINS.clip, "clap", id);
      }
    }
  }

  // ----- cars: one-shots
  for (const [id, car] of Object.entries(scene.cars)) {
    const carPoint = (t: number): Vec3 => {
      const { pos } = car.kinematics(t);
      return [pos[0], 0.8, pos[1]];
    };
    for (const door of car.doorMoves()) {
      if (door.open) play(sounds.doorOpen(rng), door.start, carPoint(door.start), GAINS.door * 0.7, "door-open", id);
      else play(sounds.doorSlam(rng), door.start + door.duration * 0.85, carPoint(door.start), GAINS.door, "door-slam", id);
    }
    for (const [start, end] of car.hopWindows()) {
      play(sounds.boing(), start, carPoint(start), GAINS.hop, "boing", id);
      play(sounds.thud(rng, 1.6), end, carPoint(end), GAINS.hop, "hop-land", id);
    }
    for (const horn of car.honks) {
      for (let i = 0; i < horn.times; i++) {
        const time = horn.start + i * (horn.duration + 0.12);
        play(sounds.honk(horn.duration), time, carPoint(time), GAINS.honk, "honk", id);
      }
    }
  }
  for (const hit of scene.crashes) {
    const strength = Math.max(0.55, Math.min(1.3, hit.speed / 11));
    play(sounds.crash(rng, strength), hit.time, hit.point, GAINS.crash, "crash", hit.cars.join("+"));
  }
  for (const zapShot of scene.zaps) {
    const target = scene.characters[zapShot.target].state(zapShot.start).pos;
    play(sounds.zap(rng, zapShot.zapEnd - zapShot.start), zapShot.start, [target[0], 1, target[2]], 0.55, "taser", zapShot.target);
  }
  for (const [id, car] of Object.entries(scene.cars)) {
    for (const tug of car.dashcamTugs) {
      const { pos } = car.kinematics(tug.start);
      play(sounds.rattle(rng, tug.end - tug.start), tug.start, [pos[0], 1.4, pos[1]], 0.5, "dashcam-rattle", id);
    }
  }
  for (const cue of scene.soundCues) {
    play(oneShot(cue.name, rng), cue.time, cue.point, cue.volume * 0.7, cue.name);
  }

  // ----- cars: continuous engine, tire roll and squeal
  for (const [id, car] of Object.entries(scene.cars)) {
    screechSpans.push(...renderCar(scene, id, car, bus, placement, rng));
  }

  // ----- dialogue: recorded voice lines, kept clear (gentle distance falloff) and panned to the speaker
  if (scene.spec.sound.voices) {
    for (const [id, track] of Object.entries(scene.characters)) {
      for (const line of track.speech) {
        if (!line.clip) continue;
        const file = path.resolve("voices", line.clip.file);
        if (!existsSync(file)) continue;
        const voice = decodeWav(readFileSync(file));
        const { pan, gain } = placement(track.state(line.start).pos, line.start);
        bus.place(voice, line.start, GAINS.voice * Math.max(0.7, gain), pan * 0.6);
        events.push({ time: line.start, kind: "voice", actor: id });
      }
    }
  }

  if (scene.spec.sound.ambience) renderAmbience(scene, bus, rng);
  // Dashcam replays play the original moment's audio, as if from a small screen (thin, band-limited).
  for (const window of scene.camera.replayWindows()) {
    const highpass = [new Lowpass(320), new Lowpass(320)];
    const lowpass = [new Lowpass(4200), new Lowpass(4200)];
    const from = Math.round(window.from * SAMPLE_RATE);
    const start = Math.round(window.start * SAMPLE_RATE);
    const length = Math.round((window.end - window.start) * SAMPLE_RATE);
    for (let i = 0; i < length; i++) {
      const source = from + i;
      const target = start + i;
      if (target >= bus.left.length || source >= bus.left.length) break;
      const fade = Math.min(1, i / 2205, (length - i) / 2205);
      const channels = [bus.left, bus.right];
      channels.forEach((channel, c) => {
        const thin = lowpass[c].process(channel[source]);
        const filtered = thin - highpass[c].process(thin);
        channel[target] = channel[target] * (1 - fade) + filtered * 1.25 * fade;
      });
    }
    events.push({ time: window.start, kind: "replay" });
  }
  bus.master(0.9 * scene.spec.sound.volume);
  events.sort((a, b) => a.time - b.time);
  return { bus, events, screech: screechSpans };
};

const oneShot = (name: SoundName, rng: Rng) => {
  switch (name) {
    case "crash": return sounds.crash(rng, 1);
    case "honk": return sounds.honk(0.45);
    case "boing": return sounds.boing();
    case "thud": return sounds.thud(rng, 1.3);
    case "whoosh": return sounds.whoosh(rng);
    case "door-slam": return sounds.doorSlam(rng);
    case "pop": return sounds.pop();
    case "screech": return sounds.screech(rng);
  }
};

/** Engine (pitch follows speed, revs on acceleration), tire rumble, and squeal on hard braking/cornering. */
const renderCar = (
  scene: CompiledScene,
  id: string,
  car: CompiledScene["cars"][string],
  bus: StereoBus,
  placement: (point: Vec3, t: number) => { gain: number; pan: number },
  rng: Rng,
) => {
  const duration = scene.spec.duration;
  const block = 1 / 200;
  const blocks = Math.ceil(duration / block) + 2;
  const speed = new Float32Array(blocks);
  const occupied = new Uint8Array(blocks);
  for (let b = 0; b < blocks; b++) {
    const t = Math.min(b * block, duration);
    speed[b] = Math.abs(car.state(t).speed);
    if (b % 10 === 0) occupied[b] = Object.values(scene.characters).some((person) => person.state(t).ridingIn === id) ? 1 : 0;
    else occupied[b] = occupied[b - (b % 10)];
  }
  const engineFilter = new Lowpass(300);
  const tireFilter = new Lowpass(300);
  const squealer = new sounds.Squeal(rng);
  const siren = new sounds.Siren();
  let sirenLevel = 0;
  let phase = 0;
  let engineLevel = 0;
  let squealLevel = 0;
  const spans: { actor: string; start: number; end: number }[] = [];
  let squealStart: number | undefined;
  let mix = { gain: 0, pan: 0 };
  for (let i = 0; i < bus.left.length; i++) {
    const t = i / SAMPLE_RATE;
    const b = Math.min(blocks - 2, Math.floor(t / block));
    const fraction = t / block - b;
    const v = speed[b] + (speed[b + 1] - speed[b]) * fraction;
    const acceleration = (speed[b + 1] - speed[Math.max(0, b - 1)]) / (2 * block);
    if (i % 441 === 0) {
      const { pos } = car.kinematics(t);
      mix = placement([pos[0], 0.6, pos[1]], t);
    }
    const running = occupied[b] === 1 || v > 0.2;
    const engineTarget = running ? 0.1 + 0.011 * Math.min(v, 30) + 0.02 * Math.max(0, Math.min(acceleration, 6)) : 0;
    engineLevel += (engineTarget - engineLevel) * 0.0008;
    const frequency = 26 + 3.1 * v + 1.6 * Math.max(0, Math.min(acceleration, 8));
    phase = (phase + frequency / SAMPLE_RATE) % 1;
    const saw = 2 * phase - 1;
    const saw2 = 2 * ((phase * 2) % 1) - 1;
    const putter = phase < 0.18 ? 1 : 0;
    engineFilter.set(280 + 26 * v + 50 * Math.max(0, acceleration));
    const engine = engineFilter.process(saw * 0.6 + saw2 * 0.3 + putter * 0.5 + rng.noise() * 0.08) * engineLevel;

    tireFilter.set(200 + 20 * v);
    const tires = tireFilter.process(rng.noise()) * Math.min(0.14, 0.0045 * v);

    // A crash stops the car instantly — that's not braking, so no squeal there.
    const nearImpact = car.impacts.some((impact) => t > impact.time - 0.05 && t < impact.time + 0.6);
    const braking = v > 2 && !nearImpact ? Math.max(0, Math.min(1, (-acceleration - 4.5) / 5)) : 0;
    const squealTarget = braking;
    squealLevel += (squealTarget - squealLevel) * (squealTarget > squealLevel ? 0.0016 : 0.00018);
    const squealTone = squealer.next();
    const squeal = squealLevel > 0.01 ? squealTone * squealLevel : 0;
    if (squealLevel > 0.15 && squealStart === undefined) squealStart = t;
    if (squealLevel <= 0.15 && squealStart !== undefined) {
      spans.push({ actor: id, start: squealStart, end: t });
      squealStart = undefined;
    }

    sirenLevel += ((car.sirenSoundOn(t) ? 1 : 0) - sirenLevel) * 0.0004;
    const wail = sirenLevel > 0.001 ? siren.next(t) * sirenLevel : 0;
    const value = (engine * GAINS.engine + tires * GAINS.tires + squeal * GAINS.screech + wail * 0.28) * mix.gain;
    const [left, right] = panGains(mix.pan);
    bus.addAt(i, value * left, value * right);
  }
  if (squealStart !== undefined) spans.push({ actor: id, start: squealStart, end: duration });
  return spans;
};

/** Background bed per set/style: birds + breeze (suburb), traffic hum (city), road roar (highway), crickets (night). */
const renderAmbience = (scene: CompiledScene, bus: StereoBus, rng: Rng) => {
  const { set, style } = scene.spec;
  const night = style === "night";
  const windLeft = new Lowpass(set === "highway" ? 520 : set === "city" ? 180 : 320);
  const windRight = new Lowpass(set === "highway" ? 520 : set === "city" ? 180 : 320);
  const windLevel = set === "highway" ? 0.05 : set === "city" ? 0.07 : 0.025;
  for (let i = 0; i < bus.left.length; i++) {
    const swell = 0.75 + 0.25 * Math.sin((i / SAMPLE_RATE) * 0.7);
    bus.addAt(i, windLeft.process(rng.noise()) * windLevel * swell, windRight.process(rng.noise()) * windLevel * swell);
  }
  const duration = scene.spec.duration;
  if (!night && (set === "suburb" || set === "narrow-street" || set === "highway" || set === "parking-lot")) {
    for (let t = rng.range(0.2, 1.2); t < duration; t += rng.range(0.7, 2.6)) {
      const chirp = birdChirp(rng);
      bus.place(chirp, t, set === "suburb" || set === "narrow-street" ? 0.09 : 0.04, rng.range(-0.9, 0.9));
    }
  }
  if (night) {
    for (const [rate, pitch, pan] of [[2.1, 4400, -0.6], [2.7, 4750, 0.6]] as const) {
      for (let t = rng.range(0, 0.4); t < duration; t += 1 / rate) {
        bus.place(cricket(pitch), t, 0.035, pan);
      }
    }
  }
};

const birdChirp = (rng: Rng) => {
  const notes = 2 + Math.floor(rng.next() * 3);
  const base = rng.range(2800, 3600);
  const length = notes * 0.085;
  const out = new Float32Array(Math.round(length * SAMPLE_RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const note = Math.floor(t / 0.085);
    const local = t - note * 0.085;
    if (local > 0.055) continue;
    const frequency = base + 1400 * (local / 0.055) + note * 120;
    phase += frequency / SAMPLE_RATE;
    out[i] = Math.sin(2 * Math.PI * phase) * Math.sin(Math.PI * (local / 0.055)) * 0.8;
  }
  return out;
};

const cricket = (pitch: number) => {
  const length = 0.18;
  const out = new Float32Array(Math.round(length * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const pulse = Math.floor(t / 0.03) % 2 === 0 ? 1 : 0;
    out[i] = Math.sin(2 * Math.PI * pitch * t) * pulse * Math.sin(Math.PI * (t / length));
  }
  return out;
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const normalize = (v: Vec3 | number[]): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

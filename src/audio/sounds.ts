import { Bandpass, Highpass, Lowpass, type Rng, SAMPLE_RATE, attack, decay, synth } from "./dsp";

/**
 * One-shot sound recipes. Each returns a mono buffer. They're cartoon-flavored on purpose:
 * punchy transients, exaggerated pitch moves, short tails.
 */
const TAU = Math.PI * 2;

/** Shoe on pavement: filtered noise tick + a soft heel thump. `weight` ~ body size, `hard` for running. */
export const footstep = (rng: Rng, weight: number, hard: boolean) => {
  const band = new Bandpass(rng.range(650, 1100) * (hard ? 1.25 : 1), 0.9);
  const thumpPitch = rng.range(80, 105) / Math.max(0.6, weight);
  return synth(0.11, (t) => {
    const scuff = band.process(rng.noise()) * decay(t, hard ? 0.016 : 0.022) * 1.6;
    const thump = Math.sin(TAU * thumpPitch * t) * decay(t, 0.022) * 0.7 * weight;
    return (scuff + thump) * attack(t, 0.002) * (hard ? 1.2 : 0.85);
  });
};

export const doorOpen = (rng: Rng) => {
  const click = new Bandpass(2300, 2);
  const creak = new Bandpass(rng.range(600, 750), 8);
  return synth(0.35, (t) => {
    const latch = click.process(rng.noise()) * decay(t, 0.012) * 1.4;
    const hinge = creak.process(rng.noise()) * Math.sin(Math.PI * Math.min(1, t / 0.32)) * 0.35 * (t > 0.04 ? 1 : 0);
    return latch + hinge;
  });
};

export const doorSlam = (rng: Rng) => {
  const body = new Lowpass(500);
  const rattle = new Bandpass(1300, 3);
  return synth(0.4, (t) => {
    const thump = Math.sin(TAU * (78 - 20 * t) * t) * decay(t, 0.09) * 1.1;
    const hit = body.process(rng.noise()) * decay(t, 0.03) * 1.4;
    const shake = rattle.process(rng.noise()) * decay(t, 0.07) * 0.5;
    return (thump + hit + shake) * attack(t, 0.001);
  });
};

/** Classic two-tone car horn (F# + A#, slightly sour), band-limited square waves. */
export const honk = (duration: number) => {
  const tone = new Lowpass(2600);
  const tones = [370, 466];
  return synth(duration + 0.06, (t) => {
    const vibrato = 1 + 0.004 * Math.sin(TAU * 6 * t);
    let wave = 0;
    for (const base of tones) {
      for (let harmonic = 1; harmonic <= 9; harmonic += 2) wave += Math.sin(TAU * base * harmonic * vibrato * t) / harmonic;
    }
    const envelope = attack(t, 0.008) * (t > duration ? decay(t - duration, 0.018) : 1);
    return tone.process(wave * 0.5) * envelope;
  });
};

/** Big cartoon crash: low boom, crunchy noise, ringing metal, tinkling glass, bits rattling down. */
export const crash = (rng: Rng, strength: number) => {
  const crunch = new Lowpass(2500);
  const glassFilter = new Highpass(4500);
  const metal = [430, 1013, 1588, 2290, 3170].map((frequency) => ({
    frequency: frequency * rng.range(0.94, 1.06), tau: rng.range(0.25, 0.7), level: rng.range(0.08, 0.16),
  }));
  const pings = Array.from({ length: 22 }, () => {
    const time = Math.pow(rng.next(), 1.8) * 0.6;
    return { time, frequency: rng.range(2800, 7500), tau: rng.range(0.04, 0.11), level: rng.range(0.05, 0.13) };
  });
  const rattles = Array.from({ length: 12 }, () => ({ time: rng.range(0.25, 1.2), frequency: rng.range(1400, 3200), level: rng.range(0.08, 0.2) }));
  const rattleFilters = rattles.map((rattle) => new Bandpass(rattle.frequency, 4));
  let grain = 1;
  return synth(1.7, (t, i) => {
    if (i % 300 === 0) grain = 0.35 + 0.65 * rng.next();
    crunch.set(2500 * decay(t, 0.25) + 500);
    const boom = Math.sin(TAU * (95 * decay(t, 0.18) + 38) * t) * decay(t, 0.28) * 1.0;
    const crunchy = crunch.process(rng.noise()) * grain * decay(t, 0.16) * 1.3;
    let ring = 0;
    for (const partial of metal) ring += Math.sin(TAU * partial.frequency * t) * partial.level * decay(t, partial.tau);
    let glass = glassFilter.process(rng.noise()) * decay(t, 0.05) * 0.35;
    for (const ping of pings) {
      if (t < ping.time) continue;
      const age = t - ping.time;
      glass += Math.sin(TAU * ping.frequency * age) * ping.level * decay(age, ping.tau);
    }
    let bits = 0;
    rattles.forEach((rattle, index) => {
      if (t < rattle.time || t > rattle.time + 0.05) return;
      bits += rattleFilters[index].process(rng.noise()) * rattle.level * decay(t - rattle.time, 0.01) * 3;
    });
    return (boom + crunchy + ring + glass + bits) * attack(t, 0.0015) * strength;
  });
};

/** Cartoon spring "boing" for car hops. */
export const boing = () =>
  synth(0.55, (t) => {
    const sweep = 150 + 330 * Math.min(1, t / 0.16);
    const wobble = 1 + 0.08 * Math.sin(TAU * 18 * t) * decay(t, 0.25);
    return Math.sin(TAU * sweep * wobble * t) * decay(t, 0.2) * attack(t, 0.004) * 0.8;
  });

/** Soft landing thud (jumps, falls, hop landings). */
export const thud = (rng: Rng, weight = 1) => {
  const body = new Lowpass(420);
  return synth(0.25, (t) => {
    const low = Math.sin(TAU * 68 * t) * decay(t, 0.07);
    const hit = body.process(rng.noise()) * decay(t, 0.03) * 1.2;
    return (low + hit) * weight * attack(t, 0.001);
  });
};

export const clap = (rng: Rng) => {
  const band = new Bandpass(rng.range(1200, 1700), 1.2);
  return synth(0.09, (t) => band.process(rng.noise()) * (decay(t, 0.012) + 0.4 * decay(Math.max(0, t - 0.006), 0.01)) * 2.2);
};

export const whoosh = (rng: Rng) => {
  const band = new Bandpass(500, 1.5);
  return synth(0.7, (t) => {
    const shape = Math.sin(Math.PI * Math.min(1, t / 0.7));
    band.set(400 + 2100 * shape, 1.5);
    return band.process(rng.noise()) * shape * 1.4;
  });
};

export const pop = () => synth(0.08, (t) => Math.sin(TAU * (600 + 9000 * t) * t) * decay(t, 0.018) * 0.8);

/**
 * Tire squeal oscillator. Keeps its own phase so the wobbling pitch stays a clean squeal
 * (computing sin(pitch(t) · t) instead would smear into noise as t grows).
 */
export class Squeal {
  private phase = 0;
  private time = 0;
  private readonly band = new Bandpass(2400, 3);
  constructor(private readonly rng: Rng) {}
  next() {
    this.time += 1 / SAMPLE_RATE;
    const pitch = 1850 + 120 * Math.sin(TAU * 27 * this.time) + 60 * Math.sin(TAU * 4.3 * this.time);
    this.phase = (this.phase + pitch / SAMPLE_RATE) % 1;
    const tone = Math.sin(TAU * this.phase) + 0.3 * Math.sin(TAU * ((this.phase * 2.01) % 1));
    return tone * 0.7 + this.band.process(this.rng.noise()) * 0.5;
  }
}

export const screech = (rng: Rng) => {
  const squeal = new Squeal(rng);
  return synth(0.9, (t) => squeal.next() * attack(t, 0.03) * decay(Math.max(0, t - 0.5), 0.12) * 0.5);
};

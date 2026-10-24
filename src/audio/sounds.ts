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

/**
 * Car crash. Built only from noise (no sustained tones — those read as a bell):
 * - a heavy body thump (very low, ~40ms), the impact itself;
 * - sheet-metal crunch: several band-limited noise bursts in the 250–2500 Hz range that buckle in
 *   over ~150ms with rough, grainy amplitude;
 * - plastic cracks: sharp broadband clicks in the first 100ms;
 * - glass shatter: a dense spray of tiny high-frequency noise grains that thins out over ~0.6s;
 * - debris settling: small scattered ticks and scrapes up to ~1.4s.
 */
export const crash = (rng: Rng, strength: number) => {
  const thumpFilter = new Lowpass(180);
  const crunchBands = [320, 650, 1100, 1800, 2600].map((frequency) => ({
    filter: new Bandpass(frequency * rng.range(0.85, 1.15), 1.4),
    delay: rng.range(0, 0.05),
    tau: rng.range(0.07, 0.16),
    level: rng.range(0.5, 0.9),
  }));
  const cracks = Array.from({ length: 9 }, () => ({ time: Math.pow(rng.next(), 1.5) * 0.12, level: rng.range(0.3, 0.8) }));
  const glassHigh = new Highpass(3500);
  const glassGrains = Array.from({ length: 90 }, () => ({
    time: 0.015 + Math.pow(rng.next(), 2.2) * 0.65,
    length: rng.range(0.004, 0.018),
    level: rng.range(0.15, 0.5),
  }));
  const debris = Array.from({ length: 16 }, () => ({ time: rng.range(0.3, 1.4), level: rng.range(0.08, 0.28), filter: new Bandpass(rng.range(900, 3500), 2.5) }));
  let grain = 1;
  return synth(1.6, (t, i) => {
    if (i % 180 === 0) grain = 0.25 + 0.75 * Math.pow(rng.next(), 0.7);
    const thump = thumpFilter.process(rng.noise()) * decay(t, 0.045) * 3.2 + Math.sin(TAU * 55 * t) * decay(t, 0.05) * 0.6;
    let crunch = 0;
    const raw = rng.noise();
    for (const band of crunchBands) {
      const local = t - band.delay;
      if (local < 0) continue;
      crunch += band.filter.process(raw) * band.level * decay(local, band.tau) * attack(local, 0.006);
    }
    crunch *= grain * 1.6;
    let crack = 0;
    for (const hit of cracks) {
      const local = t - hit.time;
      if (local >= 0 && local < 0.006) crack += rng.noise() * hit.level * decay(local, 0.0015);
    }
    const high = glassHigh.process(rng.noise());
    let glass = 0;
    for (const piece of glassGrains) {
      const local = t - piece.time;
      if (local >= 0 && local < piece.length) glass += high * piece.level * Math.sin((Math.PI * local) / piece.length);
    }
    let settle = 0;
    for (const bit of debris) {
      const local = t - bit.time;
      if (local >= 0 && local < 0.04) settle += bit.filter.process(rng.noise()) * bit.level * decay(local, 0.008) * 2;
    }
    return (thump + crunch + crack + glass * 0.9 + settle) * attack(t, 0.001) * strength;
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

/** Cartoon punch landing: a meaty low thump under a sharp slap of noise. */
export const smack = (rng: Rng) => {
  const slap = new Bandpass(rng.range(1500, 2100), 1.1);
  const body = new Lowpass(380);
  return synth(0.18, (t) => {
    const crack = slap.process(rng.noise()) * decay(t, 0.014) * 2.2;
    const meat = body.process(rng.noise()) * decay(t, 0.035) * 1.8;
    const thump = Math.sin(TAU * (110 - 200 * t) * t) * decay(t, 0.04) * 0.9;
    return (crack + meat + thump) * attack(t, 0.0008);
  });
};

/** Wet mud splat: a noise burst whose band sweeps down fast (the "splorch"), plus a soft low slap. Noise only. */
export const splat = (rng: Rng, size = 1) => {
  const band = new Bandpass(900, 1.3);
  const body = new Lowpass(300);
  return synth(0.2, (t) => {
    band.set(Math.max(220, 1100 * size ** -0.3 - 5200 * t), 1.3);
    const squelch = band.process(rng.noise()) * decay(t, 0.045) * 2.2;
    const slap = body.process(rng.noise()) * decay(t, 0.02) * 1.6;
    return (squelch + slap) * attack(t, 0.002) * Math.min(1.2, size);
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

/** Taser: a pop, then a dense electric crackle over a 60 Hz-ish buzz for `duration` seconds. */
export const zap = (rng: Rng, duration: number) => {
  const crackle = new Highpass(1800);
  const body = new Bandpass(3200, 0.8);
  let burst = 0;
  return synth(duration + 0.1, (t, i) => {
    if (i % 90 === 0) burst = rng.next() < 0.55 ? rng.range(0.4, 1) : 0.05;
    const buzz = (Math.sin(TAU * 62 * t) > 0 ? 1 : -1) * 0.25 + Math.sin(TAU * 124 * t) * 0.15;
    const sparks = crackle.process(rng.noise()) * burst * 1.4 + body.process(rng.noise()) * burst * 0.8;
    const pop = t < 0.02 ? rng.noise() * decay(t, 0.004) * 2 : 0;
    const envelope = attack(t, 0.01) * (t > duration ? decay(t - duration, 0.03) : 1);
    return (buzz * 0.5 + sparks + pop) * envelope;
  });
};

/** Plastic mount rattling while someone yanks the dashcam. */
export const rattle = (rng: Rng, duration: number) => {
  const band = new Bandpass(2200, 3);
  return synth(duration, (t) => {
    const yank = Math.abs(Math.sin(TAU * 2.6 * t));
    const hit = rng.next() < 0.02 + 0.06 * yank ? rng.range(0.4, 1) : 0;
    return band.process(rng.noise() * hit * 6) * (0.5 + yank) * 0.6;
  });
};

/** Police siren "wail": rises and falls over ~3.6 s. Keeps its own phase (pitch changes continuously). */
export class Siren {
  private phase = 0;
  private readonly tone = new Lowpass(3200);
  next(t: number) {
    const sweep = 0.5 - 0.5 * Math.cos((TAU * t) / 3.6);
    const pitch = 650 + 800 * sweep;
    this.phase = (this.phase + pitch / SAMPLE_RATE) % 1;
    const square = this.phase < 0.5 ? 1 : -1;
    const triangle = 4 * Math.abs(this.phase - 0.5) - 1;
    return this.tone.process(square * 0.35 + triangle * 0.65);
  }
}

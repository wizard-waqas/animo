/**
 * Tiny deterministic DSP toolkit: seeded noise, filters, a stereo mix bus and a WAV encoder.
 * Same scene in → byte-identical audio out.
 */

export const SAMPLE_RATE = 44100;
const TAU = Math.PI * 2;

/** Seeded random numbers (mulberry32). */
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = Math.floor(seed * 9973) ^ 0x9e3779b9;
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** -1..1 */
  noise() {
    return this.next() * 2 - 1;
  }
  range(min: number, max: number) {
    return min + (max - min) * this.next();
  }
}

export class Lowpass {
  private y = 0;
  private a = 0;
  constructor(cutoff: number) {
    this.set(cutoff);
  }
  set(cutoff: number) {
    this.a = 1 - Math.exp((-TAU * Math.min(cutoff, SAMPLE_RATE * 0.45)) / SAMPLE_RATE);
  }
  process(x: number) {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}

export class Highpass {
  private low: Lowpass;
  constructor(cutoff: number) {
    this.low = new Lowpass(cutoff);
  }
  process(x: number) {
    return x - this.low.process(x);
  }
}

/** RBJ band-pass biquad (constant 0 dB peak). */
export class Bandpass {
  private b0 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(frequency: number, q: number) {
    this.set(frequency, q);
  }
  set(frequency: number, q: number) {
    const w = (TAU * Math.min(frequency, SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  process(x: number) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Mono sound of a given length, filled by a per-sample function of time. */
export const synth = (seconds: number, sample: (t: number, i: number) => number) => {
  const length = Math.max(1, Math.round(seconds * SAMPLE_RATE));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = sample(i / SAMPLE_RATE, i);
  return out;
};

export const decay = (t: number, tau: number) => Math.exp(-t / tau);
export const attack = (t: number, time: number) => Math.min(1, t / Math.max(time, 1e-6));

/** Equal-power pan: -1 left … 1 right. */
export const panGains = (pan: number): [number, number] => {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
};

export class StereoBus {
  readonly left: Float32Array;
  readonly right: Float32Array;
  constructor(readonly seconds: number) {
    const length = Math.ceil(seconds * SAMPLE_RATE);
    this.left = new Float32Array(length);
    this.right = new Float32Array(length);
  }
  /** Mix a mono sound in at `time` seconds with gain and pan. */
  place(sound: Float32Array, time: number, gain: number, pan: number) {
    const [gainLeft, gainRight] = panGains(pan);
    const start = Math.round(time * SAMPLE_RATE);
    for (let i = 0; i < sound.length; i++) {
      const index = start + i;
      if (index < 0) continue;
      if (index >= this.left.length) break;
      this.left[index] += sound[i] * gain * gainLeft;
      this.right[index] += sound[i] * gain * gainRight;
    }
  }
  addAt(index: number, left: number, right: number) {
    if (index < 0 || index >= this.left.length) return;
    this.left[index] += left;
    this.right[index] += right;
  }
  /** Master gain + soft-knee limiter so loud moments (crashes) never clip harshly. */
  master(gain: number) {
    const knee = 0.72;
    const limit = (x: number) => {
      const level = Math.abs(x * gain);
      if (level <= knee) return x * gain;
      return Math.sign(x) * (knee + (1 - knee) * Math.tanh((level - knee) / (1 - knee)));
    };
    for (let i = 0; i < this.left.length; i++) {
      this.left[i] = limit(this.left[i]);
      this.right[i] = limit(this.right[i]);
    }
  }
}

/** 16-bit PCM stereo WAV. */
export const encodeWav = (left: Float32Array, right: Float32Array) => {
  const frames = left.length;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 4, 40);
  const toInt = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < frames; i++) {
    buffer.writeInt16LE(toInt(left[i]), 44 + i * 4);
    buffer.writeInt16LE(toInt(right[i]), 46 + i * 4);
  }
  return buffer;
};

/** Read a 16-bit PCM WAV (mono or stereo) as mono floats, resampled to SAMPLE_RATE if needed. */
export const decodeWav = (bytes: Buffer): Float32Array => {
  let offset = 12;
  let channels = 1;
  let rate = SAMPLE_RATE;
  let bits = 16;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = bytes.readUInt16LE(offset + 10);
      rate = bytes.readUInt32LE(offset + 12);
      bits = bytes.readUInt16LE(offset + 22);
    }
    if (id === "data") {
      if (bits !== 16) throw new Error(`Only 16-bit WAV is supported (got ${bits}-bit)`);
      const frames = Math.floor(Math.min(size, bytes.length - offset - 8) / (2 * channels));
      const mono = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += bytes.readInt16LE(offset + 8 + (i * channels + c) * 2) / 32768;
        mono[i] = sum / channels;
      }
      return rate === SAMPLE_RATE ? mono : resample(mono, rate, SAMPLE_RATE);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
};

/** Linear-interpolation resampler (fine for speech). */
export const resample = (input: Float32Array, from: number, to: number) => {
  const length = Math.round((input.length * to) / from);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = (i * from) / to;
    const index = Math.floor(position);
    const next = Math.min(index + 1, input.length - 1);
    out[i] = input[index] + (input[next] - input[index]) * (position - index);
  }
  return out;
};

/** 16-bit mono WAV. */
export const encodeMonoWav = (samples: Float32Array) => {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buffer;
};

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { scenes } from "../scenes";
import { encodeWav, SAMPLE_RATE } from "../src/audio/dsp";
import { buildSoundtrack, type Soundtrack } from "../src/audio/soundtrack";
import { compileScene } from "../src/engine/compile";
import type { SceneSpec } from "../src/engine/spec";
import { findScene, parseArgs } from "./lib";

/**
 * Generate the sound track(s) into public/audio/<id>.wav (render/stills/studio call this automatically).
 *   npm run sound -- <scene-id> [--spectrogram]   one scene (+ a spectrogram PNG with event markers)
 *   npm run sound -- --all                         every scene
 */
export const generateSound = (spec: SceneSpec, options: { quiet?: boolean; spectrogram?: boolean } = {}) => {
  const outDir = path.resolve("public", "audio");
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${spec.id}.wav`);
  if (!spec.sound.enabled) return undefined;
  const started = Date.now();
  const soundtrack = buildSoundtrack(compileScene(spec));
  writeFileSync(file, encodeWav(soundtrack.bus.left, soundtrack.bus.right));
  if (!options.quiet) printSummary(spec, soundtrack, Date.now() - started);
  if (options.spectrogram) {
    const image = path.resolve("out", spec.id, "sound.png");
    mkdirSync(path.dirname(image), { recursive: true });
    writeFileSync(image, spectrogram(soundtrack));
    console.log(`  spectrogram: ${image}  (markers: green footstep, yellow honk, red crash, blue door, magenta squeal, white other)`);
  }
  return file;
};

const printSummary = (spec: SceneSpec, soundtrack: Soundtrack, ms: number) => {
  const counts = new Map<string, number[]>();
  for (const event of soundtrack.events) counts.set(event.kind, [...(counts.get(event.kind) ?? []), event.time]);
  console.log(`\n${spec.id}: sound generated in ${(ms / 1000).toFixed(1)}s`);
  for (const [kind, times] of counts) {
    const shown = times.slice(0, 8).map((time) => time.toFixed(2)).join(", ");
    console.log(`  ${kind.padEnd(10)} ×${String(times.length).padEnd(3)} at ${shown}${times.length > 8 ? ", …" : ""}`);
  }
  for (const span of soundtrack.screech) console.log(`  squeal     ${span.actor} ${span.start.toFixed(2)}–${span.end.toFixed(2)}s`);
  let peak = 0;
  for (let i = 0; i < soundtrack.bus.left.length; i++) peak = Math.max(peak, Math.abs(soundtrack.bus.left[i]), Math.abs(soundtrack.bus.right[i]));
  console.log(`  peak level ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS`);
};

/** Spectrogram (time → x, frequency → y on a log scale up to 11 kHz) with colored event ticks along the top. */
const spectrogram = (soundtrack: Soundtrack) => {
  const { left, right } = soundtrack.bus;
  const hop = Math.round(SAMPLE_RATE / 60);
  const size = 1024;
  const columns = Math.floor((left.length - size) / hop);
  const height = 260;
  const markerRows = 20;
  const image = new PNG({ width: columns, height: height + markerRows });
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let column = 0; column < columns; column++) {
    for (let i = 0; i < size; i++) {
      re[i] = ((left[column * hop + i] + right[column * hop + i]) / 2) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let row = 0; row < height; row++) {
      const frequency = 40 * Math.pow(11000 / 40, 1 - row / (height - 1));
      const bin = Math.min(size / 2 - 1, Math.round((frequency / SAMPLE_RATE) * size));
      const magnitude = Math.hypot(re[bin], im[bin]);
      const db = 20 * Math.log10(magnitude + 1e-9);
      const level = Math.max(0, Math.min(1, (db + 40) / 70));
      const index = ((row + markerRows) * columns + column) * 4;
      image.data[index] = Math.round(255 * Math.min(1, level * 1.6));
      image.data[index + 1] = Math.round(255 * Math.max(0, level * 1.4 - 0.4));
      image.data[index + 2] = Math.round(255 * (level < 0.5 ? level * 1.2 : 1 - level));
      image.data[index + 3] = 255;
    }
  }
  const colors: Record<string, [number, number, number]> = {
    footstep: [60, 220, 90], honk: [255, 220, 0], crash: [255, 40, 40], "door-open": [80, 140, 255], "door-slam": [80, 140, 255],
  };
  const paint = (column: number, rowFrom: number, rowTo: number, color: [number, number, number]) => {
    if (column < 0 || column >= columns) return;
    for (let row = rowFrom; row < rowTo; row++) {
      const index = (row * columns + column) * 4;
      image.data.set([...color, 255], index);
    }
  };
  for (let column = 0; column < columns; column++) paint(column, 0, markerRows, [20, 20, 20]);
  for (const event of soundtrack.events) {
    const column = Math.round((event.time * SAMPLE_RATE) / hop);
    paint(column, 0, markerRows, colors[event.kind] ?? [255, 255, 255]);
    paint(column + 1, 0, markerRows, colors[event.kind] ?? [255, 255, 255]);
  }
  for (const span of soundtrack.screech) {
    for (let column = Math.round((span.start * SAMPLE_RATE) / hop); column < Math.round((span.end * SAMPLE_RATE) / hop); column++) paint(column, 14, 20, [255, 0, 255]);
  }
  for (let second = 1; second < left.length / SAMPLE_RATE; second++) paint(Math.round((second * SAMPLE_RATE) / hop), markerRows, markerRows + 6, [255, 255, 255]);
  return PNG.sync.write(image);
};

/** In-place radix-2 FFT. */
const fft = (re: Float64Array, im: Float64Array) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    for (let i = 0; i < n; i += length) {
      for (let k = 0; k < length / 2; k++) {
        const cos = Math.cos(angle * k);
        const sin = Math.sin(angle * k);
        const evenRe = re[i + k];
        const evenIm = im[i + k];
        const oddRe = re[i + k + length / 2] * cos - im[i + k + length / 2] * sin;
        const oddIm = re[i + k + length / 2] * sin + im[i + k + length / 2] * cos;
        re[i + k] = evenRe + oddRe;
        im[i + k] = evenIm + oddIm;
        re[i + k + length / 2] = evenRe - oddRe;
        im[i + k + length / 2] = evenIm - oddIm;
      }
    }
  }
};

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("scripts", "sound.ts"));
if (isMain) {
  const { positional, flags } = parseArgs();
  const targets = flags.all ? scenes : [findScene(positional[0])];
  for (const spec of targets) generateSound(spec, { spectrogram: Boolean(flags.spectrogram), quiet: Boolean(flags.quiet) });
}

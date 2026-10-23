import { bundle } from "@remotion/bundler";
import { renderMedia } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { compileScene } from "../src/engine/compile";
import { browserOptions, findScene, openComposition, parseArgs } from "./lib";
import { generateSound } from "./sound";
import { recordVoices } from "./voices";

/**
 * Render a scene to MP4.
 *   npm run render -- <scene-id>            full quality (scene fps, full size)  → out/<id>/<id>.mp4
 *   npm run render -- <scene-id> --preview  30fps, half size, fast               → out/<id>/preview.mp4
 *   --scale 0.75 renders smaller (810×1440 for vertical) at full fps. Must give whole-pixel sizes.
 *   --from / --to render just a slice: seconds (12.5) or a cue name (--to police-stop). A cue counts from its
 *   start for --from and its end for --to, so slices follow the voice timings.  → out/<id>/<id>-<from>-<to>s.mp4
 *   --debug adds name tags + grid.  --concurrency N sets parallel tabs.
 */
const { positional, flags } = parseArgs();
const spec = findScene(positional[0]);
const preview = Boolean(flags.preview);
const inputProps = { sceneId: spec.id, debug: Boolean(flags.debug), preview };
const outDir = path.resolve("out", spec.id);
mkdirSync(outDir, { recursive: true });
const { cues } = compileScene(spec);
const timeOf = (flag: string | true | undefined, edge: "start" | "end", fallback: number) => {
  if (flag === undefined) return fallback;
  if (typeof flag === "string" && cues[flag]) return cues[flag][edge];
  const seconds = Number(flag);
  if (flag === true || !Number.isFinite(seconds)) throw new Error(`--from/--to takes seconds or a cue: ${Object.keys(cues).join(", ")}`);
  return seconds;
};
const from = Math.max(0, timeOf(flags.from, "start", 0));
const to = Math.min(spec.duration, timeOf(flags.to, "end", spec.duration));
if (to <= from) throw new Error(`Nothing to render: --from ${from.toFixed(2)}s is not before --to ${to.toFixed(2)}s.`);
const sliced = from > 0 || to < spec.duration;
const name = sliced ? `${spec.id}-${from.toFixed(1)}-${to.toFixed(1)}s` : spec.id;
const output = path.join(outDir, preview ? `${sliced ? `${name}-` : ""}preview.mp4` : `${name}.mp4`);

const started = Date.now();
// Record any new dialogue first (no-op without an API key), then build the sound track.
await recordVoices(spec);
generateSound(spec, { quiet: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), onProgress: () => undefined });
const composition = await openComposition({ serveUrl, id: spec.id, inputProps });
const scale = flags.scale ? Number(flags.scale) : preview ? 0.5 : 1;
const scaledWidth = composition.width * scale;
const scaledHeight = composition.height * scale;
if (!Number.isInteger(scaledWidth) || !Number.isInteger(scaledHeight)) {
  throw new Error(`--scale ${scale} gives ${scaledWidth}×${scaledHeight}; pick a scale that gives whole pixels (0.5, 0.75, 1).`);
}
// Report every few seconds with frames, speed and ETA, so a slow render is distinguishable from a stuck one.
const renderStarted = Date.now();
let lastReport = 0;
let progress = { renderedFrames: 0, encodedFrames: 0 };
const report = () => {
  const now = Date.now();
  if (now - lastReport < 5000) return;
  lastReport = now;
  const { renderedFrames, encodedFrames } = progress;
  const total = Math.round((to - from) * composition.fps);
  const seconds = (now - renderStarted) / 1000;
  const fps = renderedFrames / Math.max(seconds, 0.001);
  const eta = fps > 0 ? `${Math.ceil((total - renderedFrames) / fps / 60)} min left` : "starting browser tabs…";
  process.stdout.write(`  ${renderedFrames}/${total} frames (${Math.floor((renderedFrames / total) * 100)}%) · ${fps.toFixed(1)} fps · ${eta}${encodedFrames ? ` · encoded ${encodedFrames}` : ""}\n`);
};
// onProgress only fires when a frame lands, so a heartbeat shows a stall too.
const heartbeat = setInterval(report, 10000);
await renderMedia({
  serveUrl,
  composition,
  inputProps,
  codec: "h264",
  outputLocation: output,
  scale,
  crf: preview ? 28 : 16,
  imageFormat: "jpeg",
  jpegQuality: 92,
  frameRange: sliced ? [Math.round(from * composition.fps), Math.max(Math.round(from * composition.fps), Math.round(to * composition.fps) - 1)] : null,
  concurrency: flags.concurrency ? Number(flags.concurrency) : null,
  ...browserOptions(),
  onProgress: ({ renderedFrames, encodedFrames }) => {
    progress = { renderedFrames, encodedFrames };
    report();
  },
  onStart: ({ frameCount }) => console.log(`  Rendering ${frameCount} frames at ${composition.width * scale}×${composition.height * scale}, gl=${browserOptions().chromiumOptions.gl}`),
});
clearInterval(heartbeat);
console.log(`\nRendered ${output} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

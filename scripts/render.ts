import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { browserOptions, findScene, parseArgs } from "./lib";
import { generateSound } from "./sound";
import { recordVoices } from "./voices";

/**
 * Render a scene to MP4.
 *   npm run render -- <scene-id>            full quality (scene fps, full size)  → out/<id>/<id>.mp4
 *   npm run render -- <scene-id> --preview  30fps, half size, fast               → out/<id>/preview.mp4
 *   --scale 0.75 renders smaller (810×1440 for vertical) at full fps. Must give whole-pixel sizes.
 *   --debug adds name tags + grid.  --concurrency N sets parallel tabs.
 */
const { positional, flags } = parseArgs();
const spec = findScene(positional[0]);
const preview = Boolean(flags.preview);
const inputProps = { sceneId: spec.id, debug: Boolean(flags.debug), preview };
const outDir = path.resolve("out", spec.id);
mkdirSync(outDir, { recursive: true });
const output = path.join(outDir, preview ? "preview.mp4" : `${spec.id}.mp4`);

const started = Date.now();
// Record any new dialogue first (no-op without an API key), then build the sound track.
await recordVoices(spec);
generateSound(spec, { quiet: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), onProgress: () => undefined });
const composition = await selectComposition({ serveUrl, id: spec.id, inputProps, ...browserOptions() });
const scale = flags.scale ? Number(flags.scale) : preview ? 0.5 : 1;
const scaledWidth = composition.width * scale;
const scaledHeight = composition.height * scale;
if (!Number.isInteger(scaledWidth) || !Number.isInteger(scaledHeight)) {
  throw new Error(`--scale ${scale} gives ${scaledWidth}×${scaledHeight}; pick a scale that gives whole pixels (0.5, 0.75, 1).`);
}
let lastReported = -1;
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
  concurrency: flags.concurrency ? Number(flags.concurrency) : null,
  ...browserOptions(),
  onProgress: ({ progress }) => {
    const percent = Math.floor(progress * 10) * 10;
    if (percent !== lastReported) {
      lastReported = percent;
      process.stdout.write(`  ${percent}%\n`);
    }
  },
});
console.log(`\nRendered ${output} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

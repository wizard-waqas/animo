import { bundle } from "@remotion/bundler";
import { renderStill } from "@remotion/renderer";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { browserOptions, findScene, openComposition, parseArgs } from "./lib";
import { generateSound } from "./sound";

/**
 * Render a contact sheet: a grid of stills at evenly spaced (or chosen) times.
 * Debug tags (names, coordinates, time, ground grid) are on unless --clean.
 *
 * Usage: npm run stills -- <scene-id> [--count 8] [--at 1,2.5,4] [--scale 0.3] [--clean]
 */
const { positional, flags } = parseArgs();
const spec = findScene(positional[0]);
const count = Number(flags.count ?? 8);
const scale = Number(flags.scale ?? (spec.format === "landscape" ? 0.25 : 0.3));
const debug = !flags.clean;
const times = typeof flags.at === "string"
  ? flags.at.split(",").map(Number)
  : Array.from({ length: count }, (_, i) => (spec.duration * (i + 0.5)) / count);

const outDir = path.resolve("out", spec.id);
mkdirSync(outDir, { recursive: true });

const started = Date.now();
generateSound(spec, { quiet: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), onProgress: () => undefined });
const inputProps = { sceneId: spec.id, debug, preview: false };
const composition = await openComposition({ serveUrl, id: spec.id, inputProps });

const tiles: PNG[] = [];
for (const time of times) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(time * composition.fps));
  const { buffer } = await renderStill({ serveUrl, composition, frame, inputProps, imageFormat: "png", scale, ...browserOptions() });
  const file = path.join(outDir, `still-${time.toFixed(2)}s.png`);
  writeFileSync(file, buffer!);
  tiles.push(PNG.sync.read(buffer!));
  process.stdout.write(`  rendered t=${time.toFixed(2)}s\n`);
}

const columns = Math.min(4, tiles.length);
const rows = Math.ceil(tiles.length / columns);
const tileWidth = tiles[0].width;
const tileHeight = tiles[0].height;
const gap = 6;
const sheet = new PNG({ width: columns * tileWidth + (columns - 1) * gap, height: rows * tileHeight + (rows - 1) * gap });
sheet.data.fill(255);
tiles.forEach((tile, index) => {
  const x = (index % columns) * (tileWidth + gap);
  const y = Math.floor(index / columns) * (tileHeight + gap);
  PNG.bitblt(tile, sheet, 0, 0, tileWidth, tileHeight, x, y);
});
const sheetPath = path.join(outDir, debug ? "sheet.png" : "sheet-clean.png");
writeFileSync(sheetPath, PNG.sync.write(sheet));
console.log(`\nContact sheet: ${sheetPath}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);

import { type HeadlessBrowser, renderStill } from "@remotion/renderer";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { type CompiledScene, compileScene } from "../src/engine/compile";
import { browserOptions, bundleOnce, elapsed, findScene, inputPropsFor, openComposition, outDirFor, parseArgs, timesFromFlag, withBrowser } from "./lib";

/**
 * Render a contact sheet: a grid of stills at evenly spaced (or chosen) times.
 * Debug tags (names, coordinates, time, ground grid) are on unless --clean.
 *
 * Usage: npm run stills -- <scene-id> [--count 8] [--at 1,2.5,4] [--scale 0.3] [--clean]
 */

/** Run `limit` jobs at a time (each still is a software-rendered frame; a tab per core is plenty). */
const pooled = async <T, R>(items: T[], limit: number, job: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await job(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

export const renderContactSheet = async (
  compiled: CompiledScene,
  options: { browser: HeadlessBrowser; serveUrl: string; times: number[]; scale: number; debug: boolean },
) => {
  const { spec } = compiled;
  const outDir = outDirFor(spec.id);
  const inputProps = inputPropsFor(compiled, { debug: options.debug, silent: true });
  const composition = await openComposition({ serveUrl: options.serveUrl, inputProps, browser: options.browser });
  const tiles = await pooled(options.times, 3, async (time) => {
    const frame = Math.min(composition.durationInFrames - 1, Math.round(time * composition.fps));
    const { buffer } = await renderStill({
      serveUrl: options.serveUrl, composition, frame, inputProps, imageFormat: "png", scale: options.scale, puppeteerInstance: options.browser, ...browserOptions(),
    });
    writeFileSync(path.join(outDir, `still-${time.toFixed(2)}s.png`), buffer!);
    process.stdout.write(`  rendered t=${time.toFixed(2)}s\n`);
    return PNG.sync.read(buffer!);
  });

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
  const sheetPath = path.join(outDir, options.debug ? "sheet.png" : "sheet-clean.png");
  writeFileSync(sheetPath, PNG.sync.write(sheet));
  return sheetPath;
};

/** Defaults shared with preflight: tile scale per format, debug tags unless --clean. */
export const stillOptions = (spec: CompiledScene["spec"], flags: Record<string, string | true>) => ({
  times: timesFromFlag(flags.at, spec.duration, Number(flags.count ?? 8)),
  scale: Number(flags.scale ?? (spec.format === "landscape" ? 0.25 : 0.3)),
  debug: !flags.clean,
});

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("scripts", "stills.ts"));
if (isMain) {
  const { positional, flags } = parseArgs();
  const spec = await findScene(positional[0]);
  const compiled = compileScene(spec);
  const started = Date.now();
  const serveUrl = await bundleOnce();
  const sheet = await withBrowser((browser) => renderContactSheet(compiled, { browser, serveUrl, ...stillOptions(spec, flags) }));
  console.log(`\nContact sheet: ${sheet}  (${elapsed(started)})`);
}

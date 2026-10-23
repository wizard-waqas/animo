import { compileScene } from "../src/engine/compile";
import { bundleOnce, elapsed, findScene, parseArgs, withBrowser } from "./lib";
import { printInspection } from "./inspect";
import { generateSound } from "./sound";
import { renderContactSheet, stillOptions } from "./stills";

/**
 * Everything to check before rendering, in one go: timeline + warnings + smoothness, the soundtrack with its
 * spectrogram, and a contact sheet. One bundle, one browser. Exits 1 if there is anything to fix.
 *
 * Usage: npm run preflight -- <scene-id> [--at 2,4.5,8] [--count 8] [--scale 0.3] [--clean]
 */
const { positional, flags } = parseArgs();
const spec = await findScene(positional[0]);
const compiled = compileScene(spec);
const started = Date.now();
const stills = stillOptions(spec, flags);

const problems = printInspection(compiled, typeof flags.at === "string" ? stills.times : Array.from({ length: 7 }, (_, i) => Math.round((spec.duration * i * 100) / 6) / 100));
generateSound(compiled, { spectrogram: true });
const serveUrl = await bundleOnce();
const sheet = await withBrowser((browser) => renderContactSheet(compiled, { browser, serveUrl, ...stills }));

console.log(`\nContact sheet: ${sheet}`);
console.log(problems ? `\n${problems} problem(s) to fix before rendering (${elapsed(started)}).` : `\nReady to render (${elapsed(started)}).`);
if (problems) process.exitCode = 1;

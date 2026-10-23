import { bundle } from "@remotion/bundler";
import { type HeadlessBrowser, openBrowser, selectComposition } from "@remotion/renderer";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { encodeWav } from "../src/audio/dsp";
import { buildSoundtrack, type Soundtrack } from "../src/audio/soundtrack";
import { type CompiledScene, compileScene } from "../src/engine/compile";
import type { SceneSpec } from "../src/engine/spec";
import type { SceneVideoProps } from "../src/render/SceneVideo";
import { type VoiceClip, registerVoiceClips } from "../src/voice/lines";
import { VOICE_CLIPS } from "../voices/manifest";

/**
 * Shared plumbing for every CLI command: env, scene discovery, the webpack bundle cache, one browser per
 * command, and the soundtrack cache. Commands stay small and never repeat each other's work.
 */

// API keys (ELEVENLABS_API_KEY, GOOGLE_TTS_API_KEY) can live in .env.local or .env. Variables already set in
// the shell win. Both files are git-ignored so keys never get committed.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

// Recorded lines are data the engine looks up; the CLI loads the manifest once here.
registerVoiceClips(VOICE_CLIPS);

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const SCENES_DIR = path.join(ROOT, "scenes");
export const outDirFor = (id: string) => {
  const dir = path.join(ROOT, "out", id);
  mkdirSync(dir, { recursive: true });
  return dir;
};

// ------------------------------------------------------------------ scenes

/** Every scene id = every scenes/<id>.scene.ts file. */
export const listSceneIds = () =>
  readdirSync(SCENES_DIR).filter((file) => file.endsWith(".scene.ts")).map((file) => file.slice(0, -".scene.ts".length)).sort();

/** Load scenes/<id>.scene.ts. The filename is the registration: no list to keep in sync. */
export const findScene = async (id: string | undefined): Promise<SceneSpec> => {
  const available = listSceneIds().join(", ");
  if (!id) throw new Error(`Pass a scene id. Available: ${available}`);
  const file = path.join(SCENES_DIR, `${id}.scene.ts`);
  if (!existsSync(file)) throw new Error(`No scene "${id}": expected scenes/${id}.scene.ts. Available: ${available}`);
  const spec = (await import(pathToFileURL(file).href)).default as SceneSpec | undefined;
  if (!spec || spec.id !== id) {
    throw new Error(`scenes/${id}.scene.ts must \`export default scene({ id: "${id}", … })\` (found id "${spec?.id}")`);
  }
  return spec;
};

export const loadScenes = async () => Promise.all(listSceneIds().map((id) => findScene(id)));

/** Tiny argv parser: positional args plus --flag / --flag=value / --flag value. */
export const parseArgs = (argv = process.argv.slice(2)) => {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split("=");
    if (inline !== undefined) flags[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[key] = argv[++i];
    else flags[key] = true;
  }
  return { positional, flags };
};

/** Parse "--at 2,4.5,8" or fall back to `count` evenly spaced times. */
export const timesFromFlag = (flag: string | true | undefined, duration: number, count: number) =>
  typeof flag === "string" ? flag.split(",").map(Number) : Array.from({ length: count }, (_, i) => (duration * (i + 0.5)) / count);

/** The props the video takes: the scene plus only the recorded clips it uses. */
export const inputPropsFor = (compiled: CompiledScene, options: Partial<Pick<SceneVideoProps, "debug" | "preview" | "silent">> = {}): SceneVideoProps => {
  const clips: Record<string, VoiceClip> = {};
  for (const track of Object.values(compiled.characters)) for (const line of track.speech) if (line.clip) clips[line.key] = line.clip;
  return { spec: compiled.spec, clips, debug: false, preview: false, silent: false, ...options };
};

// ------------------------------------------------------------------ bundle cache

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

let cachedSourceHash: string | undefined;
/** Hash of everything the render bundle is built from: src/ plus the lockfile and Remotion config. */
export const sourceHash = () => {
  if (cachedSourceHash) return cachedSourceHash;
  const hash = createHash("sha1");
  const files = [...walk(path.join(ROOT, "src")).sort(), path.join(ROOT, "package-lock.json"), path.join(ROOT, "remotion.config.ts")];
  for (const file of files) {
    hash.update(path.relative(ROOT, file));
    hash.update(readFileSync(file));
  }
  cachedSourceHash = hash.digest("hex").slice(0, 12);
  return cachedSourceHash;
};

/**
 * Build the render bundle once per src/ change. Scenes and recordings travel as inputProps, so editing a scene
 * never rebuilds. Older bundles are removed. Returns the serve URL (a directory).
 */
export const bundleOnce = async () => {
  const cacheRoot = path.join(ROOT, "out", ".bundle");
  const dir = path.join(cacheRoot, sourceHash());
  const marker = path.join(dir, ".complete");
  if (existsSync(marker)) {
    console.log(`  bundle: cache hit (${path.relative(ROOT, dir)})`);
    return dir;
  }
  mkdirSync(cacheRoot, { recursive: true });
  for (const stale of readdirSync(cacheRoot)) rmSync(path.join(cacheRoot, stale), { recursive: true, force: true });
  const started = Date.now();
  await bundle({ entryPoint: path.join(ROOT, "src/entry.render.tsx"), outDir: dir, onProgress: () => undefined });
  writeFileSync(marker, new Date().toISOString());
  console.log(`  bundle: built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return dir;
};

// ------------------------------------------------------------------ browser

type Gl = "swangle" | "angle";
let gl: Gl = (process.env.TOON_GL as Gl | undefined) ?? (process.platform === "linux" ? "swangle" : "angle");

// Remotion's downloaded headless Chrome crashes with GPU WebGL on Apple Silicon ("browser has disconnected"),
// while the regular Chrome app renders fine and fast. So on a Mac, use the installed Chrome when there is one.
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The cloud container ships Playwright's headless shell and can't reach Remotion's download host.
const CLOUD_CHROME = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const browserExecutable =
  process.env.TOON_BROWSER
  ?? (process.platform === "darwin" && existsSync(MAC_CHROME) ? MAC_CHROME : null)
  ?? (process.platform === "linux" && existsSync(CLOUD_CHROME) ? CLOUD_CHROME : null);

export const browserOptions = () => ({
  browserExecutable,
  chromiumOptions: { gl },
});

/**
 * Parallel browser tabs. Remotion's default (half the cores) is right for software WebGL too: SwiftShader already
 * uses every core per tab, so 2 and 4 tabs rendered a preview in the same time (45 s vs 46 s on 4 cores).
 */
export const defaultConcurrency = () => (process.env.ANIMO_CONCURRENCY ? Number(process.env.ANIMO_CONCURRENCY) : null);

/**
 * Open one headless browser for the whole command (every renderStill/renderMedia call without one launches its own).
 * Falls back to software WebGL (swangle) if the GPU path crashes the browser on launch.
 */
export const withBrowser = async <T>(run: (browser: HeadlessBrowser) => Promise<T>): Promise<T> => {
  let browser: HeadlessBrowser;
  try {
    browser = await openBrowser("chrome", browserOptions());
  } catch (error) {
    if (process.env.TOON_GL || gl === "swangle") throw error;
    console.log(`  Browser crashed with gl=${gl} (${(error as Error).message}). Retrying with software WebGL (slower).`);
    console.log("  Installing Google Chrome (or pointing TOON_BROWSER at another Chrome) usually avoids this.");
    gl = "swangle";
    browser = await openBrowser("chrome", browserOptions());
  }
  try {
    return await run(browser);
  } finally {
    await browser.close({ silent: true });
  }
};

/** The one CLI composition ("scene" in src/entry.render.tsx), sized from the scene in inputProps. */
export const openComposition = (options: { serveUrl: string; inputProps: SceneVideoProps; browser: HeadlessBrowser }) =>
  selectComposition({ serveUrl: options.serveUrl, id: "scene", inputProps: options.inputProps, puppeteerInstance: options.browser, ...browserOptions() });

// ------------------------------------------------------------------ sound

const AUDIO_DIR = path.join(ROOT, "public", "audio");

/** Hash of everything the soundtrack depends on: the engine/audio code, the scene, and its recordings. */
const soundHash = (compiled: CompiledScene) => createHash("sha1").update(sourceHash()).update(JSON.stringify(inputPropsFor(compiled))).digest("hex").slice(0, 12);

/**
 * Write public/audio/<id>.wav (what the video plays) unless it is already up to date. Returns the soundtrack only
 * when it was (re)built, so callers that want to print or plot it can pass `force`.
 */
export const ensureSound = (compiled: CompiledScene, options: { force?: boolean } = {}): { file: string; soundtrack?: Soundtrack; cached: boolean } | undefined => {
  const { spec } = compiled;
  if (!spec.sound.enabled) return undefined;
  mkdirSync(AUDIO_DIR, { recursive: true });
  const file = path.join(AUDIO_DIR, `${spec.id}.wav`);
  const stamp = path.join(AUDIO_DIR, `${spec.id}.hash`);
  const hash = soundHash(compiled);
  if (!options.force && existsSync(file) && existsSync(stamp) && readFileSync(stamp, "utf8") === hash) return { file, cached: true };
  const soundtrack = buildSoundtrack(compiled);
  writeFileSync(file, encodeWav(soundtrack.bus.left, soundtrack.bus.right));
  writeFileSync(stamp, hash);
  return { file, soundtrack, cached: false };
};

/** The cached bundle copied public/ when it was built; drop the current soundtrack in so it plays the latest audio. */
export const syncSoundIntoBundle = (serveUrl: string, spec: SceneSpec) => {
  const source = path.join(AUDIO_DIR, `${spec.id}.wav`);
  if (!spec.sound.enabled || !existsSync(source)) return;
  const target = path.join(serveUrl, "public", "audio", `${spec.id}.wav`);
  mkdirSync(path.dirname(target), { recursive: true });
  if (!existsSync(target) || statSync(target).mtimeMs < statSync(source).mtimeMs) copyFileSync(source, target);
};

export const elapsed = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)}s`;

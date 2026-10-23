import { selectComposition } from "@remotion/renderer";
import { existsSync } from "node:fs";
import { scenes } from "../scenes";
import type { SceneSpec } from "../src/engine/spec";

// API keys (ELEVENLABS_API_KEY, GOOGLE_TTS_API_KEY) can live in .env.local or .env. Variables already set in
// the shell win. Both files are git-ignored so keys never get committed.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export const findScene = (id: string | undefined): SceneSpec => {
  const available = scenes.map((scene) => scene.id).join(", ");
  if (!id) throw new Error(`Pass a scene id. Available: ${available}`);
  const scene = scenes.find((candidate) => candidate.id === id);
  if (!scene) throw new Error(`No scene "${id}". Available: ${available}. (Did you add it to scenes/index.ts?)`);
  return scene;
};

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

type Gl = "swangle" | "angle";
let gl: Gl = (process.env.TOON_GL as Gl | undefined) ?? (process.platform === "linux" ? "swangle" : "angle");

// Remotion's downloaded headless Chrome crashes with GPU WebGL on Apple Silicon ("browser has disconnected"),
// while the regular Chrome app renders fine and fast. So on a Mac, use the installed Chrome when there is one.
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutable =
  process.env.TOON_BROWSER ?? (process.platform === "darwin" && existsSync(MAC_CHROME) ? MAC_CHROME : null);

export const browserOptions = () => ({
  browserExecutable,
  chromiumOptions: { gl },
});

/**
 * selectComposition, falling back to software WebGL (swangle) if the GPU path crashes the browser
 * ("Navigation failed because browser has disconnected"). Later browserOptions() calls use whichever worked.
 */
export const openComposition = async (options: { serveUrl: string; id: string; inputProps: Record<string, unknown> }) => {
  try {
    return await selectComposition({ ...options, ...browserOptions() });
  } catch (error) {
    if (process.env.TOON_GL || gl === "swangle") throw error;
    console.log(`  Browser crashed with gl=${gl} (${(error as Error).message}). Retrying with software WebGL (slower).`);
    console.log("  Installing Google Chrome (or pointing TOON_BROWSER at another Chrome) usually avoids this.");
    gl = "swangle";
    return selectComposition({ ...options, ...browserOptions() });
  }
};

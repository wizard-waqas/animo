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

export const browserOptions = () => ({
  browserExecutable: process.env.TOON_BROWSER ?? null,
  chromiumOptions: { gl: (process.env.TOON_GL ?? (process.platform === "linux" ? "swangle" : "angle")) as "swangle" | "angle" },
});

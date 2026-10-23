import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scenes } from "../scenes";
import { SAMPLE_RATE, decodeWav, encodeMonoWav } from "../src/audio/dsp";
import { compileScene } from "../src/engine/compile";
import type { Mood } from "../src/engine/expression";
import type { SceneSpec } from "../src/engine/spec";
import { ENVELOPE_RATE, deliveryTags, encodeEnvelope, registerVoiceClips, stripTags } from "../src/voice/lines";
import { type VoiceProvider, resolveVoice } from "../src/voice/voices";
import { VOICE_CLIPS, type VoiceClip } from "../voices/manifest";
import { findScene, parseArgs } from "./lib";

/**
 * Record realistic voices for every say() line, once. Results are saved in voices/ (commit them) and
 * listed in voices/manifest.ts, so re-renders never call the API again.
 *
 *   npm run voices -- <scene-id>          record missing lines for one scene
 *   npm run voices -- --all               every scene
 *   npm run voices -- <scene-id> --force  re-record (e.g. after switching provider or voice)
 *   npm run voices -- --list              list the voices your account can use
 *
 * Provider: ELEVENLABS_API_KEY (best acting, follows [angry]/[whispers] tags) or GOOGLE_TTS_API_KEY
 * (Chirp 3 HD voices). Set ANIMO_VOICE_PROVIDER to choose when both are present.
 */

const pickProvider = (): VoiceProvider | undefined => {
  const chosen = process.env.ANIMO_VOICE_PROVIDER as VoiceProvider | undefined;
  if (chosen) return chosen;
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.GOOGLE_TTS_API_KEY) return "google";
  return undefined;
};

const SPEAKING_RATE: Record<Mood, number> = { neutral: 1, happy: 1.05, angry: 1.12, scared: 1.15, shocked: 1.05, smug: 0.95, sad: 0.9, pain: 0.95, dazed: 0.85 };

/** Linear resample to the project rate (speech is band-limited well below either Nyquist, so this is clean). */
const resample = (input: Float32Array, fromRate: number) => {
  if (fromRate === SAMPLE_RATE) return input;
  const ratio = fromRate / SAMPLE_RATE;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const next = input[Math.min(index + 1, input.length - 1)];
    output[i] = input[index] + (next - input[index]) * (position - index);
  }
  return output;
};

/** Ask the provider for 16-bit mono PCM, returned at the project's 44.1 kHz. */
const synthesize = async (provider: VoiceProvider, voice: string, script: string, mood: Mood): Promise<Float32Array> => {
  if (provider === "elevenlabs") {
    const model = process.env.ELEVENLABS_MODEL ?? "eleven_v3";
    const text = model.startsWith("eleven_v3") ? deliveryTags(mood, script) : stripTags(script);
    // pcm_44100 needs the Pro tier; 24 kHz works on every plan. Pro users can set ELEVENLABS_SAMPLE_RATE=44100.
    const rate = Number(process.env.ELEVENLABS_SAMPLE_RATE ?? 24000);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_${rate}`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/pcm" },
      body: JSON.stringify({ text: text.replace(/\n/g, " "), model_id: model }),
    });
    if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const pcm = Buffer.from(await response.arrayBuffer());
    const samples = new Float32Array(Math.floor(pcm.length / 2));
    for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
    return resample(samples, rate);
  }
  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text: stripTags(script).replace(/\n/g, " ") },
      voice: { languageCode: voice.split("-").slice(0, 2).join("-"), name: voice },
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: SAMPLE_RATE, speakingRate: SPEAKING_RATE[mood] },
    }),
  });
  if (!response.ok) throw new Error(`Google TTS ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const { audioContent } = (await response.json()) as { audioContent: string };
  return decodeWav(Buffer.from(audioContent, "base64"));
};

/** Trim silence at both ends (keeping a little air) and normalize to -3 dBFS. */
const tidy = (samples: Float32Array) => {
  const threshold = 0.01;
  let first = samples.findIndex((x) => Math.abs(x) > threshold);
  let last = samples.length - 1;
  while (last > 0 && Math.abs(samples[last]) <= threshold) last--;
  if (first < 0) return samples;
  first = Math.max(0, first - Math.round(0.03 * SAMPLE_RATE));
  last = Math.min(samples.length - 1, last + Math.round(0.08 * SAMPLE_RATE));
  const trimmed = samples.slice(first, last + 1);
  const peak = trimmed.reduce((max, x) => Math.max(max, Math.abs(x)), 0) || 1;
  const gain = 0.708 / peak;
  return trimmed.map((x) => x * gain);
};

/** Loudness per 1/60 s, square-rooted for a livelier mouth, scaled so the loudest syllable is 1. */
const envelopeOf = (samples: Float32Array) => {
  const window = Math.round(SAMPLE_RATE / ENVELOPE_RATE);
  const levels: number[] = [];
  for (let start = 0; start < samples.length; start += window) {
    let sum = 0;
    const end = Math.min(samples.length, start + window);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    levels.push(Math.sqrt(Math.sqrt(sum / Math.max(1, end - start))));
  }
  const loudest = Math.max(...levels, 1e-6);
  return encodeEnvelope(levels.map((level) => Math.max(0, (level / loudest - 0.15) / 0.85)));
};

const writeManifest = (clips: Record<string, VoiceClip>) => {
  const sorted = Object.fromEntries(Object.entries(clips).sort(([a], [b]) => a.localeCompare(b)));
  const header = readFileSync(path.resolve("voices/manifest.ts"), "utf8").split("export const VOICE_CLIPS")[0];
  writeFileSync(path.resolve("voices/manifest.ts"), `${header}export const VOICE_CLIPS: Record<string, VoiceClip> = ${JSON.stringify(sorted, null, 2)};\n`);
};

export const recordVoices = async (spec: SceneSpec, options: { force?: boolean } = {}) => {
  const lines = Object.values(compileScene(spec).characters).flatMap((track) =>
    track.speech.map((line) => ({ ...line, identity: track.voice, character: track.id })),
  );
  const missing = lines.filter((line) => options.force || !line.clip || !existsSync(path.resolve("voices", line.clip.file)));
  if (missing.length === 0) {
    console.log(`${spec.id}: all ${lines.length} line(s) already recorded.`);
    return 0;
  }
  const provider = pickProvider();
  if (!provider) {
    console.log(`${spec.id}: ${missing.length} line(s) need a voice, but no API key is set.`);
    console.log("  Set ELEVENLABS_API_KEY (recommended) or GOOGLE_TTS_API_KEY, then run this again.");
    return missing.length;
  }
  const clips: Record<string, VoiceClip> = { ...VOICE_CLIPS };
  let failed = 0;
  for (const line of missing) {
    const voice = resolveVoice(line.identity, provider);
    process.stdout.write(`  ${line.character} (${line.mood}): "${line.text.replace(/\n/g, " ")}" … `);
    let raw: Float32Array;
    try {
      raw = await synthesize(provider, voice, line.script, line.mood);
    } catch (error) {
      failed++;
      console.log(`FAILED\n    ${explainFailure(provider, error)}`);
      if (failed >= 2 && failed === missing.indexOf(line) + 1) {
        console.log("  Stopping: the voice service isn't working. The video will render without voices.");
        return missing.length;
      }
      continue;
    }
    const samples = tidy(raw);
    const file = `${line.key}.wav`;
    writeFileSync(path.resolve("voices", file), encodeMonoWav(samples));
    clips[line.key] = { file, duration: Math.round((samples.length / SAMPLE_RATE) * 1000) / 1000, envelope: envelopeOf(samples), provider, voice, text: line.script };
    writeManifest(clips);
    // The manifest import is fixed at startup; register the new take so this process (render → sound) uses it too.
    registerVoiceClips({ [line.key]: clips[line.key] });
    console.log(`${clips[line.key].duration}s`);
  }
  const recorded = missing.length - failed;
  console.log(`${spec.id}: recorded ${recorded} line(s) with ${provider}${failed ? `, ${failed} failed` : ""}. Timings now follow the recordings.`);
  return failed;
};

/** Turn network/API errors into something actionable. */
const explainFailure = (provider: VoiceProvider, error: unknown) => {
  const host = provider === "elevenlabs" ? "api.elevenlabs.io" : "texttospeech.googleapis.com";
  const cause = (error as { cause?: { code?: string } })?.cause?.code;
  if (cause === "ENOTFOUND" || cause === "ECONNREFUSED" || cause === "ECONNRESET" || cause === "ETIMEDOUT") {
    return `Can't reach ${host} (${cause}). Check your internet connection, or the network allow-list if you're on a restricted machine.`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/\b401\b/.test(message)) return `${provider} rejected the API key (401). Check the key in .env.local.`;
  if (/\b402\b|quota|credits/i.test(message)) return `${provider} says the account is out of credits or needs a paid plan: ${message}`;
  if (/\b404\b/.test(message)) return `${provider} doesn't know this voice. Run \`npm run voices -- --list\` and set a voice on the character. (${message})`;
  return message;
};

const listVoices = async () => {
  const provider = pickProvider();
  if (provider === "elevenlabs") {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } });
    const { voices } = (await response.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string> }[] };
    for (const voice of voices) console.log(`  ${voice.voice_id}  ${voice.name}  ${Object.values(voice.labels ?? {}).join(", ")}`);
  } else if (provider === "google") {
    const response = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=en-US&key=${process.env.GOOGLE_TTS_API_KEY}`);
    const { voices } = (await response.json()) as { voices: { name: string; ssmlGender: string }[] };
    for (const voice of voices.filter((v) => v.name.includes("Chirp3-HD"))) console.log(`  ${voice.name}  ${voice.ssmlGender}`);
  } else console.log("No API key set (ELEVENLABS_API_KEY or GOOGLE_TTS_API_KEY).");
};

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("scripts", "voices.ts"));
if (isMain) {
  const { positional, flags } = parseArgs();
  if (flags.list) await listVoices();
  else {
    const targets = flags.all ? scenes : [findScene(positional[0])];
    let pending = 0;
    for (const spec of targets) pending += await recordVoices(spec, { force: Boolean(flags.force) });
    if (pending > 0) process.exitCode = 1;
  }
}

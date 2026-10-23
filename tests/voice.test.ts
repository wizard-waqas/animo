import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_RATE, decodeWav, encodeMonoWav } from "../src/audio/dsp";
import { buildSoundtrack } from "../src/audio/soundtrack";
import { compileScene, evaluateScene } from "../src/engine/compile";
import { at, character, scene } from "../src/engine/dsl";
import { deliveryTags, encodeEnvelope, envelopeAt, estimateSpeechDuration, lineKey, registerVoiceClips, stripTags } from "../src/voice/lines";

describe("voice line helpers", () => {
  it("strips delivery tags for the bubble", () => {
    expect(stripTags("[whispers] psst, over here")).toBe("psst, over here");
  });

  it("keys lines by voice, mood and text", () => {
    expect(lineKey("model:kid", "hi", "happy")).toBe(lineKey("model:kid", "hi", "happy"));
    expect(lineKey("model:kid", "hi", "happy")).not.toBe(lineKey("model:kid", "hi", "angry"));
  });

  it("round-trips the lip-sync envelope", () => {
    const envelope = encodeEnvelope([0, 0.5, 1]);
    expect(envelopeAt(envelope, 0)).toBe(0);
    expect(envelopeAt(envelope, 1.5 / 60)).toBeCloseTo(0.5, 1);
    expect(envelopeAt(envelope, 2.5 / 60)).toBe(1);
    expect(envelopeAt(envelope, 10)).toBe(0);
  });

  it("directs angry shouting and leaves scripted tags alone", () => {
    expect(deliveryTags("angry", "OMG you HIT me!!")).toContain("[shouting]");
    expect(deliveryTags("angry", "[whispers] fine.")).toBe("[whispers] fine.");
  });

  it("estimates unrecorded lines by word count", () => {
    expect(estimateSpeechDuration("one two three four five six seven eight")).toBeGreaterThan(2.5);
  });

  it("round-trips 16-bit mono WAV", () => {
    const samples = Float32Array.from({ length: 441 }, (_, i) => Math.sin(i / 10) * 0.5);
    const decoded = decodeWav(encodeMonoWav(samples));
    expect(decoded.length).toBe(441);
    expect(decoded[50]).toBeCloseTo(samples[50], 3);
  });
});

describe("recorded dialogue in a scene", () => {
  const talker = () => character("talker", "casual-guy", { at: [0, 0] });
  const spec = () => scene({ id: "voice-test", duration: 5, set: "empty", cast: [talker()], timeline: [at(1, talker().say("Hello there"))] });

  it("uses the recording's length, lip-syncs to it, and mixes it into the sound track", () => {
    const key = lineKey("model:casual-guy", "Hello there", "neutral");
    const file = `test-${key}.wav`;
    const voiceDir = path.resolve("voices");
    if (!existsSync(voiceDir)) mkdirSync(voiceDir);
    const seconds = 1.5;
    const tone = Float32Array.from({ length: seconds * SAMPLE_RATE }, (_, i) => Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * (i / SAMPLE_RATE < 0.75 ? 0.6 : 0));
    writeFileSync(path.join(voiceDir, file), encodeMonoWav(tone));
    try {
      registerVoiceClips({ [key]: { file, duration: seconds, envelope: encodeEnvelope(Array.from({ length: 90 }, (_, i) => (i < 45 ? 1 : 0))), provider: "test", voice: "test", text: "Hello there" } });
      const compiled = compileScene(spec());
      expect(compiled.timeline.find((row) => row.actor === "talker")!.end).toBeCloseTo(1 + seconds + 0.25, 3);
      expect(compiled.warnings.join("\n")).not.toMatch(/no voice recording/);
      expect(evaluateScene(compiled, 1.3).characters.talker.talk).toBeGreaterThan(0.9);
      expect(evaluateScene(compiled, 2.3).characters.talker.talk).toBe(0);
      const soundtrack = buildSoundtrack(compiled);
      expect(soundtrack.events.some((event) => event.kind === "voice")).toBe(true);
      const at = Math.round(1.3 * SAMPLE_RATE);
      const loudness = Math.abs(soundtrack.bus.left[at]) + Math.abs(soundtrack.bus.left[at + 25]) + Math.abs(soundtrack.bus.left[at + 50]);
      expect(loudness).toBeGreaterThan(0.1);
    } finally {
      rmSync(path.join(voiceDir, file));
    }
  });

  it("warns when lines haven't been recorded yet", () => {
    const unrecorded = scene({ id: "voice-test-2", duration: 5, set: "empty", cast: [talker()], timeline: [at(1, talker().say("Nobody recorded this"))] });
    expect(compileScene(unrecorded).warnings.join("\n")).toMatch(/npm run voices -- voice-test-2/);
  });
});

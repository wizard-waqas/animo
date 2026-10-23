import { describe, expect, it } from "vitest";
import { buildSoundtrack } from "../src/audio/soundtrack";
import { compileScene } from "../src/engine/compile";
import { at, car, character, scene } from "../src/engine/dsl";

const crashScene = () => {
  const lead = car("lead", "sedan", { at: [0, 0], facing: 90 });
  const chaser = car("chaser", "sedan", { at: [-30, 0], facing: 90 });
  const walker = character("walker", "casual-guy", { at: [0, 6] });
  return scene({
    id: "audio-test", duration: 8, set: "empty", cast: [lead, chaser, walker],
    timeline: [
      at(0, lead.driveTo([60, 0], { fromSpeed: 10, endSpeed: 10 })),
      at(1, lead.driveTo([16, 0], { endSpeed: 0 })),
      at(0, chaser.driveTo([200, 0], { fromSpeed: 20, endSpeed: 20 })),
      at(0.5, chaser.honk({ times: 2 })),
      at(1, chaser.crashInto(lead, { brake: 3 })),
      at(0, walker.walkTo([8, 6])),
    ],
  });
};

describe("crashes", () => {
  it("finds the contact moment against a moving, braking car and stops the striker there", () => {
    const compiled = compileScene(crashScene());
    expect(compiled.crashes).toHaveLength(1);
    const [hit] = compiled.crashes;
    const lead = compiled.cars.lead.kinematics(hit.time).pos;
    const chaser = compiled.cars.chaser.kinematics(hit.time).pos;
    expect(lead[0] - chaser[0]).toBeCloseTo(4.4 + 0.06, 1); // bumpers just touching
    expect(hit.speed).toBeGreaterThan(3);
    expect(compiled.warnings.filter((warning) => warning.includes("overlap"))).toEqual([]);
  });
});

describe("soundtrack", () => {
  it("derives honks, the crash, footsteps and brake squeal from the scene", () => {
    const soundtrack = buildSoundtrack(compileScene(crashScene()));
    const kinds = soundtrack.events.map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "honk")).toHaveLength(2);
    expect(kinds).toContain("crash");
    // ~8m walk at ~0.57m per step
    expect(kinds.filter((kind) => kind === "footstep").length).toBeGreaterThanOrEqual(10);
    expect(soundtrack.screech.some((span) => span.actor === "lead")).toBe(true);
  });

  it("is deterministic and never clips", () => {
    const a = buildSoundtrack(compileScene(crashScene()));
    const b = buildSoundtrack(compileScene(crashScene()));
    expect(Buffer.from(a.bus.left.buffer).equals(Buffer.from(b.bus.left.buffer))).toBe(true);
    const peak = a.bus.left.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.05);
  });
});

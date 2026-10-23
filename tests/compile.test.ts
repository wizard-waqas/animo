import { describe, expect, it } from "vitest";
import { scenes } from "../scenes";
import { compileScene, evaluateScene, findJolts } from "../src/engine/compile";
import { at, car, character, scene, next } from "../src/engine/dsl";

describe("scene validation", () => {
  it("rejects unknown clips with a readable message", () => {
    const mike = character("mike", "casual-guy", { at: [0, 0] });
    expect(() =>
      scene({ id: "bad", duration: 5, cast: [mike], timeline: [at(0, { type: "clip", actor: "mike", clip: "wavee" as never })] }),
    ).toThrow(/timeline\.0\.action/);
  });

  it("rejects actions out of time order for one actor", () => {
    const mike = character("mike", "casual-guy", { at: [0, 0] });
    const spec = scene({ id: "order", duration: 5, cast: [mike], timeline: [at(3, mike.play("jump")), at(1, mike.play("dance"))] });
    expect(() => compileScene(spec)).toThrow(/time order/);
  });

  it("chains `next` actions after the same actor's previous action", () => {
    const mike = character("mike", "casual-guy", { at: [0, 0] });
    const spec = scene({ id: "chain", duration: 10, cast: [mike], timeline: [at(1, mike.play("jump", { duration: 1 })), next(mike.play("dance", { duration: 2 }), 0.5)] });
    const compiled = compileScene(spec);
    expect(compiled.timeline.map((row) => [row.start, row.end])).toEqual([[1, 2], [2.5, 4.5]]);
  });
});

describe("scene warnings", () => {
  it("warns when a car drives off while someone is getting in", () => {
    const sedan = car("sedan", "sedan", { at: [0, 0], facing: 90 });
    const mike = character("mike", "casual-guy", { at: [0, 3] });
    const spec = scene({
      id: "rude", duration: 8, cast: [sedan, mike],
      timeline: [at(0, mike.enter(sedan, "passenger")), at(1, sedan.driveTo([20, 0], { duration: 3 }))],
    });
    expect(compileScene(spec).warnings.join("\n")).toMatch(/moving while mike gets in/);
  });

  it("warns when a car drives through someone", () => {
    const sedan = car("sedan", "sedan", { at: [-20, 0], facing: 90 });
    const mike = character("mike", "casual-guy", { at: [0, 0] });
    const spec = scene({ id: "ghost", duration: 8, cast: [sedan, mike], timeline: [at(0, sedan.driveTo([20, 0], { duration: 5 }))] });
    expect(compileScene(spec).warnings.join("\n")).toMatch(/mike overlaps sedan/);
  });

  it("routes people around parked cars instead of through them", () => {
    const sedan = car("sedan", "sedan", { at: [0, 0], facing: 90 });
    const mike = character("mike", "casual-guy", { at: [0, 5] });
    const spec = scene({ id: "detour", duration: 12, cast: [sedan, mike], timeline: [at(0, mike.walkTo([0, -5]))] });
    const compiled = compileScene(spec);
    expect(compiled.warnings.filter((warning) => warning.includes("overlaps"))).toEqual([]);
    const widestDetour = Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(evaluateScene(compiled, i * 0.1).characters.mike.pos[0])));
    expect(widestDetour).toBeGreaterThan(2.2);
    const final = evaluateScene(compiled, 11.9).characters.mike.pos;
    expect(final[2]).toBeCloseTo(-5, 3);
  });

  it("warns when an action is listed after something that already depended on that actor", () => {
    const sedan = car("sedan", "sedan", { at: [0, 0], facing: 90 });
    const mike = character("mike", "casual-guy", { at: [0, 5] });
    const spec = scene({
      id: "order", duration: 12, cast: [sedan, mike],
      timeline: [at(3, mike.enter(sedan, "passenger")), at(1, sedan.driveTo([10, 0], { duration: 1 }))],
    });
    expect(() => compileScene(spec)).toThrow(/Move it earlier in the timeline/);
  });
});

describe("bundled scenes", () => {
  it.each(scenes.map((spec) => [spec.id, spec] as const))("%s compiles with no warnings or jolts", (_, spec) => {
    const compiled = compileScene(spec);
    expect(compiled.warnings).toEqual([]);
    expect(findJolts(compiled, 30)).toEqual([]);
    for (let t = 0; t <= spec.duration; t += 1 / 15) {
      const frame = evaluateScene(compiled, t);
      for (const value of [...frame.camera.position, ...frame.camera.lookAt]) expect(Number.isFinite(value)).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { CARS } from "../src/catalog/cars";
import { CHARACTERS, RIG } from "../src/catalog/characters";
import { CarTrack } from "../src/engine/carTrack";
import { CharacterTrack } from "../src/engine/characterTrack";
import { EASE_NAMES, ease } from "../src/engine/easing";
import { DEG, angleDelta, distance2 } from "../src/engine/math";
import { bezierPath, smoothPath } from "../src/engine/path";
import { STRIDE, gaitPose } from "../src/engine/pose";

describe("easing", () => {
  it.each(EASE_NAMES)("%s starts at 0, ends at 1 and never goes backwards", (name) => {
    expect(ease(name, 0)).toBeCloseTo(0, 6);
    expect(ease(name, 1)).toBeCloseTo(1, 6);
    let previous = 0;
    for (let u = 0; u <= 1; u += 0.01) {
      const value = ease(name, u);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
  });
});

describe("paths", () => {
  it("measures a straight line exactly", () => {
    const path = smoothPath([[0, 0], [10, 0]]);
    expect(path.length).toBeCloseTo(10, 3);
    expect(path.pointAt(5)[0]).toBeCloseTo(5, 3);
    expect(path.headingAt(5)).toBeCloseTo(90 * DEG, 3);
  });

  it("bezier leaves along the start heading and arrives along the end heading", () => {
    const path = bezierPath([0, 0], 0, [10, 10], 90 * DEG);
    expect(path.headingAt(0.01)).toBeCloseTo(0, 1);
    expect(path.headingAt(path.length - 0.01)).toBeCloseTo(90 * DEG, 1);
  });

  it("reports positive curvature for a left turn", () => {
    const path = bezierPath([0, 0], 0, [10, 10], 90 * DEG);
    expect(path.curvatureAt(path.length / 2)).toBeGreaterThan(0);
  });
});

describe("car track", () => {
  const makeCar = () => new CarTrack("car", CARS.sedan, [0, 0], 90 * DEG);

  it("arrives exactly at the target on time and then holds still", () => {
    const car = makeCar();
    const end = car.addDrive(1, { to: [20, 0], duration: 3, easeName: "cruise", reverse: false });
    car.finalize(6);
    expect(end).toBe(4);
    expect(distance2(car.state(0.5).pos, [0, 0])).toBeLessThan(1e-6);
    expect(distance2(car.state(4).pos, [20, 0])).toBeLessThan(1e-3);
    expect(Math.abs(car.state(5).speed)).toBeLessThan(1e-6);
  });

  it("spins the wheels by distance / radius (no skidding)", () => {
    const car = makeCar();
    car.addDrive(0, { to: [10, 0], duration: 2, easeName: "smooth", reverse: false });
    car.finalize(3);
    expect(car.state(2).wheelSpin).toBeCloseTo(10 / CARS.sedan.wheelRadius, 2);
  });

  it("keeps facing forward while reversing", () => {
    const car = makeCar();
    car.addDrive(0, { to: [-10, 0], duration: 2, easeName: "smooth", reverse: true });
    car.finalize(3);
    expect(angleDelta(car.state(1).heading, 90 * DEG)).toBeCloseTo(0, 2);
    expect(car.state(2).wheelSpin).toBeLessThan(0);
  });

  it("doesn't jolt the suspension when a car enters the scene already moving", () => {
    const car = makeCar();
    car.addDrive(0, { to: [40, 0], duration: 4, easeName: "linear", reverse: false });
    car.finalize(4);
    for (let t = 0; t < 3.5; t += 0.1) expect(Math.abs(car.state(t).pitch)).toBeLessThan(0.005);
  });

  it("opens and closes doors smoothly", () => {
    const car = makeCar();
    car.addDoor("driver", 1, true, 0.4);
    car.addDoor("driver", 3, false, 0.4);
    expect(car.doorOpenness("driver", 0.5)).toBe(0);
    expect(car.doorOpenness("driver", 2)).toBeCloseTo(1);
    expect(car.doorOpenness("driver", 3.2)).toBeGreaterThan(0);
    expect(car.doorOpenness("driver", 3.5)).toBeCloseTo(0);
  });
});

describe("walking", () => {
  it("plants the stance foot: it doesn't slide while the body moves", () => {
    // Foot position along the walk direction = body distance + leg offset. During stance it must stay put.
    const footPositions: number[] = [];
    for (let distance = 0; distance <= 2; distance += 0.01) {
      const phase = ((distance / STRIDE.walk + 0.25) % 1 + 1) % 1;
      if (phase > 0.05 && phase < 0.45) {
        const pose = gaitPose(distance, false, 1);
        footPositions.push(distance + RIG.legLength * Math.sin(pose.lHipX));
      } else if (footPositions.length) break;
    }
    const spread = Math.max(...footPositions) - Math.min(...footPositions);
    expect(footPositions.length).toBeGreaterThan(10);
    expect(spread).toBeLessThan(0.02);
  });

  it("walks to the target and turns to the requested facing", () => {
    const person = new CharacterTrack("mike", CHARACTERS["casual-guy"], { pos: [0, 0], facing: 0 }, {});
    const end = person.addWalk(0, [3, 4], { run: false, endFacing: 180 * DEG });
    const final = person.state(end + 0.5);
    expect(distance2([final.pos[0], final.pos[2]], [3, 4])).toBeLessThan(1e-6);
    expect(angleDelta(final.facing, 180 * DEG)).toBeCloseTo(0, 3);
  });

  it("never spins: facing changes smoothly during a walk", () => {
    const person = new CharacterTrack("mike", CHARACTERS["casual-guy"], { pos: [0, 0], facing: 200 * DEG }, {});
    const end = person.addWalk(0, [-2, -3], { run: false, endFacing: 180 * DEG });
    let previous = person.state(0).facing;
    for (let t = 0.02; t <= end; t += 0.02) {
      const facing = person.state(t).facing;
      expect(Math.abs(angleDelta(previous, facing))).toBeLessThan(10 * DEG);
      previous = facing;
    }
  });
});

describe("getting in and out of cars", () => {
  const setup = () => {
    const car = new CarTrack("sedan", CARS.sedan, [0, 0], 90 * DEG);
    const cars = { sedan: car };
    const person = new CharacterTrack("mike", CHARACTERS["casual-guy"], { pos: [0, 5], facing: 180 * DEG }, cars);
    return { car, person };
  };

  it("ends up seated and rides along with the car", () => {
    const { car, person } = setup();
    const seated = person.addEnter(0, "sedan", "passenger");
    car.addDrive(seated + 0.5, { to: [30, 0], duration: 3, easeName: "smooth", reverse: false });
    car.finalize(seated + 5);
    const later = person.state(seated + 4);
    expect(later.ridingIn).toBe("sedan");
    expect(later.pos[0]).toBeGreaterThan(29);
  });

  it("refuses to walk while seated", () => {
    const { person } = setup();
    const seated = person.addEnter(0, "sedan", "driver");
    expect(() => person.addWalk(seated + 1, [5, 5], { run: false })).toThrow(/exit\(\) first/);
  });

  it("stands outside the door after exiting", () => {
    const { car, person } = setup();
    const seated = person.addEnter(0, "sedan", "driver");
    const out = person.addExit(seated + 1);
    car.finalize(out + 1);
    const state = person.state(out + 0.5);
    expect(state.ridingIn).toBeUndefined();
    expect(state.pos[1]).toBeCloseTo(0);
    expect(distance2([state.pos[0], state.pos[2]], car.seatWorld("driver", out).doorStand)).toBeLessThan(1e-3);
  });
});

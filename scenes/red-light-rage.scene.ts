import { after, at, camera, car, caption, character, next, prop, scene, sound } from "../src/engine/dsl";

// Highway at sunset, three cars in the right lane: A (white) in front, B (red) tailgating, C (black, dashcam) behind.
// B honks at A for going slow, they all stop at a red light, B yells, A gets out and flips B off, C cracks up at
// the wheel. A gets back in, the light goes green, A peels off into the sunset, and C is glad the dashcam got it all.
// Lane z = 5.4 (heading +X). Drivers' doors face -Z (toward the empty fast lane at z = 1.8, where A stands).
// Stop line at x = 99.5: A stops at x = 96.8, B at 90, C at 83.

const carA = car("car-a", "sedan", { at: [29, 5.4], facing: 90, color: "#f8f9fa" });
const carB = car("car-b", "sedan", { at: [22, 5.4], facing: 90, color: "#e63946" });
const carC = car("car-c", "sedan", { at: [12, 5.4], facing: 90, color: "#22232b", dashcam: true });
const driverA = character("driver-a", "casual-guy", { at: [0, 0], seatedIn: { car: carA, seat: "driver" } });
const driverB = character("driver-b", "business-man", { at: [0, 0], seatedIn: { car: carB, seat: "driver" } });
const driverC = character("driver-c", "casual-girl", { at: [0, 0], seatedIn: { car: carC, seat: "driver" } });

export default scene({
  id: "red-light-rage",
  title: "Red light rage",
  duration: 27,
  format: "vertical",
  style: "sunset",
  set: "highway",
  props: [prop("traffic-light", [101, 9.3], { facing: 270, green: { cue: "a-in", delay: 0.5 } })],
  cast: [carA, carB, carC, driverA, driverB, driverC],
  timeline: [
    // ── Cruising, then everyone brakes for the red light ──────────────────────────────
    at(0, carA.driveTo([75, 5.4], { fromSpeed: 11, endSpeed: 11 })),
    next(carA.driveTo([96.8, 5.4], { endSpeed: 0 })).as("a-stop"),
    at(0, carB.driveTo([68, 5.4], { fromSpeed: 11, endSpeed: 11 })),
    next(carB.driveTo([90, 5.4], { endSpeed: 0 })),
    at(0, carC.driveTo([61, 5.4], { fromSpeed: 11, endSpeed: 11 })),
    next(carC.driveTo([83, 5.4], { endSpeed: 0 })),

    // ── B leans on the horn ───────────────────────────────────────────────────────────
    at(0.5, carB.honk({ times: 3, duration: 0.22 })).as("honk"),
    at(0.4, driverB.feel("angry")),
    after("honk", driverB.say("You're driving too slow,\nMOVE IT!"), 0.1).as("too-slow"),
    after("honk", driverB.play("yell", { duration: 2.4 }), 0.1),

    // ── Stopped at the light ──────────────────────────────────────────────────────────
    after("a-stop", driverB.say("F U! Learn how\nto DRIVE!"), 0.3).as("fu"),
    after("a-stop", driverB.play("yell", { duration: 2.2 }), 0.3),
    after("fu", driverA.feel("angry"), -0.6),
    after("fu", driverA.exit(), 0.1).as("a-out"),
    next(driverA.turnTo(270, { duration: 0.4 })),
    next(driverA.play("middle-finger", { duration: 2.4 })).as("bird"),
    after("bird", driverB.feel("shocked"), -1.8),
    after("bird", driverA.feel("smug"), -1.2),

    // ── C loses it ────────────────────────────────────────────────────────────────────
    after("bird", driverC.feel("happy"), -0.4),
    after("bird", driverC.play("smack-wheel", { duration: 2.6 }), -0.2).as("smack"),
    after("bird", driverC.say("[laughs] HAHAHA!"), -0.1),

    // ── A gets back in and peels off into the sunset ──────────────────────────────────
    after("bird", driverA.enter(carA, "driver"), 0.2).as("a-in"),
    after("a-in", carA.driveTo([320, 5.4], { fromSpeed: 0, endSpeed: 34 }), 0.9).as("peel"),
    after("a-in", sound("screech", { at: [96.8, 0.4, 5.4], volume: 0.8 }), 0.95),
    after("a-in", driverB.feel("angry"), 0.9),

    // ── C, to herself ─────────────────────────────────────────────────────────────────
    after("a-in", driverC.feel("smug"), 3.0),
    after("a-in", driverC.say("Glad I got a dashcam to embarrass\nthese fooligans online."), 3.2).as("glad"),

    // ── Camera ────────────────────────────────────────────────────────────────────────
    // The line of three from high behind, then B ranting through his window.
    at(0, camera.follow(carB, "chase", { offset: [0, 5.2, -21], local: true })),
    at(0.2, caption("Just a chill evening drive...", { position: "top", duration: 2.2 })),
    after("too-slow", camera.follow(carB, "side-left", { offset: [3.6, 1.35, 1.1], local: true }), -2.6),
    // Brake lights stacking up toward the red light.
    after("too-slow", camera.follow(carC, "chase", { offset: [2.4, 1.7, -8], local: true })),
    after("a-stop", camera.still([91.6, 1.5, 2.0], [90.3, 1.25, 4.9]), 0.2),
    // A climbs out and turns on B.
    after("fu", camera.still([91.6, 1.55, 2.4], [96.4, 1.35, 3.9])),
    after("a-out", camera.still([93.9, 1.55, 3.0], [97, 1.45, 3.9]), 0.2),
    after("bird", camera.still([86.6, 1.6, 3.7], [83.3, 1.25, 4.95]), -0.3),
    // Light goes green; A shrinks into the sun.
    after("a-in", camera.still([86.5, 3.4, 3.4], carA), 0.1),
    after("a-in", camera.still([87.0, 1.95, 5.2], [83.4, 1.3, 4.95]), 3.1),
    after("glad", caption("Instantly posted.", { position: "top", size: "title", duration: 1.8 }), 0.1),
  ],
});

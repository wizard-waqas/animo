import { after, at, camera, caption, car, character, cutTo, prop, scene } from "../src/engine/dsl";

// A dirt truck hits a bump on the highway and splatters A's black sedan with mud. At home A checks the dashcam
// footage, spots the company's number on the tailgate, calls and demands they pay. They send a $1,000,000 check.
// Ending: A on the porch with a coffee, thanking the dashcam on the other chair.
//
// Locations (cutTo): highway → suburb (home) → parking-lot (the truck company's yard) → suburb (mailbox, porch).
// Highway: both vehicles eastbound at 20 m/s in the right lane (z = 5.4), the sedan 6.5m behind the truck.
//   Bump at x = 40: the truck's front axle reaches it at t = 3.9, the sedan's at t = 4.54.
// Home: house at x = 48 (no driveway), muddy sedan at the curb (44, -2.4), porch deck in front of the house:
//   A's chair (48, -11.2), table (47.15, -10.95), the dashcam's chair (46.3, -11.2). Mailbox at (51.2, -5.6).

const truck = car("truck", "dump-truck", {
  at: [-40, 5.4], facing: 90, label: "MUDDY BROS.", rearLabel: "CALL 555-0142", set: "highway",
});
const sedan = car("sedan", "sedan", { at: [-52.1, 5.4], facing: 90, color: "#1f1f24", dashcam: true, set: "highway" });
const trucker = character("trucker", "mechanic", { at: [0, 0], seatedIn: { car: truck, seat: "driver" }, set: "highway" });
const driver = character("driver", "casual-guy", { at: [0, 0], seatedIn: { car: sedan, seat: "driver" }, set: "highway" });

const homeCar = car("home-car", "sedan", { at: [44, -2.4], facing: 270, color: "#1f1f24", dashcam: true, muddy: true, set: "suburb" });
// Same person as `driver` (same model, so the same voice), at home.
const me = character("me", "casual-guy", { at: [40.0, -4.6], facing: 220, set: "suburb" });

const yardTruck = car("yard-truck", "dump-truck", { at: [-2.5, -13.5], facing: 90, label: "MUDDY BROS.", rearLabel: "CALL 555-0142", set: "parking-lot" });
const rep = character("rep", "business-woman", { at: [1.2, -9.6], facing: 15, set: "parking-lot" });

const HIGHWAY_SPEED = 20;

export default scene({
  id: "mud-money",
  title: "Mud money",
  duration: 36.2,
  format: "vertical",
  style: "sunny",
  set: "highway",
  props: [
    prop("bump", [40, 5.4], { set: "highway" }),
    prop("porch", [48, -11.6], { set: "suburb" }),
    prop("chair", [48.0, -11.2], { facing: -20, set: "suburb" }),
    prop("table", [47.15, -10.95], { set: "suburb" }),
    prop("chair", [46.3, -11.2], { facing: 20, set: "suburb" }),
    prop("dashcam", [46.3, -11.15], { facing: 70, y: 0.45, set: "suburb" }),
    prop("mug", [47.4, -10.85], { y: 0.72, set: "suburb", from: { cue: "set-down", delay: -0.63 } }),
    prop("mailbox", [51.2, -5.6], { set: "suburb", color: "#c1121f" }),
  ],
  cast: [truck, sedan, trucker, driver, homeCar, me, yardTruck, rep],
  timeline: [
    // ── Highway: the bump and the mud ────────────────────────────────────────────────
    at(0, truck.driveTo([1000, 5.4], { fromSpeed: HIGHWAY_SPEED, endSpeed: HIGHWAY_SPEED })),
    at(0, sedan.driveTo([1000, 5.4], { fromSpeed: HIGHWAY_SPEED, endSpeed: HIGHWAY_SPEED })),
    at(3.9, truck.hop({ height: 0.3, duration: 0.45, sound: "thud" })).as("bump"),
    at(4.54, sedan.hop({ height: 0.12, duration: 0.3, sound: "thud" })),
    after("bump", truck.mudOnto(sedan), -0.2).as("splat"),
    at(1.2, driver.feel("happy")),
    after("splat", driver.feel("shocked"), -0.3),
    after("splat", driver.say("NOOO!\nMy car!!"), 0.6).as("noo"),

    // ── Home: what happened? ─────────────────────────────────────────────────────────
    after("noo", me.feel("sad"), 0.3).as("home"),
    after("home", me.play("facepalm", { duration: 1.5 }), 0.3),
    after("home", me.play("check-phone", { duration: 7.6 }), 2.0).as("footage"),
    // ...dashcam footage plays here (camera, below)...
    after("footage", me.feel("smug"), -2.4),
    after("footage", me.say("Wait... their number's\nright on the truck!"), -2.2).as("number"),
    after("number", me.feel("angry"), 0.1),
    after("number", me.play("phone-call", { duration: 4.2 }), 0.1),
    after("number", me.say("Your truck covered my car\nin mud. You're paying!"), 0.5).as("demand"),

    // ── The truck company ────────────────────────────────────────────────────────────
    after("demand", rep.feel("scared"), -0.5),
    after("demand", rep.play("phone-call", { duration: 3.4 })),
    after("demand", rep.say("So sorry, sir!\nA check is on its way!"), 0.3).as("sorry"),

    // ── The check ────────────────────────────────────────────────────────────────────
    after("sorry", me.place([50.4, -4.8], 10), 0.2).as("mail"),
    after("mail", me.feel("happy")),
    after("mail", me.play("show-check", { duration: 2.7 }), 0.2),
    after("mail", me.play("jump", { duration: 1.0 }), 1.2),

    // ── Porch: coffee and thanks ─────────────────────────────────────────────────────
    after("mail", me.place([48.0, -11.2], -20), 2.9).as("porch"),
    after("porch", me.play("sit-chair", { duration: 0.02 })),
    after("porch", me.feel("happy")),
    after("porch", me.play("hold-mug", { duration: 3.6 })),
    after("porch", me.play("sip", { duration: 2.0 }), 0.3).as("sip"),
    after("sip", me.say("Aah."), 0.1).as("aah"),
    after("aah", me.play("set-down", { duration: 1.4 }), 0.1).as("set-down"),
    after("set-down", me.play("look-right", { duration: 3.13 })),
    after("set-down", me.say("Thanks, Dashcam."), 0.4).as("thanks"),

    // ── Camera & locations ───────────────────────────────────────────────────────────
    at(0, camera.follow(truck, "chase", { offset: [0.9, 2.7, -19.5], local: true })),
    at(0.3, caption("Just driving home...", { position: "top", duration: 2.6 })),
    after("splat", camera.follow(sedan, "front", { offset: [0.6, 1.0, 5.6], local: true, smooth: 0.2 }), 0.15),

    after("noo", cutTo("suburb"), 0.3),
    after("noo", camera.still([37.6, 1.55, -8.4], [41.6, 1.05, -3.4]), 0.3),
    after("noo", caption("Later, at home...", { position: "top", duration: 2.2 }), 0.4),
    after("home", camera.follow(me, "close", { offset: [0.5, 0.0, 1.9], local: true }), 2.0),
    after("home", camera.replay(sedan, { from: 2.5, to: 5.3 }), 2.9).as("replay"),
    after("replay", camera.replay(sedan, { from: 1.3, to: 2.9, fov: 26 })).as("zoom"),
    after("zoom", camera.follow(me, "close", { offset: [0.5, 0.0, 1.9], local: true })),

    after("demand", cutTo("parking-lot")),
    after("demand", camera.follow(rep, "close", { offset: [-0.7, 0.15, 2.6], local: true })),

    after("sorry", cutTo("suburb"), 0.2),
    after("sorry", camera.still([50.3, 1.5, -1.5], [50.9, 1.2, -4.9]), 0.2),
    after("mail", caption("ONE MILLION DOLLARS", { position: "top", size: "title", duration: 2.6 }), 0.4),

    after("mail", camera.still([47.4, 1.2, -7.4], [47.3, 0.8, -11.1]), 2.9),
    after("set-down", camera.still([46.4, 1.1, -7.3], [47.2, 0.75, -11.1])),
  ],
});

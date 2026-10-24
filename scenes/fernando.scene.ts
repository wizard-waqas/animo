import { after, at, camera, car, character, next, scene } from "../src/engine/dsl";

// Suburb. Hapin rides his blue motorcycle (Fernando) east in the near lane (z = 1.8), singing. A guy hiding behind a
// bush runs out and kicks the bike over: it slides down on its side, Hapin is thrown and lands flat. The kicker
// runs off. A cop pulls up in the far lane (z = -1.8, heading -X) and gets out. Hapin insists there are two victims,
// the cop sees one person, and Hapin points out Fernando (the bike), then strikes a pose: peace sign, hand on hip.
// Kick spot x ≈ 2.2; the bike slides to x ≈ 6, Hapin lands at about [6.4, 2.8].

const bike = car("fernando", "motorcycle", { at: [-38, 1.8], facing: 90, color: "#1e6bff" });
const cruiser = car("cruiser", "police", { at: [36, -1.8], facing: 270 });
const hapin = character("hapin", "casual-guy", { at: [0, 0], seatedIn: { car: bike, seat: "driver" }, colors: { shirt: "#ffd60a", pants: "#1d3557" } });
const kicker = character("kicker", "casual-guy", { at: [5.8, 7.6], facing: 200, colors: { shirt: "#2b2d42", pants: "#495057", hair: "#111111" } });
const cop = character("cop", "officer", { at: [0, 0], seatedIn: { car: cruiser, seat: "driver" } });

export default scene({
  id: "fernando",
  title: "Two victims",
  duration: 29.1,
  format: "vertical",
  style: "sunny",
  set: "suburb",
  cast: [bike, cruiser, hapin, kicker, cop],
  timeline: [
    // ── Cruising and singing ──────────────────────────────────────────────────────────
    at(0, bike.driveTo([90, 1.8], { fromSpeed: 7, endSpeed: 7 })),
    at(0, hapin.feel("happy")),
    at(0.3, hapin.say("[sings] Bom bom bom, Motorcycle!\nBlue blue blue! Motorcycle!\nWoohoo!")).as("song"),
    after("song", hapin.play("wave", { duration: 1.4 }), -1.4),

    // ── The kick ──────────────────────────────────────────────────────────────────────
    at(0, kicker.feel("smug")),
    at(2.6, kicker.runTo([2.6, 2.8], { facing: 180 })),
    next(kicker.kickOver(bike)).as("kick"),
    after("kick", kicker.feel("happy"), -0.4),
    after("kick", kicker.runTo([-14, 9]), 0.1).as("flee"),

    // ── Cop pulls up ──────────────────────────────────────────────────────────────────
    after("kick", cruiser.siren(true), -1.2),
    after("kick", cruiser.driveTo([9.6, -1.8], { fromSpeed: 12, endSpeed: 0 }), -1.2).as("cop-stop"),
    after("cop-stop", cruiser.siren(true, { sound: false }), 0.2),
    after("cop-stop", cop.exit(), 0.1).as("cop-out"),

    after("kick", hapin.play("get-up"), 0.9).as("up"),
    after("up", hapin.feel("sad"), -0.6),

    after("cop-out", cop.walkTo([8.2, 2.8], { facing: 270 })).as("cop-ready"),
    after("cop-out", hapin.turnTo(90)),

    // ── Two victims ───────────────────────────────────────────────────────────────────
    after("cop-out", hapin.say("I'm a victim, and so is my friend.\nTWO victims!"), 0.9).as("victims"),
    after("cop-out", hapin.play("hold-neck", { duration: 2.6 }), 0.9),
    after("victims", cop.say("Are you okay? Did you get a concussion?\nThere is only you. One person."), 0.2).as("one"),
    after("victims", cop.play("shrug", { duration: 1.6 }), 2.4),
    after("one", hapin.feel("angry"), -0.4),
    after("one", hapin.turnTo(205, { duration: 0.35 }), -0.2),
    after("one", hapin.say("FERNANDO IS RIGHT HERE!"), 0.1).as("right-here"),
    after("one", hapin.play("point", { duration: 2 }), 0.1),
    after("right-here", hapin.turnTo(55, { duration: 0.4 }), 0.1).as("pose-turn"),
    after("pose-turn", hapin.feel("smug")),
    after("pose-turn", hapin.play("peace-sign", { duration: 2.6 })),
    after("pose-turn", hapin.play("hand-on-hip", { duration: 2.6 })).as("pose"),
    after("pose", cop.feel("shocked"), -2.2),

    // ── Camera ────────────────────────────────────────────────────────────────────────
    at(0, camera.follow(bike, "front")),
    at(3.2, camera.follow(bike, "chase")),
    after("kick", camera.still([3.6, 1.9, 12.5], [4.6, 1.0, 2.0]), -1.35),
    after("kick", camera.still([6.5, 2.2, 11.5], [8, 0.9, 0.6]), 0.8).as("aftermath"),
    after("cop-out", camera.still([7.2, 1.75, 7.6], [7.2, 1.25, 2.4]), 0.4),
    after("one", camera.still([5.4, 1.4, -2.6], [7, 1.15, 2.6]), -0.2),
    after("right-here", camera.still([10.4, 1.6, 7.2], [7.2, 1.2, 2.8]), 0.1),
  ],
});

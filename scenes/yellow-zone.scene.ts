import { after, at, camera, caption, car, character, next, scene } from "../src/engine/dsl";

// She backs out of her driveway straight into the neighbor's SUV, parked on the "EMERGENCY VEHICLES ONLY"
// yellow. He storms out yelling, she points at the paint, he fetches his parents, her husband ends it.
// Narrow street: her lot is the north lot at x = 0 (house door [-2.5, -11], driveway x = 3.5); his is the
// south lot at x = 8 (door [5.5, 11]). Everyone else is parked on the yellow too (z = ±4, clear of driveways).
// People who "come out" start just inside their front door, so the house hides them until they walk out.

const sedan = car("sedan", "sedan", { at: [3.5, -8], facing: 180, color: "#e63946" });
const suv = car("suv", "suv", { at: [3.5, 4], facing: 90, color: "#adb5bd" });
const parked = [
  car("parked-1", "sedan", { at: [-4.6, -4], facing: 270, color: "#3a86ff" }),
  car("parked-2", "compact", { at: [11.5, -4], facing: 270, color: "#ffbe0b" }),
  car("parked-3", "pickup", { at: [-20.5, -4], facing: 270, color: "#2a9d8f" }),
  car("parked-4", "compact", { at: [-12, 4], facing: 90, color: "#8338ec" }),
  car("parked-5", "van", { at: [19.5, 4], facing: 90, color: "#f1faee" }),
  car("parked-6", "sedan", { at: [27, -4], facing: 270, color: "#6c757d" }),
];

const wife = character("wife", "casual-girl", { at: [0, 0], seatedIn: { car: sedan, seat: "driver" } });
const neighbor = character("neighbor", "casual-guy", {
  at: [5.5, 12.4], facing: 180, colors: { skin: "#a0663f", hair: "#111111", shirt: "#ffb703", pants: "#3d405b" },
});
const papa = character("papa", "grandpa", {
  at: [5.0, 12.6], facing: 180, colors: { skin: "#9c6640", shirt: "#f8f9fa", pants: "#efe3c8", shoes: "#6b4226" },
});
const mummy = character("mummy", "grandma", {
  at: [6.0, 12.6], facing: 180, colors: { skin: "#a8704a", hair: "#3b3b3b", shirt: "#d0006f", pants: "#d0006f", shoes: "#c9a227" },
});
const husband = character("husband", "mechanic", {
  at: [-2.5, -12.4], facing: 0, colors: { shirt: "#212529", pants: "#495057", skin: "#e0ac69" },
  voice: "pNInz6obpgDQGcFmaJgB", // Adam: dominant, firm
});

export default scene({
  id: "yellow-zone",
  title: "Yellow zone",
  duration: 32.5,
  format: "vertical",
  style: "sunny",
  set: "narrow-street",
  cast: [sedan, suv, ...parked, wife, neighbor, papa, mummy, husband],
  timeline: [
    // Backs out without looking, straight across the narrow street into the SUV.
    at(0.5, sedan.driveTo([3.5, -2.6], { reverse: true, fromSpeed: 0, endSpeed: 5 })),
    next(sedan.crashInto(suv, { brake: 1.5 })).as("crash"),

    // She gets out. He storms out of his house.
    after("crash", wife.feel("shocked"), 0.1),
    after("crash", wife.exit(), 0.4),
    next(wife.walkTo([0.9, 1.3], { facing: 350 })).as("wife-ready"),
    after("crash", neighbor.feel("angry"), 0.9),
    after("crash", neighbor.runTo([0.4, 3.0], { facing: 180, speed: 4.2 }), 1.0).as("neighbor-ready"),

    after("neighbor-ready", neighbor.say("Why did you hit my car!"), 0.1).as("why"),
    after("neighbor-ready", neighbor.play("yell", { duration: 2 }), 0.1),
    after("why", wife.feel("smug"), -0.3),
    after("why", wife.say("It was an accident.\nBut not mine."), 0.1).as("accident"),
    after("accident", wife.say("You are parked in a\nno parking zone."), 0.05).as("no-parking"),
    after("accident", wife.play("point", { duration: 1.8 })),

    // Shock, then he calls in the parents.
    after("no-parking", neighbor.feel("shocked"), -0.6),
    after("no-parking", neighbor.turnTo(90, { duration: 0.35 }), 0.1),
    next(neighbor.say("MUMMY! PAPA!")).as("call"),
    after("call", papa.feel("angry"), -0.8),
    after("call", mummy.feel("angry"), -0.8),
    after("call", papa.runTo([-1.3, 3.7], { facing: 150, speed: 3.8 }), -0.8).as("papa-ready"),
    after("call", mummy.runTo([-2.3, 4.7], { facing: 150, speed: 3.6 }), -0.7),
    after("papa-ready", neighbor.turnTo(180, { duration: 0.35 }), -0.4),
    after("papa-ready", neighbor.feel("angry"), -0.4),
    after("papa-ready", papa.say("Who did this?!"), 0.05).as("papa-yell"),
    after("papa-ready", papa.play("yell", { duration: 1.6 }), 0.05),
    after("papa-ready", mummy.play("yell", { duration: 1.8 }), 0.1),
    after("papa-ready", wife.feel("scared")),

    // Her husband comes out.
    after("call", husband.feel("angry"), 0.2),
    after("call", husband.runTo([0.6, 1.8], { facing: 0, speed: 4.2 }), 0.2).as("husband-ready"),
    after("husband-ready", wife.walkTo([-0.8, 0.6], { facing: 20 }), -2.0),
    after("husband-ready", husband.say("Who's yelling at my wife?"), 0.05).as("husband-line"),
    after("husband-ready", wife.feel("smug"), 0.2),

    // The beatdown.
    after("husband-line", husband.play("punch", { duration: 1.6 })).as("punch-1"),
    after("husband-line", neighbor.play("stagger", { duration: 0.8 }), 0.15),
    next(neighbor.play("knocked-out")),
    after("punch-1", neighbor.feel("dazed"), -0.2),
    after("punch-1", papa.feel("shocked"), -0.4),
    after("punch-1", husband.walkTo(papa.spot("front", 0.95))).as("husband-at-papa"),
    after("husband-at-papa", husband.play("punch", { duration: 1.2 })).as("punch-2"),
    after("husband-at-papa", papa.play("knocked-out"), 0.4),
    after("punch-2", papa.feel("dazed"), -0.3),
    after("punch-1", mummy.feel("scared"), 0.2),
    after("punch-2", mummy.play("cower", { duration: 2.4 }), -0.6),
    after("punch-2", husband.play("arms-crossed", { duration: 2.2 }), 0.2),
    after("punch-2", wife.play("arms-crossed", { duration: 2.1 }), 0.3),

    // Camera: establish the street and the yellow, then cut through the argument.
    at(0, camera.still([-3, 6.5, 9], [3.5, 0, -2.5])),
    after("crash", camera.still([0.2, 4.6, 4.2], [4.2, 0.9, 9.8]), 0.6),
    after("neighbor-ready", camera.still([-3.6, 1.7, 2.2], [0.65, 1.2, 2.15]), -1.3),
    after("accident", camera.follow(wife, "close"), -0.2),
    after("no-parking", camera.follow(neighbor, "close"), -0.2),
    after("call", camera.still([0.2, 4.6, 4.2], [4.2, 0.9, 9.8]), -0.3),
    after("papa-ready", camera.still([-10, 3, 0.8], [-0.6, 1.0, 2.7]), -1.2),
    after("husband-line", camera.still([-6.5, 2.0, 1.0], [-0.4, 1.0, 2.8])),
    after("husband-line", camera.shake({ intensity: 0.2, duration: 0.4 }), 0.5),
    after("husband-line", camera.shake({ intensity: 0.2, duration: 0.4 }), 1.3),
    after("punch-1", camera.still([-10, 3, 0.8], [-0.6, 1.0, 2.7]), 0.2),
    after("punch-2", camera.shake({ intensity: 0.25, duration: 0.4 }), 0.6),
    at(0.2, caption("EMERGENCY VEHICLES ONLY", { position: "top", size: "title", duration: 2.4 })),
    after("punch-2", caption("Read the yellow.", { position: "top", size: "title", duration: 2.3 }), 0.3),
  ],
});

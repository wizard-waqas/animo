import { after, at, camera, caption, car, character, next, scene } from "../src/engine/dsl";

// Forest highway brake check: B (silver) cuts in front of A (yellow) and slams the brakes; A rear-ends B.
// B's passenger fakes a neck injury, B's driver yells, then tries to rip out A's dashcam. Police arrive,
// tase her, review the dashcam footage, and arrest her.
// Highway: eastbound lanes z = 1.8 (fast) and z = 5.4 (right), shoulders z ≈ -0.6 and 8.3. Trees beyond.
// After the crash the cars rest around x = 108 (A) and x = 115.6 (B).

const carA = car("car-a", "sedan", { at: [-60, 5.4], facing: 90, color: "#ffd23f", dashcam: true });
const carB = car("car-b", "sedan", { at: [-75, 1.8], facing: 90, color: "#b9c0c9" });
const police = car("police", "police", { at: [-120, 8.3], facing: 90 });
const driverA = character("driver-a", "casual-guy", { at: [0, 0], seatedIn: { car: carA, seat: "driver" } });
const driverB = character("driver-b", "business-woman", { at: [0, 0], seatedIn: { car: carB, seat: "driver" } });
const passenger = character("passenger", "casual-guy", {
  at: [0, 0], seatedIn: { car: carB, seat: "passenger" }, colors: { shirt: "#e76f51", hair: "#6b4226", pants: "#495057" },
});
const cop = character("cop", "officer", { at: [0, 0], seatedIn: { car: police, seat: "driver" } });
const cop2 = character("cop-2", "officer-woman", { at: [0, 0], seatedIn: { car: police, seat: "passenger" } });

export default scene({
  id: "brake-check",
  title: "Brake check",
  duration: 58.6,
  format: "vertical",
  set: "highway",
  cast: [carA, carB, police, driverA, driverB, passenger, cop, cop2],
  timeline: [
    // ── The brake check ───────────────────────────────────────────────────────────────
    at(0, carA.driveTo([600, 5.4], { fromSpeed: 22, endSpeed: 22 })),
    at(0, carB.driveTo([4.5, 1.8], { fromSpeed: 22, endSpeed: 31 })),
    next(carB.driveThrough([[40, 2.0], [70, 5.4]], { endSpeed: 26 })).as("cut-in"),
    next(carB.driveTo([92, 5.4], { endSpeed: 22 })).as("in-front"),
    next(carB.driveTo([114, 5.4], { endSpeed: 0 })),
    after("in-front", carA.honk({ times: 2, duration: 0.25 }), 0.35),
    after("in-front", carA.crashInto(carB, { brake: 6 }), 0.45).as("crash"),

    // ── Everyone gets out ─────────────────────────────────────────────────────────────
    after("crash", driverB.feel("angry"), 0.6),
    after("crash", driverB.exit(), 0.9),
    after("crash", passenger.feel("pain"), 1.4),
    after("crash", passenger.exit(), 1.6),
    next(passenger.walkTo([118.5, 8.3], { speed: 0.55, facing: 200 })),
    after("crash", passenger.play("hold-neck", { duration: 30 }), 2.4),
    after("crash", passenger.say("Ohhh, my NECK!", { duration: 2 }), 3.4),
    after("crash", driverA.exit(), 1.3),
    next(driverA.walkTo(carA.spot("left", 2.6), { facing: 90 })).as("a-ready"),
    after("a-ready", driverB.runTo(driverA.spot("front", 1.5))).as("b-arrives"),

    // ── The argument ──────────────────────────────────────────────────────────────────
    after("b-arrives", driverB.say("OMG you just\nHIT me!!")).as("yell"),
    after("b-arrives", driverB.play("yell", { duration: 2.2 })),
    after("yell", driverA.say("No I didn't.")).as("no"),
    after("no", driverA.feel("smug")),
    after("no", driverA.say("And I have a dashcam\nto prove it.")).as("dashcam"),
    after("no", driverA.play("point", { duration: 1.8 })),
    after("dashcam", driverA.say("You're done for.")).as("done"),
    after("dashcam", driverA.play("arms-crossed", { duration: 2.4 })),
    after("dashcam", driverB.feel("scared"), 0.3),
    after("dashcam", driverB.play("cower", { duration: 1.8 }), 0.4),

    // ── Sirens in the distance… the cruiser comes in fast from behind and pulls onto the shoulder ──
    after("dashcam", police.siren(true)),
    after("dashcam", police.driveTo([55, 8.3], { fromSpeed: 30, endSpeed: 30 })),
    next(police.driveTo([100.5, 8.3], { endSpeed: 0 })).as("police-stop"),

    // ── She snaps: shove, then goes for the dashcam ───────────────────────────────────
    after("done", driverB.feel("angry"), 0.6),
    after("done", driverB.say("Give me that\nfootage!!"), 0.6).as("snap"),
    after("snap", driverB.play("shove", { duration: 0.8 }), -0.6).as("shove"),
    after("shove", driverA.feel("shocked"), -0.45),
    after("shove", driverA.play("stagger", { duration: 1.1 }), -0.5),
    after("shove", driverA.say("HEY!!"), -0.3),
    next(driverA.walkTo([111.6, 7.9], { facing: 200 })),
    after("shove", driverB.yankDashcam(carA, { duration: 8 })).as("yank"),
    after("shove", driverB.say("This footage\nis GONE!"), 1.2),

    // ── Police ────────────────────────────────────────────────────────────────────────
    after("police-stop", police.siren(true, { sound: false }), 1.2),
    after("police-stop", cop.exit(), 0.1),
    next(cop.runTo([105.4, 2.4])).as("cop-ready"),
    after("police-stop", cop.say("Step AWAY from\nthe vehicle!"), 1.6),
    after("police-stop", cop2.exit(), 0.4),
    next(cop2.walkTo(carA.door("passenger"))).as("cop2-at-car"),
    after("cop-ready", cop.tase(driverB, { duration: 2.4 }), 0.1).as("tased"),
    after("tased", driverA.feel("shocked"), -2),
    after("tased", passenger.feel("shocked"), -2.2),

    // ── The footage ───────────────────────────────────────────────────────────────────
    after("tased", carA.openDoor("passenger"), -0.6),
    after("tased", driverA.feel("smug"), 0.2),
    after("tased", driverA.say("It's all on\nmy dashcam."), 0.2).as("its-all-there"),
    // ...replay plays here (camera, below)...
    after("its-all-there", cop2.play("nod", { duration: 1.4 }), 4.4),
    after("its-all-there", cop2.say("Yep. She brake-\nchecked you."), 4.4).as("verdict"),

    // ── Arrest ────────────────────────────────────────────────────────────────────────
    after("verdict", driverB.feel("sad")),
    after("verdict", driverB.play("get-up", { duration: 1.6 })).as("up"),
    after("up", driverB.play("cuffed", { duration: 9.2 })),
    after("up", cop.say("You're under arrest.")),
    after("up", driverB.enter(police, "rear-left"), 0.4),
    after("up", cop.walkTo(police.spot("left", 2.8)), 0.6),
    after("verdict", passenger.feel("neutral"), 2.2),
    after("verdict", passenger.say("...my neck's fine\nnow actually."), 2.2),
    after("up", driverA.feel("happy"), 1.2),
    after("up", driverA.play("wave", { duration: 2.2 }), 1.5),

    // ── Camera ────────────────────────────────────────────────────────────────────────
    at(0, camera.follow(carA, "chase", { offset: [0, 3.4, -11], local: true })),
    at(0.3, caption("Just another commute...", { position: "top", duration: 2.6 })),
    after("crash", camera.still([100, 5.5, -0.6], [112, 0.8, 4.6]), 1.0),
    after("b-arrives", camera.follow(driverB, "close", { offset: [-1.5, 0.1, 1.6], local: true })),
    after("yell", camera.follow(driverA, "close", { offset: [1.5, 0.1, 1.6], local: true })),
    after("dashcam", camera.follow(driverB, "close", { offset: [-0.9, 0.2, 2.6], local: true }), 0.4),
    after("done", camera.still([103.5, 3.4, -0.5], [109.5, 1.0, 3.4]), 0.5),
    // Cruiser pulls up behind A, seen from up the road past the yanking.
    after("police-stop", camera.still([114, 2.8, 0.4], [102, 1.0, 6.4]), -2.6),
    after("police-stop", camera.still([103.8, 2.2, 0.1], [107.6, 1.1, 3.2]), 1.4),
    after("tased", camera.still([113, 2.3, 9.2], [108.5, 1.2, 5.6])),
    after("its-all-there", camera.replay(carA, { from: 4.3, to: 8.3 }), 0.1),
    after("its-all-there", camera.still([113, 2.3, 9.2], [108.5, 1.2, 5.6]), 4.1),
    after("verdict", camera.still([101.5, 3.8, -0.6], [106.5, 0.8, 3.8])),
    after("verdict", camera.follow(passenger, "close"), 2.1),
    after("up", camera.still([94.5, 3.2, 1.2], [100.5, 1.1, 6.6]), 2.5),
    after("up", caption("Dashcam 1, Brake checker 0", { position: "top", size: "title", duration: 3.2 }), 5.9),
  ],
});

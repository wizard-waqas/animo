import { after, at, camera, caption, car, character, next, scene } from "../src/engine/dsl";

// Highway brake check: B (faded red) speeds past A (yellow), cuts in front, slams the brakes,
// A rear-ends B. B's driver storms out yelling — A calmly points out the dashcam. B is terrified.
// Highway: eastbound lanes z = 1.8 (fast) and z = 5.4 (right). Median barrier z = -0.6.

const carA = car("car-a", "sedan", { at: [-60, 5.4], facing: 90, color: "#ffd23f", dashcam: true });
const carB = car("car-b", "sedan", { at: [-75, 1.8], facing: 90, color: "#c27474" });
const driverA = character("driver-a", "casual-guy", { at: [0, 0], seatedIn: { car: carA, seat: "driver" } });
const driverB = character("driver-b", "business-woman", { at: [0, 0], seatedIn: { car: carB, seat: "driver" } });

export default scene({
  id: "brake-check",
  title: "Brake check",
  duration: 26,
  format: "vertical",
  set: "highway",
  cast: [carA, carB, driverA, driverB],
  timeline: [
    // Highway cruise. A holds 22 m/s (~50 mph); B floors it in the fast lane.
    at(0, carA.driveTo([600, 5.4], { fromSpeed: 22, endSpeed: 22 })),
    at(0, carB.driveTo([4.5, 1.8], { fromSpeed: 22, endSpeed: 31 })),
    next(carB.driveThrough([[40, 2.0], [70, 5.4]], { endSpeed: 26 })).as("cut-in"),
    next(carB.driveTo([92, 5.4], { endSpeed: 22 })).as("in-front"),

    // Brake check: B slams to a stop. A reacts late and doesn't brake hard enough.
    next(carB.driveTo([114, 5.4], { endSpeed: 0 })),
    after("in-front", carA.honk({ times: 2, duration: 0.25 }), 0.35),
    after("in-front", carA.crashInto(carB, { brake: 6 }), 0.45).as("crash"),

    // The argument
    after("crash", driverB.feel("angry"), 0.6),
    after("crash", driverB.exit(), 0.9),
    after("crash", driverA.exit(), 1.3),
    next(driverA.walkTo(carA.spot("left", 2.6), { facing: 90 })).as("a-ready"),
    after("a-ready", driverB.runTo(driverA.spot("front", 1.5))).as("b-arrives"),
    after("b-arrives", driverB.say("OMG you just\nHIT me!!", { duration: 2.2 })).as("yell"),
    after("b-arrives", driverB.play("yell", { duration: 2.2 })),

    after("yell", driverA.say("No I didn't.", { duration: 1.4 }), 0.2).as("no"),
    after("no", driverA.feel("smug")),
    after("no", driverA.say("And I have a dashcam\nto prove it.", { duration: 2.2 })).as("dashcam"),
    after("no", driverA.play("point", { duration: 1.8 })),
    after("dashcam", driverA.say("You're done for.", { duration: 1.6 })).as("done"),
    after("dashcam", driverA.play("arms-crossed", { duration: 2.6 })),

    after("dashcam", driverB.feel("scared"), 0.4),
    after("dashcam", driverB.play("cower", { duration: 2.8 }), 0.6),

    // Camera: high chase from behind A (dashcam-ish view), then the roadside argument.
    at(0, camera.follow(carA, "chase", { offset: [0, 3.4, -11], local: true })),
    at(0.3, caption("Just another commute...", { position: "top", duration: 2.6 })),
    // Cars come to rest around x = 108 (A) and 115.6 (B): frame both, looking down over the median.
    after("crash", camera.still([112, 6, -11], [112, 0.6, 3.5]), 1.0),
    after("b-arrives", camera.follow(driverB, "close", { offset: [-1.5, 0.1, 1.6], local: true })),
    after("yell", camera.follow(driverA, "close", { offset: [1.5, 0.1, 1.6], local: true })),
    // Over A's shoulder onto B's face, so "You're done for." and her fear land in the same shot.
    after("dashcam", camera.follow(driverB, "close", { offset: [-0.9, 0.2, 2.6], local: true }), 0.4),
    after("done", caption("Dashcam 1, Brake checker 0", { position: "top", size: "title", duration: 2.2 }), 0.1),
  ],
});

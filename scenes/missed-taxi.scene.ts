import { after, at, camera, caption, car, character, scene } from "../src/engine/dsl";

// A guy sprints for his taxi, it pulls away, he facepalms... and the taxi reverses back for him.
// Taxi waits at the curb in the +X lane (z = 1.8), so its passenger side faces the camera.

const taxi = car("taxi", "taxi", { at: [1.5, 1.8], facing: 90 });
const driver = character("driver", "grandpa", { at: [0, 0], seatedIn: { car: taxi, seat: "driver" } });
const dude = character("dude", "business-man", { at: [-15, 5.2], facing: 90 });

export default scene({
  id: "missed-taxi",
  title: "Monday mornings",
  duration: 20,
  format: "vertical",
  set: "city",
  cast: [taxi, driver, dude],
  timeline: [
    at(0.3, dude.runTo([-3, 5.0])).as("sprint"),
    at(0.3, dude.play("phone-call", { duration: 2.6 })),
    at(2.6, taxi.driveTo([20, 1.8], { duration: 3.4, ease: "cruise" })).as("gone"),
    after("sprint", dude.say("WAIT!", { duration: 1.2 }), -0.6),
    after("sprint", dude.play("wave-both", { duration: 1.4 }), -0.4),
    after("gone", dude.play("facepalm", { duration: 1.6 }), -0.6).as("facepalm"),
    after("facepalm", dude.say("Seriously?!", { duration: 1.4 }), -1.2),

    after("facepalm", taxi.driveTo([0, 1.8], { duration: 3.4, ease: "cruise", reverse: true }), -0.2).as("back"),
    after("back", driver.say("Forgot ya!", { duration: 1.5 }), -0.4),
    after("back", dude.play("cheer", { duration: 1.4 }), -0.2),
    after("back", dude.enter(taxi, "rear-right"), 1.2).as("in"),
    after("in", taxi.hop({ height: 0.35, duration: 0.5 }), 0.1),
    after("in", taxi.driveTo([60, 1.8], { duration: 5, ease: "depart" }), 0.3).as("off"),

    at(0, camera.follow(dude, "tracking", { offset: [0, 0.4, 7.5] })),
    at(0.2, caption("Monday morning, 8:59am", { position: "top", duration: 2.4 })),
    after("sprint", camera.still([-1, 7.5, 15], [-0.6, 0.2, 3.4], { blend: 1.6 }), -2.2),
    after("gone", camera.follow(dude, "close-front"), -0.6),
    after("facepalm", camera.still([-1, 7.5, 15], [-0.6, 0.2, 3.4]), 0.2),
    after("in", camera.follow(taxi, "tracking", { blend: 1.5 }), 0.3),
    after("in", caption("Monday mornings.", { position: "top", size: "title", duration: 2.6 }), 1.2),
  ],
});

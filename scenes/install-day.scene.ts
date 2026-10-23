import { after, at, camera, caption, car, character, next, scene } from "../src/engine/dsl";

// The installer van pulls up, the tech greets the customer, installs a dashcam in her car, and she loses it (happily).
// Houses are at z = -16 with driveways at x = 0, ±16, ±32. Cars heading +X use the lane at z = 1.8,
// so the van's driver door faces the houses and the tech can walk straight up the driveway.

const van = car("van", "van", { at: [-36, 1.8], facing: 90, label: "WIZARD INSTALLS" });
const sedan = car("sedan", "sedan", { at: [0, -9.5], facing: 180, color: "#3a86ff" });
const tech = character("tech", "mechanic", { at: [0, 0], seatedIn: { car: van, seat: "driver" } });
const grandma = character("grandma", "grandma", { at: [-3.2, -8.2], facing: 45 });

export default scene({
  id: "install-day",
  title: "Install day",
  duration: 27,
  format: "landscape",
  set: "suburb",
  cast: [van, sedan, tech, grandma],
  timeline: [
    at(0, van.driveTo([-3, 1.8], { duration: 4.2, ease: "arrive" })),
    at(3.2, grandma.play("wave-both", { duration: 1.8 })),

    // Greeting
    after(van, tech.exit(), 0.3),
    next(tech.walkTo(grandma.spot("front", 1.3))).as("tech-arrives"),
    next(tech.say("Hi! Here for the dashcam.", { duration: 2 })).as("hello"),
    after("hello", grandma.say("Come on in!", { duration: 1.6 }), 0.1),
    after("hello", grandma.play("nod"), 0.3),

    // The install (time passes off camera)
    after(grandma, tech.enter(sedan, "driver"), -0.4).as("tech-seated"),
    next(tech.exit(), 1.8).as("tech-out"),
    next(tech.play("point")),
    after("tech-out", tech.say("All set!", { duration: 1.4 })),

    // The reaction
    after("tech-out", grandma.say("It records EVERYTHING?!", { duration: 2 }), 1.3).as("wow"),
    after("tech-out", grandma.play("jump"), 1.4),
    after(grandma, sedan.hop({ height: 0.5 }), -0.5).as("hop"),
    after("hop", grandma.play("cheer", { duration: 2.0 })),

    // Camera + captions are planned last, so they can wait on anyone's cues.
    at(0, camera.follow(van, "tracking")),
    at(0.3, caption("Dashcam install day!", { position: "top", size: "title", duration: 2.6 })),
    at(3.0, camera.still([3, 3.2, 11], [-2.5, 1.0, -4], { blend: 1.4 })),
    after("tech-arrives", camera.follow(grandma, "close"), -0.4),
    after("hello", camera.still([-5.2, 2.1, -13.2], [-2.0, 1.0, -8.4], { blend: 1 })),
    after("tech-seated", caption("20 minutes later...", { position: "center", duration: 1.6 }), -0.4),
    after("hop", camera.shake({ intensity: 0.25, duration: 0.6 }), -0.3),
    after("hop", caption("Wizard Installs", { position: "top", size: "title", duration: 2.0 })),
  ],
});

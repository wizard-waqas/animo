import { after, at, camera, caption, car, character, next, path, scene } from "../src/engine/dsl";

// Night in the parking lot: a sports car rips a donut around the lot's center, hops, and a kid loses his mind.
// Lot asphalt spans x -35..35, z -28..16. Arc angles use the heading convention (0° = +Z, 90° = +X).

const sports = car("sports", "sports", { at: [-6, -16], facing: 0 });
const kid = character("kid", "kid", { at: [9, 9], facing: 220 });

const donut = [[-6, -9] as [number, number], ...path.arc([0, 0], 6, 270, 270 + 540, 36)];

export default scene({
  id: "midnight-donuts",
  title: "Midnight donuts",
  duration: 14,
  style: "night",
  set: "parking-lot",
  cast: [sports, kid],
  timeline: [
    at(0.4, sports.driveThrough(donut, { duration: 7, ease: "cruise" })).as("donut"),
    next(sports.hop({ height: 0.7, duration: 0.7 }), 0.2).as("hop"),
    next(sports.driveTo([70, -8], { duration: 5.6, ease: "depart" }), 0.3),

    at(2.2, kid.play("wave-both", { duration: 2.4 })),
    after("donut", kid.play("jump"), -0.6),
    after("hop", kid.say("SO COOL!", { duration: 1.6 })),
    after("hop", kid.play("cheer", { duration: 2.2 })),

    at(0, camera.follow(sports, "chase")),
    at(0.2, caption("Midnight donuts", { position: "top", size: "title", duration: 2.4 })),
    at(1.9, camera.orbit([0, 0.5, 0], { radius: 24, height: 9, fromDeg: 10, toDeg: 70, duration: 5.5 })),
    after("donut", camera.follow(kid, "close-front"), -0.8),
    after("hop", camera.shake({ intensity: 0.35, duration: 0.6 }), -0.4),
    after("hop", camera.follow(sports, "chase", { blend: 1.6 }), 1.2),
  ],
});

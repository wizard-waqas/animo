import { after, at, camera, caption, car, character, scene } from "../src/engine/dsl";

// Sara pulls up in her sedan, Mike waves, hops in the passenger side, and they drive off.
// Road runs along X. Cars heading +X use the lane at z = 1.8 (their passenger side faces the camera).

const sedan = car("sedan", "sedan", { at: [-34, 1.8], facing: 90 });
const sara = character("sara", "casual-girl", { at: [0, 0], seatedIn: { car: sedan, seat: "driver" } });
const mike = character("mike", "casual-guy", { at: [1.6, 5.4], facing: 200 });

export default scene({
  id: "pickup-friend",
  title: "Picking up Mike",
  duration: 14,
  set: "suburb",
  cast: [sedan, sara, mike],
  timeline: [
    at(0, camera.follow(sedan, "tracking")),
    at(0, sedan.driveTo([0, 1.8], { duration: 4.2, ease: "arrive" })),
    at(0.4, caption("Running late again...", { position: "top" })),

    at(3.4, mike.play("wave")),
    at(3.6, mike.say("Hey Sara!")),
    at(4.3, sara.play("wave", { duration: 1.6 })),
    at(3.2, camera.still([1.0, 2.0, 11], [0.6, 1.0, 3.0], { blend: 1.2 })),

    at(5.6, mike.enter(sedan, "passenger")).as("seated"),
    after("seated", sedan.driveTo([48, 1.8], { duration: 4.4, ease: "depart" }), 0.2),
    after("seated", camera.follow(sedan, "tracking", { blend: 1 })),
    after("seated", caption("Smooth ride.", { position: "top", size: "title" }), 0.8),
  ],
});

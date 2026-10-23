import { after, at, camera, car, character, next, prop, scene } from "../src/engine/dsl";

// Night, empty parking lot. Dev sits in his parked sedan filming on his phone. Arjun walks up, opens the
// passenger door and looks in. "What's 9 plus 10?" — "Twenty vun."
// The sedan faces +X, so its passenger side (+Z) faces the open front of the set where the cameras sit.

const sedan = car("sedan", "sedan", { at: [0, 0], facing: 90, color: "#4a6fa5" });
const dev = character("dev", "casual-guy", { at: [0, 0], seatedIn: { car: sedan, seat: "driver" } });
const arjun = character("arjun", "kid", {
  at: [-2.2, 3.8], facing: 140,
  colors: { skin: "#7b4a2b", hair: "#141414", shirt: "#3a86ff", pants: "#2b2d42", shoes: "#f4f1de" },
});
const parked1 = car("parked1", "suv", { at: [-7, -1.5], facing: 0, color: "#6c757d" });
const parked2 = car("parked2", "compact", { at: [8, -1.5], facing: 180, color: "#e9c46a" });

export default scene({
  id: "nine-plus-ten",
  title: "9 + 10",
  duration: 10,
  style: "night",
  set: "parking-lot",
  cast: [sedan, dev, arjun, parked1, parked2],
  props: [prop("lamp", [3, -4.5])],
  timeline: [
    at(0.2, dev.play("film", { duration: 9.8 })),

    at(0.3, arjun.walkTo(sedan.door("passenger"), { facing: 180, speed: 1.3 })).as("arrived"),
    after("arrived", sedan.openDoor("passenger")).as("door-open"),

    after("door-open", dev.say("What's 9 plus 10?"), 0.3).as("question"),
    after("question", arjun.feel("smug"), -0.2),
    after("question", arjun.say("[strong Indian accent] Twenty vun."), 0.35).as("answer"),
    after("answer", dev.feel("shocked"), -0.4),

    at(0, camera.still([3.5, 2.0, 8.5], [-0.6, 0.9, 1.6])),
    after("door-open", camera.still([1.3, 1.6, 3.9], [0.2, 1.05, -0.3]), -0.1),
    after("question", camera.still([0.2, 1.4, 0.35], [0.19, 0.9, 1.55])),
    after("answer", camera.still([1.3, 1.6, 3.9], [0.2, 1.05, -0.3]), 0.3),
  ],
});

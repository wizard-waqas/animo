import type { PropSpec, SetName } from "../engine/spec";

/**
 * Built-in sets. Shared layout facts:
 * - The road runs along X, centered on z = 0. Lanes: z = +1.8 (traffic heading +X), z = -1.8 (heading -X).
 * - Sidewalks: suburb |z| 3.6–6.1, city |z| 3.6–8.6. Parking lot asphalt: x -35..35, z -28..16.
 * - Suburb houses at z = -16 (x = 0, ±16, ±32, ±48) with driveways at z -6..-13 in front of x = 0, ±16, ±32.
 * - Highway: a forest highway. Eastbound (+X) lanes at z = 1.8 (fast/left) and z = 5.4 (right). Shoulders
 *   z -1.0…0 (left) and 7.2…9.4 (right). Guardrails at z = -1.3 and z = 10. Tall pines (7–10m) from z -3 to -12
 *   and from z 12 to 21 the whole way; the westbound road is hidden behind the left trees (z ≈ -19).
 *   Cameras must stay in the corridor (z -1…11) or go above the treetops (y > 11).
 * - The front of every set (z > 6) is kept clear so cameras can sit there.
 */

const house = (x: number, color: string): PropSpec => ({ type: "house", at: [x, -16], facing: 0, scale: 1, color });
const tree = (x: number, z: number, type: "tree" | "pine" | "bush" = "tree"): PropSpec => ({ type, at: [x, z], facing: 0, scale: 1 });
const building = (x: number, z: number, scale: number, color: string): PropSpec => ({ type: "building", at: [x, z], facing: 0, scale, color });

const HOUSE_COLORS = ["#f6bd60", "#84a59d", "#f28482", "#a2d2ff", "#cdb4db", "#ffd6a5"];

/** Built-in sets. The front of each set (z > 5) is kept clear so cameras can sit there. */
/** Rows of tall pines on both sides of the highway, deterministic "random" spacing so it looks natural. */
function forestHighway(): PropSpec[] {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const rows = [-3.4, -6.4, -9.6, -12.4, 12.8, 15.8, 19, 22];
  const trees: PropSpec[] = [];
  for (const z of rows) {
    for (let x = -260 + random() * 4; x < 330; x += 5.5 + random() * 3.5) {
      const isPine = random() < 0.8;
      trees.push({
        type: isPine ? "pine" : "tree",
        at: [x, z + (random() - 0.5) * 1.6],
        facing: random() * 360,
        scale: isPine ? 1.9 + random() * 0.8 : 1.5 + random() * 0.5,
        color: isPine ? ["#2e7d4f", "#2a6f47", "#33865a", "#276b43"][Math.floor(random() * 4)] : undefined,
      });
    }
  }
  return trees;
}

export const SET_PROPS: Record<SetName, PropSpec[]> = {
  suburb: [
    ...[-48, -32, -16, 0, 16, 32, 48].map((x, i) => house(x, HOUSE_COLORS[i % HOUSE_COLORS.length])),
    ...[-56, -40, -24, -8, 8, 24, 40, 56].map((x, i) => tree(x, -9 - (i % 2), i % 3 === 0 ? "pine" : "tree")),
    ...[-44, -20, 4, 28, 52].map((x) => tree(x, -6, "bush")),
    ...[-36, -4, 28].map((x): PropSpec => ({ type: "mailbox", at: [x, -5.4], facing: 0, scale: 1 })),
    ...[-60, -20, 20, 60].map((x): PropSpec => ({ type: "lamp", at: [x, 5.6], facing: 180, scale: 1 })),
  ],
  city: [
    ...[-45, -34, -23, -12, -1, 10, 21, 32, 43].map((x, i) => building(x, -14, 1 + (i % 3) * 0.45, ["#8ecae6", "#ffb703", "#e5989b", "#b5e48c", "#cdb4db"][i % 5])),
    ...[-40, -24, -8, 8, 24, 40].map((x): PropSpec => ({ type: "lamp", at: [x, -5], facing: 0, scale: 1 })),
    ...[-30, -14, 2, 18, 34].map((x) => tree(x, -8.5)),
  ],
  "parking-lot": [
    { type: "building", at: [0, -36], facing: 0, scale: 1.2, color: "#f4a261" },
    { type: "building", at: [-11, -36], facing: 0, scale: 0.9, color: "#e9c46a" },
    { type: "building", at: [11, -36], facing: 0, scale: 0.9, color: "#2a9d8f" },
    ...[-30, -10, 10, 30].map((x): PropSpec => ({ type: "lamp", at: [x, -7], facing: 0, scale: 1 })),
    ...[-42, 42].flatMap((x) => [tree(x, -20), tree(x, -2), tree(x, 12, "pine")]),
  ],
  highway: forestHighway(),
  empty: [],
};

/** Rough bounding cylinder of each prop (at scale 1), for camera-obstruction warnings. */
export const PROP_BOUNDS: Record<PropSpec["type"], { radius: number; height: number }> = {
  tree: { radius: 1.6, height: 4.4 },
  pine: { radius: 1.3, height: 4.0 },
  bush: { radius: 0.9, height: 1.0 },
  house: { radius: 4.2, height: 6.0 },
  garage: { radius: 3.0, height: 3.3 },
  building: { radius: 5.5, height: 10.5 },
  cone: { radius: 0.25, height: 0.75 },
  lamp: { radius: 0.3, height: 5.0 },
  bench: { radius: 0.9, height: 1.0 },
  mailbox: { radius: 0.3, height: 1.35 },
  chair: { radius: 0.35, height: 0.95 },
  table: { radius: 0.42, height: 0.74 },
  mug: { radius: 0.06, height: 0.13 },
  dashcam: { radius: 0.12, height: 0.21 },
  bump: { radius: 0.4, height: 0.13 },
  porch: { radius: 0.2, height: 2.7 },
  "traffic-light": { radius: 0.3, height: 6.2 },
};

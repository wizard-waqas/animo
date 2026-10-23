import { compileScene, evaluateScene, findJolts } from "../src/engine/compile";
import { findScene, parseArgs } from "./lib";

/**
 * Print a scene's resolved timeline, warnings, and where everyone is at key moments.
 * Usage: npm run inspect -- <scene-id> [--at 2,4.5,8]
 */
const { positional, flags } = parseArgs();
const spec = findScene(positional[0]);
const compiled = compileScene(spec);
const fmt = (n: number) => n.toFixed(2).padStart(6);
const degrees = (radians: number) => ((Math.round((radians * 180) / Math.PI) % 360) + 360) % 360;

console.log(`\n${spec.id} — ${spec.title ?? ""}  (${spec.duration}s @ ${spec.fps}fps, ${spec.format}, ${spec.set}, ${spec.style})\n`);
console.log("TIMELINE   start    end  actor        action");
for (const row of compiled.timeline) {
  console.log(`         ${fmt(row.start)} ${fmt(row.end)}  ${row.actor.padEnd(12)} ${row.label}`);
}

const times = typeof flags.at === "string"
  ? flags.at.split(",").map(Number)
  : Array.from({ length: 7 }, (_, i) => Math.round((spec.duration * i * 100) / 6) / 100);
console.log("\nSNAPSHOTS (x, z, facing°)");
for (const t of times) {
  const frame = evaluateScene(compiled, t);
  const parts = [
    ...Object.entries(frame.cars).map(([id, car]) => `${id} (${car.pos[0].toFixed(1)}, ${car.pos[1].toFixed(1)}, ${degrees(car.heading)}°) ${Math.abs(car.speed).toFixed(1)}m/s`),
    ...Object.entries(frame.characters).map(([id, person]) => `${id} (${person.pos[0].toFixed(1)}, ${person.pos[2].toFixed(1)}, ${degrees(person.facing)}°)${person.ridingIn ? ` in ${person.ridingIn}` : ""}`),
  ];
  const cam = frame.camera.position.map((n) => n.toFixed(1)).join(", ");
  console.log(`  t=${t.toFixed(2).padStart(5)}  ${parts.join("  |  ")}  |  camera (${cam})`);
}

const jolts = findJolts(compiled, spec.fps);
console.log(jolts.length ? `\nSMOOTHNESS\n${jolts.map((jolt) => `  ⚠ ${jolt}`).join("\n")}` : "\nSmoothness: no jolts.");

if (compiled.warnings.length) {
  console.log("\nWARNINGS");
  for (const warning of compiled.warnings) console.log(`  ⚠ ${warning}`);
} else {
  console.log("\nNo warnings.");
}
console.log("");

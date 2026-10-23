import { CARS, availableSeats } from "../src/catalog/cars";
import { CHARACTERS } from "../src/catalog/characters";
import { FOLLOW_PRESETS } from "../src/engine/cameraTrack";
import { EASE_NAMES } from "../src/engine/easing";
import { CLIPS } from "../src/engine/pose";
import { MOOD_NAMES } from "../src/engine/expression";
import { FORMATS, PROP_TYPES, SETS, SOUND_NAMES, STYLES } from "../src/engine/spec";

/** Print everything a scene can use. Usage: npm run catalog */
const section = (title: string) => console.log(`\n${title}\n${"-".repeat(title.length)}`);

section("CHARACTERS  character(id, model, { at, facing, colors?, seatedIn? })");
for (const [id, look] of Object.entries(CHARACTERS)) console.log(`  ${id.padEnd(16)} ${look.label}  (height ${look.height})`);

section("CARS  car(id, model, { at, facing, color?, label? })");
for (const [id, shape] of Object.entries(CARS)) {
  console.log(`  ${id.padEnd(10)} ${shape.label.padEnd(36)} ${shape.length}m long, ${shape.width}m wide  seats: ${availableSeats(shape).join(", ")}`);
}

section("CLIPS  person.play(clip, { duration? })   gesture = upper body only (layers on walking/sitting)");
for (const [id, clip] of Object.entries(CLIPS)) console.log(`  ${id.padEnd(13)} ${clip.layer.padEnd(8)} ${String(clip.defaultDuration).padEnd(4)}s  ${clip.description}`);

section("CAMERA FOLLOW PRESETS  camera.follow(target, preset)");
for (const [id, preset] of Object.entries(FOLLOW_PRESETS)) console.log(`  ${id.padEnd(12)} ${preset.local ? "local" : "world"}  ${preset.description}`);

section("OTHER");
console.log(`  moods:   ${MOOD_NAMES.join(", ")}   (person.feel(mood))`);
console.log(`  sounds:  ${SOUND_NAMES.join(", ")}   (sound(name) — most sounds are automatic)`);
console.log(`  eases:   ${EASE_NAMES.join(", ")}`);
console.log(`  sets:    ${SETS.join(", ")}`);
console.log(`  styles:  ${STYLES.join(", ")}`);
console.log(`  formats: ${FORMATS.join(", ")}`);
console.log(`  props:   ${PROP_TYPES.join(", ")}`);
console.log("");

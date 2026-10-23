# Animo — notes for Claude

Cartoony 3D clips (people + cars, under 30s) written as code. The user describes a clip; Claude writes
the scene, checks it, and renders it. The user never animates by hand.

Stack: Remotion (video) + React Three Fiber (3D) + TypeScript + Zod. All characters, cars and sets are
procedural (built from primitives in code) — no model files, nothing to download.

## The loop (always follow it)

1. `npm run catalog` — what exists (characters, cars, clips, camera presets, sets, styles).
2. Write `scenes/<id>.scene.ts`, register it in `scenes/index.ts`.
3. `npm run inspect -- <id>` — resolved timeline, positions, **warnings** and **smoothness** report.
   Fix every warning before rendering. It catches: walking through cars, cars overlapping, cars moving while
   someone gets in, props blocking the camera, cars stopping dead/starting instantly, actions running past
   the end, camera lurches and motion hitches.
4. `npm run stills -- <id>` — contact sheet at `out/<id>/sheet.png` (debug tags: names, coords, time, grid).
   **Look at it** (Read the PNG). Check framing, who's visible, faces toward camera, overlaps.
   `--at 2,4.5,8` for specific moments, `--clean` for no debug overlay.
5. `npm run sound -- <id> --spectrogram` — builds the soundtrack and prints every sound event (footsteps, honks,
   crash, doors, squeal spans, peak level). The spectrogram PNG (`out/<id>/sound.png`) is how to "listen": check
   events line up and nothing turns into broadband noise. render/stills/studio regenerate sound automatically.
6. `npm run voices -- <id>` — records realistic voices for new `say()` lines (needs `ELEVENLABS_API_KEY` or
   `GOOGLE_TTS_API_KEY`), saved in `voices/` + `voices/manifest.ts`. **Commit them** — re-renders never pay twice.
   After recording, re-run inspect: line lengths now come from the recordings and cue timings shift.
7. `npm run render -- <id> --preview` (30fps, half size) → then `npm run render -- <id>` for the final.
   `--scale 0.75` (810×1440) is a good phone-sized final. The scale must give whole pixels.
8. `npm run check` (typecheck + tests) after engine changes.

## World conventions

- Y is up. Ground positions are `[x, z]`. Camera positions are `[x, y, z]`.
- Headings/facing in **degrees**: `0` = facing +Z (toward the default camera), `90` = +X (screen right),
  `180` = away from camera, `270` = screen left.
- Car local space: forward +Z, the car's **left (driver side, US) is +X**. A car facing 90° has its driver
  side toward -Z (away from a camera at +Z) and its passenger side toward the camera.
- Sets (`src/catalog/sets.ts` has exact layouts): road along X centered on z=0. Lanes: z=+1.8 heading +X,
  z=-1.8 heading -X. Suburb houses at z=-16, driveways at x=0, ±16, ±32. Parking lot asphalt x -35..35, z -28..16.
  The front (z > 6) is kept clear for cameras.
- Highway set (forest highway): eastbound lanes z=1.8 (fast) and z=5.4, shoulders z≈-0.6 and 8.3, guardrails
  z=-1.3 and 10, walls of 7–10m pines beyond both. Cameras must stay in the corridor (z -1…11) or above y≈11.
- Sizes: people ~1.6–1.8m (kid ~1.1m). Sedan 4.4×1.9m. Walk 1.55 m/s, run 3.4 m/s. Default drive speed 8 m/s.

## Writing scenes (`src/engine/dsl.ts`)

```ts
const sedan = car("sedan", "sedan", { at: [-34, 1.8], facing: 90, color: "#e63946", label: "OPTIONAL TEXT" });
const mike  = character("mike", "casual-guy", { at: [1.6, 5.4], facing: 200 });
const sara  = character("sara", "casual-girl", { at: [0, 0], seatedIn: { car: sedan, seat: "driver" } });

export default scene({
  id: "my-clip", duration: 14, format: "vertical", style: "sunny", set: "suburb", props: [],
  cast: [sedan, sara, mike],
  timeline: [
    at(0, sedan.driveTo([0, 1.8], { duration: 4, ease: "arrive" })),
    after(sedan, mike.enter(sedan, "passenger")).as("seated"),   // waits for the car to stop
    after("seated", sedan.driveTo([40, 1.8], { duration: 4, ease: "depart" }), 0.3),
    at(0, camera.follow(sedan, "tracking")),
    after("seated", camera.follow(sedan, "chase", { blend: 1.5 })),
  ],
});
```

Timing:
- `at(t, action)` — absolute seconds.
- `next(action, delay?)` — after the same actor's previous action.
- `after(actorOrCue, action, delay?)` — after another actor's latest-listed action, or a named cue. Delay can be negative (overlap).
- `.as("cue")` on any entry names it. Prefer cues over hand-computed times — durations (walks, enter/exit) are computed.
- Each actor's own actions must be listed in time order. Cars/people are planned in listed order; **camera and
  captions are planned last**, so they can wait on any cue. If you list an action after something that already used
  that actor's position, compile fails with "Move it earlier in the timeline".

People: `walkTo(target, {facing?})`, `runTo`, `turnTo(target|deg)`, `face(other)`, `play(clip)`, `say(text)`,
`enter(car, seat)` (auto-walks to the door, routes around cars), `exit()`, `spot("front"|"behind"|"left"|"right", dist)`.
Gesture clips layer on top of walking/sitting (wave while walking, wave from a car). Body clips need the person standing.
Walks automatically route around parked cars.

Cars: `driveTo(target, {duration|speed, ease, facing, reverse})`, `driveThrough(points, …)` (smooth curve),
`hop({height})`, `openDoor/closeDoor(seat)`, `door(seat)` (anchor where a person stands), `spot(...)`,
`honk({times, duration, word})`, `crashInto(carOrPoint, {brake, impactSpeed})`, `dashcam: true` on the car.
- **Speed-continuous driving** (highways, passing, brake checks): `driveTo(x, {fromSpeed: 22, endSpeed: 31})` —
  constant acceleration between the two speeds, duration computed. `fromSpeed` defaults to the current speed,
  so chained drives never stop in between. Use `fromSpeed` on the first drive to start the scene moving.
  A long cruise (`driveTo([600, z], {fromSpeed: 22, endSpeed: 22})`) gets cut cleanly by a later drive/crash.
- **Crashes**: `crashInto` continues from the current speed (braking at `brake` m/s² if given) and simulates
  forward to the exact contact moment — the target may be moving/braking. Then: striker bounces back, victim is
  shoved (and slightly spun) by the closing speed, impact burst + debris (stays on the road) + smoke,
  "CRASH!" word, camera shake, crash sound. Camera smoothing never looks across an impact, so hits land hard.
`path.arc(center, radius, fromDeg, toDeg, steps)` gives points for donuts/U-turns.
Eases: `cruise` (start+stop, default), `arrive` (enter moving, brake to stop), `depart` (start from stop, leave moving),
`smooth`, `linear`, `in`, `out`. A car entering the frame should use `arrive`; leaving the frame, `depart` with the drive
ending at/after the scene end.

Camera: `camera.follow(target, preset, {blend, offset, local, smooth})`, `camera.still(pos, lookAt, {blend})`
(lookAt can be an actor — it pans to track it), `camera.orbit(target, {radius, height, fromDeg, toDeg, duration})`,
`camera.moveTo(pos, lookAt, {duration, ease})`, `camera.shake({intensity, duration})`.
Follow cameras use look-ahead smoothing (no lag). Hard cuts are fine and often better than long whips;
the smoothness check flags blends that move the camera too far too fast.

Overlays: `caption(text, {position: top|center|bottom, size: title|normal, duration})`, speech bubbles via `say`
(use `\n` for line breaks). Bubbles turn red/shaking when the speaker is angry, wobbly when scared.

Voices (`src/voice/`, `scripts/voices.ts`): each `say()` line is recorded once by a realistic AI voice and keyed
by hash(voice, mood, text) — changing any of those records a new take. The mood at the line's start sets the
delivery (ElevenLabs v3 tags: angry → [angry]/[shouting], scared → [nervous] [scared], smug → [confident]…);
put tags in the text yourself for more direction: `say("[whispers] don't look now")` (tags never show in bubbles).
Don't pass `duration` to `say()` — let the recording set it. Mouths lip-sync to the recording's loudness.
Default voices per character model are in `src/voice/voices.ts`; override with `character(..., { voice: "<id>" })`.
`npm run voices -- --list` shows the account's voices. Switching provider → `--force` to re-record.

Police & drama: `police` car model (black & white, light bar) — `siren(true)` lights + wail, `siren(true, {sound:false})`
lights only. Officers: `officer`, `officer-woman`. `cop.tase(person)` → wires + crackle + zap sound, target goes rigid
and falls flat (held pose — next body action blends out; use `play("get-up")`). `person.yankDashcam(car)` runs to the
driver door, opens it, leans in yanking; the dashcam rattles. `camera.replay(car, {from, to})` cuts to that car's
dashcam footage of an earlier moment (REC overlay, original audio through a "small screen" filter); add a camera
shot right after it. Clips that `holds` (tased) keep their end pose until the next body action.
Only body actions (walk, body clips, enter/exit, drives…) need to be listed in time order per actor; say/feel/
gestures/honk/siren/door can be listed anywhere.

Faces: `person.feel(mood)` — neutral, happy, angry (V brows, red flush, shouting mouth), scared (wide eyes,
sweat drop, trembling), shocked, smug, sad, pain (wince), dazed (eyes shut). Blends over 0.25s. Pair with clips: `yell`, `hold-neck`, `shove`, `cuffed`,
`hands-up` (gestures), `cower`, `stagger`, `reach-in`, `tased`, `get-up` (body), `arms-crossed`, `point`, `facepalm`…

Sound (all generated, `src/audio/`): footsteps on every foot plant (heavier when running), engine pitch/volume from
speed (idle if someone's inside), tire rumble, squeal on hard braking (> ~4.5 m/s²), door open/slam on enter/exit,
boing + thud for hops, thuds for jump/fall clips, claps, honks, crashes, plus ambience (birds / city hum / highway
roar / night crickets). Panned and attenuated relative to the camera. `sound(name, {at, volume})` drops a one-off
(crash, honk, boing, thud, whoosh, door-slam, pop, screech). Scene option `sound: { enabled, ambience, volume }`.

## Framing tips (learned the hard way)

- Vertical (default, 1080×1920) frames are narrow: ~37° horizontal. To fit a 12m-wide area you need ~25m distance.
- Keep the speaker visible when they `say` something. Close-ups: `follow(person, "close")` (3/4) or `"close-front"`.
- Don't put the camera where a set prop is (inspect warns). Mailboxes/lamps in the foreground look bad even when not "blocking".
- Avoid two people lined up from the camera's view (one hides the other) — shoot from the side.
- Chase cams whip around during tight turns — cut to a wide/orbit shot before donuts or U-turns.

## Code map

- `src/engine/` pure, deterministic logic (no React): `spec.ts` (Zod schema), `dsl.ts`, `compile.ts` (timeline → tracks,
  warnings, jolt check), `carTrack.ts` (paths, wheel spin, steering, suspension springs, hops, doors),
  `characterTrack.ts` (walk/turn/clips/enter/exit/ride), `pose.ts` (rig pose, gait, clip library),
  `cameraTrack.ts` (shots, blends, smoothing), `route.ts` (walk-around-cars pathfinding), `path.ts`, `easing.ts`.
- `src/catalog/` characters, cars (seat/door layout), sets (+ prop bounds).
- `src/render/` R3F components: `SceneVideo.tsx` (composition), `CharacterModel.tsx`, `CarModel.tsx`, `World.tsx`,
  `Props.tsx`, `Overlays.tsx`, `toon.tsx` (toon shading + outlines + geometry cache), `styles.ts`.
- `scripts/` CLI: `inspect`, `stills`, `render`, `catalog`. `tests/` vitest.

Everything is a pure function of time — frames render in parallel and identically every time. Never use
`Math.random()` or wall-clock time in the engine or models; use `wobble(t, seed)` from `math.ts`.

Adding things:
- New clip: add to `CLIPS` in `pose.ts` (pose function of time; gestures only touch upper-body keys).
- New character: add to `CHARACTERS` (all share one rig).
- New car: add to `CARS` (seats/doors derive from the shape).
- New prop: `PROP_TYPES` in `spec.ts`, render in `Props.tsx`, bounds in `sets.ts`.
- New sound: recipe in `src/audio/sounds.ts` (pure function → mono buffer), trigger it in `soundtrack.ts`.
  Oscillators with changing pitch must accumulate phase (see `Squeal`) — `sin(f(t)·t)` smears into noise.
- New mood: add to `MOODS` in `expression.ts`.

Gotcha: never build one giant mesh hundreds of meters long (rails, curbs) — it rendered a line across faces.
Use `LongBox` in `World.tsx` (40m sections).

Gotcha: never export a function named `then` from a module — the module becomes a "thenable" and `await import()` hangs.
That's why the sequencing helper is `next`.

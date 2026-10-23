# Animo — notes for Claude

Cartoony 3D clips of people and cars (usually under 30s, max 60s) written as code. The user describes a clip in
plain words; Claude writes the scene, checks it, renders it and sends the video. The user never animates by hand.

Stack: Remotion (video) + React Three Fiber (3D) + TypeScript + Zod. Everything is procedural — characters, cars,
sets, sound effects — built in code. No model or audio asset files. Only voices come from an API (cached in `voices/`).

## Working with the user

- They often follow along on their phone: send finished videos with SendUserFile; keep replies short.
- Describe the clip back in story terms ("she snaps and goes for the dashcam"), not code terms.
- If a request would push past ~30s, say so and suggest what to trim — but keep story beats they asked for.
- Never mock missing pieces (no fake voices). Say what's missing and what it takes.

## The loop (always follow it)

1. `npm run catalog` — what exists (characters, cars, clips, moods, sounds, camera presets, sets, styles).
2. Write `scenes/<id>.scene.ts` with `export default scene({ id: "<id>", … })`. The filename is the registration:
   there is no list to add it to.
3. `npm run preflight -- <id> --at 2,4.5,8` — one command, one pass: resolved timeline, positions, **warnings** and
   **smoothness**; every sound event + `out/<id>/sound.png`; contact sheet `out/<id>/sheet.png` with debug tags
   (`--clean` for none). Exits 1 while anything needs fixing. Fix every warning before rendering. It catches:
   walking through cars, cars overlapping, cars moving while someone gets in, props blocking the camera, cars
   stopping dead/starting instantly, actions running past the end, camera lurches, hitches.
   Preflight can't judge framing — **read the sheet PNG.** Check: is the subject in frame, is the speaker visible when
   they talk, is anyone hidden behind someone/something, does the camera pass through objects. The spectrogram is how
   to "listen": events line up, no unintended broadband noise or sustained tones.
   (`inspect`, `stills`, `sound` still exist for one piece at a time.)
4. `npm run voices -- <id>` — records `say()` lines with a realistic AI voice (render does this automatically).
   After recording, re-run preflight: line lengths come from the recordings, so cue timings shift. Unrecorded lines
   are listed as a to-do, not counted as a problem.
5. `npm run render -- <id> --preview` (30fps, half size, no shadows) → `npm run render -- <id>` final.
   `--scale 0.75` (810×1440) is a good phone-sized final; the scale must give whole pixels.
   `--from`/`--to` (seconds or a cue name) render one slice of a long clip.
6. `npm run check` (typecheck + tests) after engine changes. Commit and push.

Rendering speed: the cloud container has no GPU (software WebGL, 4 cores). The render bundle is cached in
`out/.bundle/` and only rebuilds when `src/` changes; scenes and recordings travel as inputProps, so a scene edit
costs nothing. Every command opens one browser. Soundtracks are cached by content. What still costs: pixels. On
software WebGL the shadow pass is bigger than the frame itself, so previews skip it; more browser tabs don't help
(SwiftShader already uses every core). Measured on `pickup-friend` (14 s, 420 preview frames): preview render
108 s → 46 s; three stills 8.8 s → 1.8–4 s. Scenes default to 30fps (what phones play); ask for `fps: 60` only when a
clip needs it. Iterate with preflight; render once. The user can render locally much faster.

## World conventions

- Y is up. Ground positions are `[x, z]`. Camera positions are `[x, y, z]`.
- Facing in **degrees**: `0` = +Z (toward the default camera), `90` = +X (screen right), `180` = away, `270` = left.
- Car local space: forward +Z, the car's **left (driver side, US) is +X**. A car facing 90° has its driver side
  toward -Z and its passenger side toward +Z.
- Sizes: people ~1.6–1.8m (kid ~1.1m). Sedan 4.4×1.9m. Walk 1.55 m/s, run 3.4 m/s. Default drive speed 8 m/s.
- Sets (exact layouts in `src/catalog/sets.ts`):
  - suburb / city: road along X centered on z=0. Lanes z=+1.8 (heading +X), z=-1.8 (heading -X). Suburb houses at
    z=-16, driveways at x=0, ±16, ±32. The front (z > 6) is clear for cameras.
  - highway (forest highway): eastbound lanes z=1.8 (fast) and z=5.4, shoulders z≈-0.6 and 8.3, guardrails z=-1.3
    and 10, walls of 7–10m pines beyond. Cameras stay in the corridor (z -1…11) or above y≈11.
  - parking-lot: asphalt x -35..35, z -28..16. empty: just ground.

## Writing scenes (`src/engine/dsl.ts`)

```ts
const sedan = car("sedan", "sedan", { at: [-34, 1.8], facing: 90, color: "#e63946", dashcam: true });
const mike  = character("mike", "casual-guy", { at: [1.6, 5.4], facing: 200 });
const sara  = character("sara", "casual-girl", { at: [0, 0], seatedIn: { car: sedan, seat: "driver" } });

export default scene({
  id: "my-clip", duration: 14, format: "vertical", style: "sunny", set: "suburb",
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

### Timing

- `at(t, action)` absolute seconds · `next(action, delay?)` after the same actor's previous action ·
  `after(actorOrCue, action, delay?)` after another actor's latest-listed action or a named cue (delay may be negative).
- `.as("cue")` names any entry. **Prefer cues over hand-computed times** — walks, enter/exit and voice lines have
  computed durations.
- Cars and people are planned in listed order; **camera, captions and sound cues are planned last**, so they can
  wait on any cue.
- Per actor, **body actions** (walks, body clips, enter/exit, drives, crashes, tase, yank) must be listed in time
  order. Layered actions (say, feel, gesture clips, honk, siren, door) can be listed anywhere.
- If an action is listed after something that already depended on that actor's position, compile fails with
  "Move it earlier in the timeline".

### People

`walkTo(target, {facing?, speed?})`, `runTo`, `turnTo(target|deg)`, `face(other)`, `play(clip)`, `say(text)`,
`feel(mood)`, `enter(car, seat)` (walks to the door first), `exit()`, `spot("front"|"behind"|"left"|"right", dist)`,
`tase(person)`, `yankDashcam(car)`.
- Walks route around parked cars on smooth curves.
- Gesture clips layer on top of walking/sitting (wave while walking, wave from a car). Body clips need the person standing.
- Holding clips (`tased`) keep their end pose until the next body action, which blends out of it (`play("get-up")`).
- Moods: neutral, happy, angry (V brows, red flush, shouting), scared (wide eyes, sweat, trembling), shocked, smug,
  sad, pain (wince), dazed (eyes shut). Blend over 0.25s. Bubbles go red/shaky when angry, wobbly when scared.
- Gestures: wave, wave-both, point, cheer, clap, nod, shake-head, shrug, think, facepalm, look-around, phone-call,
  yell, arms-crossed, hold-neck, shove, cuffed, hands-up. Body: jump, dance, sit-ground, fall-over, cower, stagger,
  reach-in, tased, get-up. (`npm run catalog` is the source of truth.)

### Cars

`driveTo(target, {duration|speed, ease, facing, reverse, fromSpeed, endSpeed})`, `driveThrough(points, …)`,
`hop({height})`, `honk({times, duration, word})`, `crashInto(carOrPoint, {brake, impactSpeed})`, `siren(on, {sound})`,
`openDoor/closeDoor(seat)`, `door(seat)` (where a person stands), `spot(...)`. Car option `dashcam: true`.
- **Speed-continuous driving** (highways, passing, brake checks): `{fromSpeed, endSpeed}` gives constant
  acceleration between them; `fromSpeed` defaults to the current speed, so chained drives never stop in between.
  A long cruise (`driveTo([600, z], {fromSpeed: 22, endSpeed: 22})`) is cut cleanly by a later drive or crash.
  A parked car can "enter" at speed with an explicit `fromSpeed` (start it out of shot).
- **Eases** (when not using speeds): `cruise` (start + stop, default), `arrive` (enter moving, brake to stop),
  `depart` (start from stop, leave moving — end it at/after the scene end), `smooth`, `linear`, `in`, `out`.
- **Crashes**: `crashInto` keeps the current speed (braking at `brake` m/s²) and simulates to the exact contact
  moment — the target may be moving. Then: striker bounces back, victim is shoved and spun, burst + debris + smoke,
  "CRASH!", camera shake, crash sound.
- `police` model: light bar + siren. `siren(true)` lights + wail, `siren(true, { sound: false })` lights only.
- `path.arc(center, radius, fromDeg, toDeg, steps)` gives points for donuts / U-turns.

### Camera

`camera.follow(target, preset, {blend, offset, local, smooth})`, `camera.still(pos, lookAt, {blend})` (lookAt can be
an actor — it pans with it), `camera.orbit(...)`, `camera.moveTo(...)`, `camera.shake(...)`,
`camera.replay(car, {from, to})` (that car's dashcam footage of an earlier moment, REC overlay, original audio through
a small-screen filter — put a shot right after it).
- Follow cameras use look-ahead smoothing; smoothing never crosses an impact, so hits land hard.
- Prefer hard cuts over long blends; a blend can also fly the camera through objects. Inspect flags lurches.

### Overlays & sound

- `caption(text, {position, size, duration})`; `say()` bubbles (`\n` for line breaks).
- Sound is generated from the animation (`src/audio/`): footsteps on each foot plant, engine pitch from speed (idle
  when occupied), tire rumble, squeal on hard braking, doors, hops, honks, crashes, siren, taser, dashcam rattle,
  ambience per set. Panned and attenuated relative to the camera. `sound(name, {at, volume})` adds a one-off.
  Scene option `sound: { enabled, ambience, voices, volume }`.

### Voices

- `say()` lines are recorded once (ElevenLabs preferred, Google Chirp 3 HD fallback) and keyed by
  hash(voice, mood, text): changing any of them records a new take. Recordings go in `voices/` + `voices/manifest.ts`
  — **commit them** so re-renders are free and offline.
- Keys: `ELEVENLABS_API_KEY` / `GOOGLE_TTS_API_KEY` from the shell or `.env.local` (git-ignored — never commit keys,
  never print them). `ANIMO_VOICE_PROVIDER` picks when both exist.
- Mood at the line's start sets the delivery (v3 tags: angry → [angry]/[shouting], scared → [nervous]…). Direct further
  with tags in the text: `say("[whispers] don't look now")` — tags never show in bubbles.
- Don't pass `duration` to `say()`; the recording sets it. Mouths lip-sync to the recording's loudness.
- Default voices per character model: `src/voice/voices.ts` (ElevenLabs ids are from the public premade list,
  unverified on the user's account — check with `npm run voices -- --list`). Override per character with `voice`.
- Lines record `ANIMO_VOICE_CONCURRENCY` at a time (default 2; ElevenLabs free/starter allow 2–3, Creator/Pro more).
- In the cloud container ElevenLabs is blocked by the network policy unless the user allows `api.elevenlabs.io` in
  the environment's network settings; otherwise the user records voices locally and commits `voices/`.

## Framing tips (learned the hard way)

- Vertical (1080×1920) frames are narrow: ~37° horizontal. Fitting a 12m-wide area needs ~25m distance.
- Keep the speaker in frame when they talk; for a reply, an over-the-shoulder shot keeps both lines on screen
  (off-screen speakers get their bubble pinned to the frame edge).
- Avoid two people lined up from the camera (one hides the other) — shoot from the side.
- Mailboxes/lamps/trees right in front of the lens look bad even when inspect doesn't call them "blocking".
- Chase cams whip around in tight turns — cut to a wide/orbit shot before donuts or U-turns.
- Interior / dashcam shots: the filming car's cabin is hidden automatically during `camera.replay`.

## Code map

- `src/engine/` pure, deterministic logic (no React):
  `spec.ts` (Zod schema), `dsl.ts` (scene helpers), `compile.ts` (timeline → tracks, crashes, warnings, jolt check,
  replay-aware frame evaluation), `carTrack.ts` (paths, speed ramps, wheels, steering, suspension, hops, doors,
  impacts, siren, dashcam tug), `characterTrack.ts` (walk/turn/clips/enter/exit/ride, held poses, speech, moods),
  `pose.ts` (rig, gait, clip library), `expression.ts` (moods → face), `cameraTrack.ts` (shots, blends, smoothing,
  replay), `route.ts` (walk-around-cars pathfinding), `path.ts`, `easing.ts`, `math.ts`.
- `src/catalog/` characters, cars (seat/door layout), sets (+ prop bounds for camera checks).
- `src/render/` R3F: `SceneVideo.tsx` (composition + audio), `CharacterModel.tsx` (rig + face), `CarModel.tsx`,
  `World.tsx` (sky, lights, sets), `Forest.tsx` (instanced trees), `Props.tsx`, `CrashEffect.tsx`, `ZapEffect.tsx`,
  `Overlays.tsx` (captions, bubbles, comic words, dashcam overlay, debug HUD), `toon.tsx` (toon shading, outlines,
  geometry cache), `styles.ts`, `metadata.ts` (size/fps per scene). `SceneVideo` takes the scene + its voice clips as
  props. Entry points: `src/index.ts` → `Root.tsx` (Studio, one composition per `scenes/*.scene.ts` via
  `require.context`) and `src/entry.render.tsx` (CLI: one composition fed by inputProps, imports no scenes).
- `src/audio/` `dsp.ts` (noise, filters, mix bus, WAV), `sounds.ts` (one-shot recipes), `soundtrack.ts` (derives
  every sound from the compiled scene). `src/voice/` line keys, delivery tags, default voices.
- `scripts/` CLI: `catalog`, `preflight` (= inspect + sound + stills), `inspect`, `stills`, `sound`, `voices`,
  `render`. `lib.ts` is the shared plumbing: `.env.local`, scene discovery (`findScene`/`loadScenes`), the bundle
  cache (`bundleOnce`, keyed by a hash of `src/`), `withBrowser`, `ensureSound` (cached by content), `inputPropsFor`.
  `tests/` vitest. `voices/` recorded lines + manifest.

Everything is a pure function of time — frames render in parallel and identically every time. Never use
`Math.random()` or wall-clock time in the engine, models or audio; use seeded helpers (`wobble`, `Rng`).

### Adding things

- Clip: `CLIPS` in `pose.ts` (pose as a function of time; gestures only touch upper-body keys; `holds` for end poses).
- Mood: `MOODS` in `expression.ts` (+ delivery tag in `voice/lines.ts`, speaking rate in `scripts/voices.ts`).
- Character: `CHARACTERS` (all share one rig) + default voices in `voice/voices.ts` (the types force both).
- Car: `CARS` (seats/doors derive from the shape).
- Prop: `PROP_TYPES` in `spec.ts`, render in `Props.tsx`, bounds in `sets.ts`. Trees by the hundred → `Forest.tsx`.
- Sound: recipe in `src/audio/sounds.ts`, trigger in `soundtrack.ts`.

### Gotchas

- Oscillators with changing pitch must accumulate phase (`Squeal`, `Siren`) — `sin(f(t)·t)` smears into noise.
- Crash/impact sounds: noise-based only — sustained sine partials read as a bell.
- Never build one mesh hundreds of meters long (rails, curbs) — it drew a line across faces. Use `LongBox` (40m sections).
- Never export a function named `then` — the module becomes a thenable and `await import()` hangs (hence `next`).
- Instanced meshes need correct bounds (`computeBoundingSphere()` after setting matrices, see `Forest.tsx`) or
  `frustumCulled={false}`; with bounds, a row of trees behind the camera costs nothing.
- The render bundle must not import scenes or `voices/manifest.ts` (that is what keeps the cache valid). Scene data
  and clips go through inputProps; `src/voice/lines.ts` holds a registry the CLI/Studio fill from the manifest.

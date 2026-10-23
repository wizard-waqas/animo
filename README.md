# Animo

**Animation software that an AI drives.** Animo makes short, cartoony 3D clips of people and cars, from a
couple of seconds up to about a minute. You describe a clip in plain words, Claude writes it as a scene file,
checks its own work and renders the video.

You never touch a timeline, keyframe or 3D model. Everything is code:

- **Characters, cars and locations are built in code** (no model files to download or license): 10 people
  types, 8 car types (including a police cruiser), and suburb, city, forest highway and parking lot sets.
- **Motion is described, not keyframed.** A scene says "the car brakes hard", "she runs to his door", "the cop
  tases her". The engine works out the smooth motion: wheels that spin with distance, steering and body roll,
  suspension bounce, feet that plant without sliding, people walking around parked cars, real crash physics.
- **Sound is generated from the animation**, so it always lines up: footsteps on every step, engines that rise
  with speed, brake squeal, doors, honks, crashes, sirens, background ambience. Dialogue uses realistic AI voices.
- **Built for an AI to check its own work.** Animo reports problems before anything renders (people walking
  through cars, the camera blocked by a tree, jerky motion, timing mistakes) and makes contact sheets of frames
  and pictures of the soundtrack, so Claude can see and "hear" a clip before you do.

Built on [Remotion](https://www.remotion.dev) (React → video) and [React Three Fiber](https://r3f.docs.pmnd.rs)
(3D), in TypeScript.

## Two ways to run it

### 1. Claude renders it in the cloud (easiest, slower)

Ask Claude (Claude Code on the web or the Claude app) for a clip in a session with this repo attached. Claude
writes the scene, checks it, renders it and sends you the MP4. You can do the whole thing from your phone.

- **Slower:** the cloud machine has no graphics card, so every frame is drawn on the CPU. A 15s clip takes
  minutes; a 60s clip at 60fps took about 50 minutes. Claude checks everything with quick still frames first and
  does the slow full render once, at the end.
- **Voices:** the cloud environment's network blocks the voice service. Voices recorded on your machine and
  committed to `voices/` are reused in the cloud for free. New lines need either a local run, or
  `api.elevenlabs.io` allowed in the cloud environment's network settings plus `ELEVENLABS_API_KEY` set there.

### 2. You render it on your own computer (faster)

Pull the repo and run one command. With a graphics card, renders are many times faster than the cloud.
New voice lines are recorded automatically, using the key in your `.env.local`.

```bash
git pull
npm run render -- brake-check
```

The video lands in `out/brake-check/brake-check.mp4`.

A good split: Claude writes and checks scenes in the cloud and pushes them; you pull and render the final version
locally.

## First-time setup on your machine

1. **Install Node.js** 20.12 or newer. The LTS version from [nodejs.org](https://nodejs.org) is fine. Check with:
   ```bash
   node -v
   ```
2. **Get the project**:
   ```bash
   git clone https://github.com/wizard-waqas/animo.git
   cd animo
   ```
3. **Install packages** (about a minute):
   ```bash
   npm install
   ```
4. **Add a voice key** (optional, for spoken dialogue). Create a file named `.env.local` in the `animo` folder
   with one line:
   ```
   ELEVENLABS_API_KEY=your_key_here
   ```
   ElevenLabs (recommended, best acting) works on any paid plan. Google Cloud Text-to-Speech also works: use
   `GOOGLE_TTS_API_KEY=...` instead. `.env.local` is git-ignored, so the key never gets committed. Without a key,
   clips render with speech bubbles but no voices.
5. **Try it**:
   ```bash
   npm run render -- pickup-friend --preview
   ```
   On a Mac with Google Chrome installed, it renders with that. Otherwise the first render downloads a headless
   Chrome (about 170MB) automatically. The video lands in
   `out/pickup-friend/preview.mp4`.

To preview in the browser instead and scrub through clips, run `npm run studio`.

## Rendering

```bash
npm run render -- <scene>                    # final: 30fps, full size (1080×1920 vertical)
npm run render -- <scene> --preview          # quick check: 30fps, half size
npm run render -- <scene> --scale 0.75       # phone-sized final (810×1440), same fps
npm run render -- <scene> --from 20 --to 35  # just a slice (seconds or a cue name from the scene)
```

Render prints frames done, speed and time left every few seconds. Each render first records any new voice
lines, then builds the soundtrack.

**On a Mac, Animo renders with your installed Google Chrome** (`/Applications/Google Chrome.app`) when it's
there. Remotion's own downloaded Chrome crashes with "browser has disconnected" on Apple Silicon. No Chrome
installed? Install it, or point `TOON_BROWSER` at another Chrome/Chromium (in `.env.local` or before the command).
If the browser still crashes, Animo retries once with software graphics (works, but slower). To pick the graphics
mode yourself, set `TOON_GL=angle` (GPU) or `TOON_GL=swangle` (software).

**Long clips: render one part at a time.** `--from` and `--to` take seconds or a cue name (the names in
`.as("...")` in the scene file; `npm run inspect -- <scene>` lists them as `#name`). A cue name keeps the cut in
the right place even after voice recordings change the timing. For `brake-check` (58s), split where the police
pull up:

```bash
npm run render -- brake-check --to police-stop     # part 1: brake check, crash, argument, dashcam grab
npm run render -- brake-check --from police-stop   # part 2: police, taser, dashcam replay, arrest
```

Each part is saved under its time range, e.g. `out/brake-check/brake-check-0.0-31.8s.mp4`.

**Voice errors** are explained in plain words (bad key, out of credits, unknown voice, can't connect), and the
video still renders, just without the lines that failed.

## Commands

| Command | What it does |
|---|---|
| `npm run studio` | Live preview in the browser |
| `npm run catalog` | Lists every character, car, animation, mood, sound, camera preset, set and style |
| `npm run preflight -- <scene>` | Everything to check before rendering in one pass: timeline + warnings + smoothness, soundtrack + spectrogram, contact sheet |
| `npm run inspect -- <scene>` | Timeline, positions, problem warnings and smoothness check (no rendering) |
| `npm run stills -- <scene>` | Contact sheet of frames → `out/<scene>/sheet.png` |
| `npm run voices -- <scene>` | Records the dialogue with an AI voice (needs a key) |
| `npm run sound -- <scene>` | Builds the soundtrack; `--spectrogram` draws it → `out/<scene>/sound.png` |
| `npm run render -- <scene>` | Renders the MP4 with sound |
| `npm run check` | Typecheck + unit tests |

## Scenes included

- `pickup-friend`: Sara pulls up, Mike waves, gets in, and they drive off (vertical)
- `install-day`: the Wizard Installs van arrives and the tech installs a dashcam for grandma (landscape)
- `midnight-donuts`: a sports car does donuts in a parking lot at night (vertical)
- `missed-taxi`: a guy misses his taxi, then it backs up for him (vertical)
- `brake-check`: highway brake check, rear-end crash, a fake neck injury, an attack on the dashcam, police,
  a taser, the dashcam footage replay and an arrest (vertical, ~59s)
- `nine-plus-ten`: night parking lot, Dev films on his phone as Arjun opens the door: "What's 9 plus 10?" (vertical)

## How new clips get made

Describe the clip to Claude in plain words: who's in it, what happens, the mood, any lines of dialogue. Claude
writes `scenes/<name>.scene.ts` (the filename is all the registration a scene needs), runs `preflight`, looks at
the stills and the soundtrack, fixes what's off, renders
and sends you the video. Ask for changes the same way ("make the crash bigger", "she should look scared").

`CLAUDE.md` holds everything Claude follows when working on Animo: the workflow, the scene language, and tips
learned from earlier clips.

## Recorded voices

Each spoken line is recorded once and saved in `voices/`, with a list in `voices/manifest.ts`. Commit that
folder: re-renders, on your machine or in the cloud, reuse the recordings and never pay twice. Changing a line's
text, voice or mood records a new take.

## Caches

The render bundle (the compiled web page Remotion renders) lives in `out/.bundle/` and is only rebuilt when `src/`
changes; scenes and recordings are passed in as data, so editing a scene costs nothing. Soundtracks are cached in
`public/audio/` by content. Both folders are git-ignored and safe to delete.

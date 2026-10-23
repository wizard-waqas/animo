# Animo

Cartoony 3D animation clips of people and cars, written as code by Claude.
Built on Remotion + React Three Fiber. No 3D model files: every character, car and set is built in code.

## Setup

Needs Node 20+.

```bash
npm install
npm run studio
```

`npm run studio` opens Remotion Studio in your browser. Pick a scene on the left, then hit play or scrub the timeline.

## Voices (realistic AI speech)

Dialogue uses a realistic AI voice service. Pick one and set its key as an environment variable:

- **ElevenLabs** (recommended, best acting): `ELEVENLABS_API_KEY`
- **Google Cloud Text-to-Speech** (Chirp 3 HD voices): `GOOGLE_TTS_API_KEY`

Then run `npm run voices -- <scene>` (render does this automatically). Each line is recorded once and saved in
`voices/`. Commit that folder, so re-renders are free and work offline.

## Rendering a video

```bash
npm run render -- pickup-friend --preview   # quick: 30fps, half size → out/pickup-friend/preview.mp4
npm run render -- pickup-friend             # final: 60fps, full size → out/pickup-friend/pickup-friend.mp4
```

You can also render from Studio with its Render button.

## Commands

| Command | What it does |
|---|---|
| `npm run studio` | Live preview in the browser |
| `npm run catalog` | Lists every character, car, animation, camera preset, set and style |
| `npm run inspect -- <scene>` | Timeline, positions and problem warnings (no rendering) |
| `npm run stills -- <scene>` | Contact sheet of frames → `out/<scene>/sheet.png` |
| `npm run voices -- <scene>` | Records the dialogue with an AI voice (needs an API key) |
| `npm run sound -- <scene>` | Builds the soundtrack (render does this automatically) |
| `npm run render -- <scene>` | Renders the MP4 with sound |
| `npm run check` | Typecheck + unit tests |

## Scenes included

- `pickup-friend`: Sara pulls up, Mike waves, gets in, and they drive off (vertical)
- `install-day`: the Wizard Installs van arrives and the tech installs a dashcam for grandma (landscape)
- `midnight-donuts`: a sports car does donuts in a parking lot at night (vertical)
- `missed-taxi`: a guy misses his taxi, then it backs up for him (vertical)
- `brake-check`: highway brake check, rear-end crash, and a dashcam reveal (vertical, with sound)

All sound effects (footsteps, engines, brake squeal, honks, crashes, doors, ambience) are generated in code
from the animation, so they always line up with what's on screen.

## How new clips get made

Describe the clip to Claude. Claude writes `scenes/<name>.scene.ts`, runs `inspect` and `stills` to check
its own work, fixes problems, and renders. See `CLAUDE.md` for the details Claude follows.

## Notes

- On Linux machines without a GPU, rendering uses software WebGL, which is slower. On a Mac or a PC with a GPU it's much faster.
- Set `TOON_BROWSER=/path/to/chrome` to use a specific Chrome/Chromium for rendering.

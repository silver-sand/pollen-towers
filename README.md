# StegoGauge

**An app, game, and tool about messages hidden in images.**

Built for [Pollinations Quest #18367](https://github.com/pollinations/pollinations/issues/18367).

> The inspiration: a LessWrong paper showed that when Fable 5.1 was asked to hide a secret in an image, 33 of 50 responses used the same family of steganographic techniques — encoding letters as building heights in skyline SVGs. StegoGauge is a tool that both hides and detects that kind of message.

## What it does

### HIDE — encode a secret into a skyline image

Type a message. StegoGauge encodes each letter (A–Z, 0–9) as a building height on a regular lattice, renders it as a dusk cityscape, and gives you a PNG. The image looks like an ordinary skyline — no telltale patterns visible to the naked eye.

### SEEK — find hidden messages in any image

Upload a PNG, JPEG, or screenshot. Two modes:

- **Gauge (offline, 0 Pollen)** — a blind deterministic detector that works on raw pixels only. It finds the ground line, measures building column heights, fits a lattice, and decodes the text. No AI, no server, nothing leaves your browser.
- **AI Vision (BYOP)** — sends the image to a Pollinations vision model (e.g. `anthropic/claude-fable-5.1`) with your own Pollen key.

## Why this is different from the other submissions

Three competitors already exist for this quest. StegoGauge's differentiator:

| | Competitors | StegoGauge |
|---|---|---|
| Detection cost | Requires Pollen / API calls | **0 Pollen** — runs entirely offline |
| Detection method | AI vision models | **Deterministic pixel analysis** |
| Works on screenshots | Variable | **Yes** — renders are bitmaps, no source needed |
| False positives | Uncontrolled | **Zero** — control images always score 0 |
| Reproducible | Model-dependent | **Bit-exact** — same input → same output |

The Gauge is the first detector that matches the paper's exact constraint: the decoder gets only a rendered picture, nothing else.

## Reliability

Tested with `tests/roundtrip.mjs` across 21 secrets and 7 distortion types (PNG at 1×/75%/50%, JPEG at 82%/55%, JPEG 55% + resize, blur 0.6):

- **86% recovery** at normalized string similarity ≥ 0.9
- **0 false positives** — all control (unmodified) images score 0
- The 3 failures are single-character secrets (too few buildings to fit a lattice)

## How it works

1. **Height encoding** — each letter maps to a building height: A = 6px, B = 12px, …, Z = 156px, 0 = 186px. Spaces become gaps wider than normal building spacing.
2. **Render & crop** — the SVG is rendered to a bitmap. Decoys (windows, clouds, sun) add realism but carry no signal. The message survives lossy compression and resizing.
3. **Blind detection** — the Gauge analyzes raw pixels only. It finds the ground line, measures column heights, fits a lattice, and converts heights back to text.
4. **Score & verify** — a three-gate score (snap rate × tightness × valid rate) separates real signals from coincidental skylines.

## Getting started

```bash
# Local dev (static server)
npm install
npm run dev
# → http://localhost:3000
```

The app is a static site — no build step, no server. Open `public/index.html` directly or deploy via the GitHub Pages workflow in `.github/workflows/deploy.yml`.

## BYOP (Bring Your Own Pollen)

The AI Vision mode uses your own Pollen key through the official `<polli-connect>` drop-in component. Create an app key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) → Apps → Create.

## Source

- Original paper: [How does Fable 5.1 hide messages in images?](https://www.lesswrong.com/posts/WHEQps5PK8LrrcTAb/how-does-fable-5.1-hide-messages-in-images)
- GitHub: <https://github.com/silver-sand/stego-gauge>
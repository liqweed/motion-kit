---
name: animated-diagram
description: "Build animated, interactive explanatory diagrams (process flows, hub-and-spoke integrations, build-up sequences) as deterministic scenes — pure functions of time — with motion-kit. One scene serves a live web page or Craft Page, Slidev slides (one build step per click), standalone SVG/PNG slide frames, a zero-JS baked SVG, and MP4/GIF video. Use when asked to 'animate a diagram', 'make an animated/interactive diagram or explainer', 'build-up slide', 'diagram that plays step by step', or to turn a process/architecture description into motion. For exporting/rendering an existing scene (PNG, video, social formats) use motion-render. Not for page or component micro-interactions (hover, press, toast, menu), faux product-UI demos or walkthroughs of an app screen, hero or feature-card illustrations, or decorative and looping effects: those belong to a UI animation or design skill."
---

# Animated diagram (motion-kit)

A scene is `frame(t) → SVG markup`, a pure function of time. Players own the
clock; exporters sample exact times; video samples `t = f / fps`. Read
`references/technique.md` before writing a custom scene or changing the runtime.

## Locate the toolkit

`$MK` is where the toolkit's files are (examples, styles, `brand/`); `mk` runs
the CLI. Take the first that works:

1. `MOTION_KIT_HOME`: a clone or install the user chose (run `npm install`
   there for PNG and video).
2. The npm package through `npx`, at the version of these skills. `npx`
   installs the PNG renderer with it.
3. The plugin copy, two levels above this skill: `check`, `build`, `bake` and
   SVG `export` work; PNG and video do not.

```bash
PLUGIN="$(cd -P "<this skill's base directory>" && cd ../.. && pwd -P)" # -P: the base may be a symlink to a clone
V="$(node -p "require(process.argv[1] + '/package.json').version" "$PLUGIN")"
if [ -n "${MOTION_KIT_HOME:-}" ]; then
  MK="$MOTION_KIT_HOME"; mk() { node "$MK/cli/motion-kit.mjs" "$@"; }
elif npx -y "@liqweed/motion-kit@$V" --help >/dev/null 2>&1; then
  MK="$PLUGIN"; mk() { npx -y "@liqweed/motion-kit@$V" "$@"; }
else
  MK="$PLUGIN"; mk() { node "$MK/cli/motion-kit.mjs" "$@"; }
fi
mk --help
```
Node ≥ 22. PNG and video need `@resvg/resvg-js`; video also needs `ffmpeg`.
When one is missing, the CLI names it: install `@resvg/resvg-js` with
`npm install` in `$MOTION_KIT_HOME` (or use the `npx` route), and `ffmpeg`
from the system's package manager (`brew install ffmpeg`, `apt install ffmpeg`).

## Workflow

1. **Brief: ask before building** (one message, skip what's already known):
   - What should the viewer *understand* after watching? (one sentence)
   - Where will it be shown? → target, see `references/targets.md`
     (Craft Page · in-chat preview · Slidev/Marp/PowerPoint · website · README/vault · video)
   - Which formats? (16:9, 4:3, 1:1, 9:16, wide strip, tall phone column)
   - Languages? (labels may be `{ "en": "...", "nl": "..." }`)
   - **Visual style:** neutral (default) / a style file (`--style brand.json`) /
     describe one → I write a style file. See `references/styles.md`.
   - Approved copy and claims. **Never invent numbers, metrics or claims.**
2. **Storyboard → approval.** Pick a scene type (`references/scene-types.md`).
   Write the spec, then render the step contact sheet and show it:
   `motion-kit export spec.json -o <scratch>/sb --png --qc` → open `index.html`
   or show the PNGs. Get a yes on the *story* before polishing.
3. **Build.** Spec-driven types first (`sequence`, `hub-spoke`, `timeline`, `stack`,
   `state-machine`, `request-journey`, `flowchart`). The user has a Mermaid
   flowchart? `motion-kit import flow.mmd --out flow.json` writes the spec
   (layout computed once). Only write a custom scene module when no type fits
   (`references/custom-scenes.md`): that file also covers an isometric view
   (camera, solids, depth order, label anchors), several tokens moving at once, dashed
   connectors with diamond junctions and light pulses, text that sharpens into place
   with a highlighter sweep (`blurReveal`, `highlightSweep`), hatched bar tracks
   with bars that grow and values that roll, and a code block whose highlight band
   moves one line range per step.
4. **Gate.** `motion-kit check spec.json` must pass in every format/locale
   shipped: deterministic, settled steps, rounded numbers, token-only colours,
   escaped labels, labels fit, holds the final frame. It also prints advice on
   the canon (duration, nothing animates, step labels, emphasis contrast).
5. **QC.** `references/qc.md`: before/after frames around each step, phone
   size, real-time playback (never trust virtual-time screenshots), reduced
   motion, dark mode. **A human approves the look**: green checks don't show it.
6. **Deliver** per target (`references/targets.md`) and write down where the
   spec lives so it can be edited and re-rendered later.

## Hard rules and advice

Two kinds of rule. The gate **fails** a scene that breaks a hard rule; it gives
**advice** on the canon: what it found, why the rule exists, when breaking it
is fine and what to do instead. A scene that breaks advice on purpose
acknowledges it (`acknowledge: [{ rule, reason }]`, one-line reason; see
`references/custom-scenes.md`, "Advice and acknowledgements"); `--strict` fails
advice nobody acknowledged, and a consumer's CI may turn it on. Read the advice
the check prints before acknowledging it: it often names a better scene.

Hard (the gate fails these; no acknowledgement helps):

- Step frames are settled: nothing moves at the step's `at` (the gate samples
  up to 45 ms after it). The 50 ms gap before the next motion is advice (below).
- The final frame holds after `duration`. A scene is a pure function of `t`
  with no `Date`, `Math.random`, `performance.now`.
- Colours are tokens; text and shapes a scene draws meet WCAG AA contrast.
- Player requirements, not checked by the gate (a green check does not prove a custom host has them): always a pause control (WCAG 2.2.2); reduced motion = final frame, no autoplay.

Advice (the canon; break it with a reason):

- Plays once and holds the final frame; don't loop an explainer. No player
  loops a scene. An ambient display is a page's own decision, driven by the
  page; only a scene whose first and last frames are identical acknowledges `nothing-animates`.
- Motion guidance (reviewed, mostly not mechanically timed): one entrance ≤ 600 ms, siblings staggered 80–150 ms, 50 ms between beats, aim for a whole scene ≤ 8 s. The gate gives advice (`duration`) above 12 s: fine when a voice-over or talk track sets the pace; otherwise split at a settled step.
- No bounce/elastic, no parallax, no ambient motion inside an explainer.
- Every motion must answer "what does this help the viewer understand?".
- Skeleton first, then fill: show the whole structure, then walk through it.
- One emphasis colour, one emphasis element.
- Every step label is drawn in the final frame (`step-labels-in-frame`); narrative steps say `stepLabelsInFrame: false`.
- Long text belongs in HTML captions (`detail`), not in the SVG.

## Quick recipes

```bash
mk() { node "$MK/cli/motion-kit.mjs" "$@"; }
mk types; mk formats
mk check diagram.json                                  # all formats × locales
mk import flow.mmd -o flow.json                        # Mermaid flowchart → sequence or flowchart spec, then checked
mk check flow.scene.mjs -l en -l nl --options labels.mjs   # a custom module, with its text from the caller
mk build diagram.json -o diagram.html -f wide -l nl    # Craft Page / standalone
mk export diagram.json -o out/ --png --qc              # slides + review sheet
mk bake diagram.json -o diagram.svg -f wide            # zero-JS animated SVG
mk video diagram.json -f 9:16 -o reel.mp4 --sheet sheet.png
mk vendor <repo>/components/motion-kit --adapter slidev   # or astro / page / element
mk outdated <repo>/components/motion-kit                # newer release on npm? exit 1 + the re-vendor command
node <repo>/components/motion-kit/check.mjs flow.scene.mjs -l en -l nl --style brand.json --options labels.mjs  # the vendored gate, same checks
```

Vendoring includes the full MIT `LICENSE`. Keep that file and the SPDX
headers when redistributing the vendored runtime and adapters.

## References

| File | Read when |
|---|---|
| `references/technique.md` | Always for custom scenes or runtime changes: the model, determinism rules, timeline authoring, lessons learned |
| `references/scene-types.md` | Choosing a type; spec fields; storyboards for types not built yet |
| `references/motion-vocabulary.md` | Easing, timing budgets, springs, split edges, container/text timing |
| `references/interactivity.md` | Player controls, scrubber, hover-linking, scroll-driven, explorables, a11y |
| `references/targets.md` | Where it will be shown and what each target allows |
| `references/styles.md` | Neutral default, style files, brand presets, contrast |
| `references/qc.md` | Review stages, checklist, review-report template |
| `references/custom-scenes.md` | Writing a one-off scene module, including isometric views, several tokens at once, connectors with pulses, bars with rolling values, and a code block with a moving highlight |
| `references/ecosystem.md` | When GSAP, HyperFrames, Remotion, Motion Canvas, Manim, Mermaid or ELK are the better tool |

For rendering, slide packaging and video, see the **motion-render** skill.

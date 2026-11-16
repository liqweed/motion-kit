---
name: motion-render
description: "Render motion-kit scenes (animated diagrams) to deliverables: slide-ready step frames (SVG/PNG, per-format, light/dark), a review contact sheet, zero-JS baked SVG, self-contained HTML for Craft Pages, and MP4/WebM/GIF video in 16:9, 1:1, 4:3 or 9:16, plus format × locale variant matrices. Use when asked to 'export the diagram', 'make slides from the animation', 'render a video / reel / GIF of the diagram', 'vertical version for social', or to package diagram outputs. To design or build the diagram itself use animated-diagram."
---

# Motion render

All outputs come from the same pure scene, so they always agree. Locate the
toolkit as in the animated-diagram skill (`MK=$HOME/workspace/motion-kit`, else
the plugin root two levels above this skill). PNG and video need
`@resvg/resvg-js` (`npm install` in `$MK`) and `ffmpeg`.

```bash
mk() { node "$MK/cli/motion-kit.mjs" "$@"; }
```

**Always run `mk check <scene>` first.** Exporters refuse scenes that fail the gate.

## Slides

```bash
mk export spec.json -o out/slides -f 16:9 -l nl --png --scale 2 [--background] [--theme dark] [--style brand.json]
```
One `NN-<step>.svg` (+ `.png`) per build step, tokens resolved. Put one step
per slide at an identical position and size; transition None, Dissolve or
Morph. Details and per-app notes: `references/slides.md`.
Slidev decks: use the Slidev adapter instead (click-driven, live). See the
animated-diagram skill, `references/targets.md`.

## Review sheet

```bash
mk export spec.json -o out/review --png --qc
```
`index.html` holds the steps, frames 0.2 s before and after each step, a phone-size row and the
review checklist. Fill in the review report (animated-diagram
`references/qc.md`) and get a human approval line before delivery.

## Video

```bash
mk video spec.json -f 9:16 -o out/reel.mp4 --fps 30 --scale 2 --hold 1.5 --sheet out/reel-sheet.png
mk video spec.json -f 16:9 -o out/demo.webm
mk video spec.json -f wide -o out/readme.gif --fps 15 --scale 1
```
Formats, sizes, encoder settings, variant matrices and the HyperFrames handoff:
`references/video.md` and `references/formats.md`.

## Other outputs

```bash
mk build spec.json -o out/page.html -f wide         # Craft Page / standalone interactive
mk bake  spec.json -o out/diagram.svg -f wide --fps 12   # zero-JS animated SVG
```

For plain HTML or a framework-independent live embed, use
`mk vendor public/motion-kit --adapter element`, then load
`./motion-kit/adapter/motion-diagram.mjs` with `type="module"` and place
`<motion-diagram src="./spec.json" format="wide">` around a final-frame SVG
or image fallback. Copy the spec to `public/spec.json` and serve over HTTP.
Inline JSON (`spec` attribute or child
`script[type="application/json"]`), `locale`, `theme` and JSON `style-spec`
are supported; the normal `style` attribute stays CSS. The element exposes
`controller` after `motion-ready`, preserves the fallback during loading or
errors, and cleans up on disconnect. Full usage: `adapters/element/README.md`.

## Delivery package

```
<name>/
  spec.json (+ style.json)       source of truth: edit and re-render
  slides/   NN-step.svg|png, manifest.json, index.html
  video/    <name>-<format>.mp4, sheet.png
  web/      <name>.html, <name>.svg (baked)
  REVIEW.md                      review report with human approval line
```
`manifest.json` records scene, type, format, locale, size, duration, style,
theme, an input hash and the source commit, with no timestamps, so a re-render
from the same inputs is byte-identical and a stale export is easy to spot.

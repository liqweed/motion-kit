# motion-kit

Deterministic animated diagrams. A scene is a **pure function of time**,
`frame(t) → SVG`. The same scene serves:

- a live, interactive player (web pages, Craft Pages, Astro islands),
- Slidev decks (one build step per click),
- slide-ready step frames (SVG/PNG, light/dark, any format),
- a zero-JS baked animated SVG (READMEs, notes, chat previews),
- MP4 / WebM / GIF video in 16:9, 4:3, 1:1 and 9:16.

Private toolkit for Ophir's projects. Consumers vendor it (see below).

## Quick start

```bash
npm install                        # optional: @resvg/resvg-js for PNG/video
node cli/motion-kit.mjs check examples/order-flow.json
node cli/motion-kit.mjs build examples/order-flow.json -o out/order.html -f wide -l nl
node cli/motion-kit.mjs export examples/smart-home.json -o out/slides --png --qc
node cli/motion-kit.mjs bake examples/order-flow.json -o out/order.svg -f wide
node cli/motion-kit.mjs video examples/smart-home.json -f 9:16 -o out/reel.mp4 --sheet out/sheet.png
npm test
```

Requirements: Node ≥ 22. PNG and video: `@resvg/resvg-js` (optional
dependency) or Chrome; video: `ffmpeg`.

## Layout

```
runtime/        dependency-free ES modules (browser + Node)
  motion.mjs    easing (exact cubic-bezier), progress, critically damped spring, retarget, split edges
  svg.mjs       escaping, rounding, el/text/fade, polyline + Bézier arc-length, drawOn
  wrap.mjs      label wrapping with hard budgets
  style.mjs     tokens, neutral style, contrast checks, token resolution
  scene.mjs     scene contract, formats, renderSvg
  parts.mjs     shared node/label drawing
  types/        spec-driven scene types: sequence, hub-spoke
  bake.mjs      zero-JS animated SVG
  player.mjs    live player (controls, a11y, reduced motion, capture hook)
lib/            Node-side: check (gate), export, build (HTML inliner), raster, video
adapters/       slidev (Vue), astro, page (README)
skills/         animated-diagram, motion-render (Claude Code / Craft skills)
examples/       order-flow (sequence), smart-home (hub-spoke), custom-pulse (custom module)
styles/         neutral.json (the only style shipped; brands live in their repos)
```

## Install the skills

- **Claude Code** (all projects):
  `claude plugin marketplace add liqweed/motion-kit` →
  `claude plugin install motion-kit@motion-kit`
- **Craft Agent:** symlink `~/.agents/skills/animated-diagram` and
  `~/.agents/skills/motion-render` to `skills/*` in this clone.

The skills look for this clone at `~/workspace/motion-kit` first (it has
`node_modules`), then fall back to the plugin copy.

## Use in another repo (vendor)

```bash
node cli/motion-kit.mjs vendor <repo>/components/motion-kit --adapter slidev   # or astro / page
```

Copies `runtime/` + the adapter and writes `MOTION_KIT_VERSION`. Don't edit
vendored files; change motion-kit and re-vendor. Vendoring keeps consumer CI
self-contained (no access to this private repo needed).

## Rules (the gate enforces them)

Deterministic bytes · settled step frames · rounded numbers · token-only colours ·
escaped labels · labels fit their budget in every locale · holds the final frame ·
≤ ~8–10 s · no clock or randomness in scenes. See
`skills/animated-diagram/references/technique.md`.

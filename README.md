<p align="center"><img src="assets/icon-animated.svg" width="112" alt="motion-kit logo"></p>

# motion-kit

Deterministic animated diagrams. A scene is a **pure function of time**,
`frame(t) → SVG`. The same scene serves:

- a live, interactive player (web pages, Craft Pages, Astro islands),
- Slidev decks (one build step per click),
- slide-ready step frames (SVG/PNG, light/dark, any format),
- a zero-JS baked animated SVG (READMEs, notes, chat previews),
- MP4 / WebM / GIF video in 16:9, 4:3, 1:1 and 9:16.

Open source under the [MIT licence](LICENSE). Consumers vendor the runtime (see below).

## Examples

Baked with `motion-kit bake`: zero-JS animated SVGs that play once in this
README and follow your GitHub theme. Regenerate with `npm run media`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/order-flow-dark.svg">
  <img src="docs/media/order-flow-light.svg" alt="order-flow: a sequence scene" width="720">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/smart-home-dark.svg">
  <img src="docs/media/smart-home-light.svg" alt="smart-home: a hub-and-spoke scene" width="720">
</picture>

The interactive player (scrubber, steps, captions) needs scripts, which
GitHub does not run: `node cli/motion-kit.mjs build examples/order-flow.json -o out/order.html`
and open the file.

## Quick start

```bash
npm install                        # optional: @resvg/resvg-js for PNG/video
node cli/motion-kit.mjs check examples/order-flow.json
node cli/motion-kit.mjs build examples/order-flow.json -o out/order.html -f wide -l nl
node cli/motion-kit.mjs export examples/smart-home.json -o out/slides --png --qc
node cli/motion-kit.mjs bake examples/order-flow.json -o out/order.svg -f wide
node cli/motion-kit.mjs video examples/smart-home.json -f 9:16 -o out/reel.mp4 --sheet out/sheet.png
node cli/motion-kit.mjs icon brand/logo.scene.mjs -o .     # project icon set: assets/ + .idea/
npm test
npm run gate                       # typecheck, versions, tests, scene gate, media freshness
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
lib/            Node-side: check (gate), export, build (HTML inliner), raster, video, icon
adapters/       slidev (Vue), astro, page (README)
skills/         animated-diagram, motion-render, project-logo (Claude Code / Craft skills)
examples/       order-flow (sequence), smart-home (hub-spoke), custom-pulse (custom module)
brand/          logo scene (built with motion-kit); renders go to assets/ + .idea/ (npm run media)
assets/         generated project icon: icon.svg, icon.png, icon-animated.svg
docs/media/     baked README animations (generated: npm run media)
docs/           prd.md, roadmap.md, spec/technique.md
styles/         neutral.json (the only style shipped; brands live in their repos)
```

## Install the skills

- **Claude Code** (all projects):
  `claude plugin marketplace add liqweed/motion-kit` →
  `claude plugin install motion-kit@motion-kit`
- **Craft Agent:** symlink `~/.agents/skills/animated-diagram`,
  `~/.agents/skills/motion-render` and `~/.agents/skills/project-logo` to
  `skills/*` in this clone.

The skills look for this clone at `~/workspace/motion-kit` first (it has
`node_modules`), then fall back to the plugin copy.

## Use in another repo (vendor)

```bash
node cli/motion-kit.mjs vendor <repo>/components/motion-kit --adapter slidev   # or astro / page
```

Copies `runtime/` + the adapter and writes `MOTION_KIT_VERSION`. Don't edit
vendored files; change motion-kit and re-vendor. Vendoring keeps consumer CI
self-contained (no install step, no network).

## Rules (the gate enforces them)

Deterministic bytes · settled step frames · rounded numbers · token-only colours ·
escaped labels · labels fit their budget in every locale · holds the final frame ·
≤ ~8–10 s · no clock or randomness in scenes. See
`skills/animated-diagram/references/technique.md`.

## Licence and credits

MIT, see [LICENSE](LICENSE). Vendored files carry an SPDX header; keep it.

Ideas borrowed with thanks: the contact-sheet self-check and hover-linking
from [visual-explainer](https://github.com/nicobailon/visual-explainer), and
in-SVG pause and reduced-motion handling from Dashmotion. See
[`skills/animated-diagram/references/ecosystem.md`](skills/animated-diagram/references/ecosystem.md)
for related tools and when to use them instead.

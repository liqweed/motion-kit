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
npx @liqweed/motion-kit --help     # or: npm i -g @liqweed/motion-kit (installs `motion-kit`)
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
adapters/       slidev (Vue), astro, element (custom element), page (README)
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
node cli/motion-kit.mjs vendor <repo>/components/motion-kit --adapter slidev   # or astro / page / element
```

Copies `runtime/`, the adapter, the gate (`lib/check.mjs`, `lib/gate.mjs`,
`lib/load.mjs`) and `LICENSE`; writes `check.mjs` and `MOTION_KIT_VERSION`.
Don't edit vendored files; change motion-kit and re-vendor. Vendoring keeps
consumer CI self-contained (no install step, no network): the vendored gate
runs the same checks as `motion-kit check`.

```bash
node src/motion-kit/check.mjs src/diagrams/*.json src/diagrams/*.scene.mjs \
  --locale en --locale nl --style src/brand/motion-style.json --options src/diagrams/labels.mjs
```

### Astro

```bash
node cli/motion-kit.mjs vendor <site>/src/motion-kit --adapter astro
```

```astro
---
import AnimatedDiagram from "../motion-kit/adapter/AnimatedDiagram.astro";
import spec from "../diagrams/order-flow.json";
import brandStyle from "../brand/motion-style.json"; // token data, as `--style` reads it
import { dictionary } from "../i18n"; // your site's own text, keyed by locale
const lang = Astro.currentLocale ?? "en";
const t = dictionary[lang];
---
<AnimatedDiagram spec={spec} format="wide" locale="nl" class="hidden lg:block" />
<AnimatedDiagram spec={spec} format="tall" locale="nl" class="lg:hidden" />

<!-- A custom scene module, its text from the page's dictionary -->
<AnimatedDiagram module="/src/diagrams/flow.scene.mjs" options={{ labels: t.flow }}
  format="wide" locale={lang} theme="light" style={brandStyle} id="flow" />
```

The server render is the player's first state: the final frame, the step list
and the style's colours, with the controls in place, so the diagram is complete
without JavaScript and mounting causes no layout shift. `theme` fixes light or
dark; `style` is token data. Page scripts reach a player through its root
element's `controller` (set on mount; `motion-ready` announces it), and can
address steps by id (`controller.playToStep("payment")`). All props are listed in the adapter's
header comment.

### Plain HTML and framework-independent custom element

```bash
node cli/motion-kit.mjs vendor public/motion-kit --adapter element
cp diagram.json public/diagram.json
cp diagram-final.svg public/diagram-final.svg   # the final-frame fallback image
```

```html
<motion-diagram src="./diagram.json" format="wide" locale="en">
  <img src="./diagram-final.svg" alt="The complete diagram and its explanation">
</motion-diagram>
<script type="module" src="./motion-kit/adapter/motion-diagram.mjs"></script>
```

Serve the files over HTTP; no build step is needed. The supplied final-frame
fallback stays visible without JavaScript, while loading and on errors. Specs
can also be inline JSON. `theme` and JSON `style-spec` attributes configure
the appearance, and `element.controller` exposes the live player after the
`motion-ready` event. See [the element adapter](adapters/element/README.md)
for inline specs, styles, lifecycle and error handling.

## Rules (the gate enforces them)

Deterministic bytes · settled step frames · rounded numbers · token-only colours ·
escaped labels · labels fit their budget in every locale · holds the final frame ·
≤ ~8–10 s · no clock or randomness in scenes · ids from the instance prefix. See
`skills/animated-diagram/references/technique.md`.

## Contributing, changes and stability

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, the gate and hooks, commits,
  change notes, adding a scene type.
- [CHANGELOG.md](CHANGELOG.md): what each release changed.
- [docs/stability.md](docs/stability.md): the public API, what semver promises
  for it, and how vendoring consumers learn about a new version.

## Licence and credits

MIT, see [LICENSE](LICENSE). Keep the copied `LICENSE` file and the SPDX
headers when redistributing vendored files.

Ideas borrowed with thanks: the contact-sheet self-check and hover-linking
from [visual-explainer](https://github.com/nicobailon/visual-explainer), and
in-SVG pause and reduced-motion handling from Dashmotion. See
[`skills/animated-diagram/references/ecosystem.md`](skills/animated-diagram/references/ecosystem.md)
for related tools and when to use them instead.

Pull requests here are reviewed with the help of
[CodeRabbit](https://coderabbit.ai), which supports open source projects for
free. Thank you, CodeRabbit, for the support.

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
npm test                           # includes PNG snapshots of the examples' step frames
npm run snapshots:update           # after an intended visual change: regenerate test/snapshots/
npm run gate                       # typecheck, versions, tests, scene gate, media freshness
```

Requirements: Node ≥ 22. PNG and video: `@resvg/resvg-js` (optional
dependency) or Chrome; video: `ffmpeg`.

## Layout

```
runtime/        dependency-free ES modules (browser + Node)
  motion.mjs    easing (exact cubic-bezier), progress, critically damped spring, retarget, split edges
  svg.mjs       escaping, rounding, el/text/fade, polyline + Bézier arc-length, drawOn, several tokens
  iso.mjs       isometric kit for custom scenes: camera, solids (rounded too), depth order, grid backdrop, content on faces, label anchors and pills
  connectors.mjs dashed connectors, diamond junctions and single-pass light pulses for custom scenes
  wrap.mjs      label wrapping with hard budgets
  style.mjs     tokens, neutral style, contrast checks, token resolution
  scene.mjs     scene contract, formats, renderSvg
  parts.mjs     shared node/label drawing
  types/        spec-driven scene types: sequence, hub-spoke, timeline, stack
  bake.mjs      zero-JS animated SVG
  player.mjs    live player (controls, a11y, reduced motion, capture hook)
  links.mjs     page links: scroll sections and data-mk-step terms drive the player
  patch.mjs     in-place SVG updates for the player's frames
lib/            Node-side: check (gate), export, build (HTML inliner), raster, video, icon
adapters/       slidev (Vue), astro, element (custom element), page (README)
skills/         animated-diagram, motion-render, project-logo (Claude Code / Craft skills)
examples/       order-flow (sequence), smart-home (hub-spoke), incident (timeline),
                web-stack (stack), custom-pulse (custom module),
                isometric-swivel (custom module: isometric kit, several tokens),
                isometric-platform (custom module: rounded slabs, grid backdrop, mark on a top face, pill tags)
                connectors (custom module: connectors, diamond junctions, pulses)
bench/          heavy scene for npm run bench:player (live-player frame cost)
brand/          logo scene (built with motion-kit); renders go to assets/ + .idea/ (npm run media)
assets/         generated project icon: icon.svg, icon.png, icon-animated.svg
docs/media/     baked README animations (generated: npm run media)
docs/           prd.md, roadmap.md, spec/technique.md
styles/         neutral.json (the only style shipped; brands live in their repos)
test/           node:test suites; snapshots/ holds PNG step frames (npm run snapshots:update)
```

## Install the skills

- **Claude Code** (all projects):
  `claude plugin marketplace add liqweed/motion-kit` →
  `claude plugin install motion-kit@motion-kit`
- **Craft Agent:** symlink `~/.agents/skills/animated-diagram`,
  `~/.agents/skills/motion-render` and `~/.agents/skills/project-logo` to
  `skills/*` in this clone.

The skills find the CLI in this order: `MOTION_KIT_HOME` (a clone or install
you choose; run `npm install` there for PNG and video), then the npm package
through `npx` at the plugin's version (it installs the PNG renderer), then the
plugin copy, which checks, builds and exports SVG but renders no PNG or video.

## Use in another repo (vendor)

```bash
node cli/motion-kit.mjs vendor <repo>/components/motion-kit --adapter slidev   # or astro / page / element
```

Copies `runtime/`, the adapter, the gate (`lib/check.mjs`, `lib/gate.mjs`,
`lib/load.mjs`) and `LICENSE`; writes `check.mjs` and `MOTION_KIT_VERSION`.
Don't edit vendored files; change motion-kit and re-vendor.
`motion-kit outdated <dir>` tells you when a newer release exists. Vendoring keeps
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
hard limit 12 s (aim for ≤ 8 s) · no clock or randomness in scenes · ids from the instance prefix. See
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

See the [Astro consumer guide](docs/guides/astro.md) for dictionaries, server
rendering, styles, page helpers, CI and upgrades. The seven built-in scene types
include [state-machine, request-journey and flowchart](skills/animated-diagram/references/scene-types.md);
`motion-kit import flow.mmd --out flow.json` turns a Mermaid flowchart into a
spec, laid out once at build time.
The [spec playground](https://motion-kit.dev/playground/) checks, plays and
shares a JSON spec directly in the browser.

Localized dictionaries must contain the requested locale; plain strings are
shared. Custom modules can export `locales = ["en", "nl"]` for gate coverage.
Narrative scenes may set `stepLabelsInFrame: false`; otherwise every step label
must appear in the final frame. `controller.onStep(callback)` observes changes
without polling and returns an unsubscribe function.

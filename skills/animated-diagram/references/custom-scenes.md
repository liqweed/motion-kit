# Custom scenes

When no scene type fits, write a module. Template: `examples/custom-pulse.scene.mjs`.

```js
// my-diagram.scene.mjs. Import ONLY from motion-kit's runtime, single-line
// relative imports (the HTML builder inlines modules line by line).
import { easeOut, easeStandard, progress } from "../runtime/motion.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { tok } from "../runtime/style.mjs";
import { el, fade, num, text } from "../runtime/svg.mjs";

export default function make({ format = "16:9", locale = "en" } = {}) {
  const { width, height } = FORMATS[format];
  // timeline constants …
  return {
    id: `my-diagram-${format.replace(":", "x")}`, width, height,
    duration: 4.2,
    title: localize({ en: "…", nl: "…" }, locale),
    description: localize({ en: "…", nl: "…" }, locale),
    steps: [{ at: 1.2, label: "…", detail: "…", id: "request" }, …],
    frame(t, { idPrefix }) {
      // inner SVG markup for time t; ids are `${idPrefix}-…`
    },
  };
}
```

Rules:

- Pure: the frame depends only on `t` and constants. No clock, no randomness,
  no module-level mutable state.
- Colours only via `tok()`; numbers in strings via `num()`. Named colours
  (`"red"`) are literals too.
- Say which token pairs the scene draws: `contrastPairs`. The gate holds the
  style to those pairs (WCAG 1.4.3, 1.4.11) and only warns about the shared
  ones you leave out, so a brand palette is never failed on a pair the scene
  never shows. `kit.sharedPairs("ink/bg", "accent/bg", …)` picks shared pairs by
  name; write out others, such as
  `{ fg: "accent", bg: "surface", min: 3, use: "bar on its track" }` (4.5 for
  text, 3 for shapes; `references/styles.md`). A scene that declares none is
  held to every shared pair, so declare what you draw.
- Use `fade()`/`el()` so invisible elements disappear; `drawOn()` for lines.
- Ids (clip paths, gradients, masks, markers, filters) MUST be built from
  `idPrefix`, the second argument's field: `${idPrefix}-clip`, referenced as
  `url(#${idPrefix}-clip)`. Every render gets a prefix unique to its instance,
  so two copies on one page never share an id. The gate refuses fixed ids.
- Give steps an `id` when page scripts or links address them
  (`controller.playToStep("request")`); ids are unique within the scene.
- Lay out per format; throw if labels don't fit (`wrapLabel`).
- Gate: `motion-kit check my-diagram.scene.mjs` (all formats you support; pass
  `--format` to limit).
- Imports must be single-line `import { a, b } from "./relative.mjs";` and the
  default export a function; the HTML builder supports only that subset.
- If the same shape is needed twice, promote it to a scene type in
  `runtime/types/` with a spec and tests.

## Scene options: text and views from the caller

Every caller builds a module through `sceneFromModule` (`runtime/kit.mjs`):

```js
make({ ...options, format, locale, kit })
```

`options` are the caller's serializable scene options, passed unchanged: a
site's dictionary entry (`labels`), a `view` to draw. `format`, `locale` and
`kit` are reserved. The same module, options, format and locale give the same
scene in the gate, the exporters and the browser.

```js
export default function make({ format = "16:9", labels, view = "full" }) {
  // labels: { title, description, steps: [{ id, label, detail }] } from the caller
}
```

- CLI: `--options` takes inline JSON, a `.json` file, or an `.mjs` whose
  default export is the options or `({ format, locale }) => options`, so the
  gate checks each locale with that locale's text:

  ```js
  // labels.mjs
  import en from "../i18n/en.json" with { type: "json" };
  import nl from "../i18n/nl.json" with { type: "json" };
  export default ({ locale }) => ({ labels: { en, nl }[locale].flow });
  ```

  ```bash
  motion-kit check flow.scene.mjs -l en -l nl --options labels.mjs --style brand.json
  ```

  A vendored copy runs the same gate: `node <vendored>/check.mjs` takes the
  same files and flags.
- Astro adapter: `<AnimatedDiagram module="/src/diagrams/flow.scene.mjs"
  options={{ labels: t.flow }} locale={lang} format="wide" />`. The module
  lives under `src/` and ends in `.scene.mjs` or `.scene.js`; the adapter
  renders it on the server and loads it in the browser on demand. Only the
  page's locale's text ships.

## Scenes outside this repository: `kit`

`kit` is the whole runtime in one flat namespace (`runtime/kit.mjs` `KIT`). A
scene file kept in another repository can destructure what it needs instead of
importing:

```js
export default function make({ format = "1:1", kit }) {
	const { tok, el, num, progress, easeOut } = kit;
	…
}
```

Every command supports this, `motion-kit build` included (it bundles the runtime and passes
`KIT` as `kit`, the isometric helpers included). A module that imports instead must use
relative imports to a vendored runtime.

## Isometric and 3D-looking scenes

`kit` carries a small isometric kit (`runtime/iso.mjs`), for a floor, machines
or buildings seen from an angle. Template: `examples/isometric-swivel.scene.mjs`
(plan view that swivels to isometric, then three work items travel a line).
Everything is a pure function: the same camera and solids give the same bytes.

World: x east, y north, `z` up, in any unit you like. Colours are token names
(`"surface"`, `"accent"`), never literals; the gate refuses a literal.

| Need | Use |
|---|---|
| A camera | `camera({ azimuth, elevation, zoom, pan })`: the view's angles in degrees, pixels per world unit, and where the world origin lands. `elevation: 90` with `azimuth: 0` is the plan view (north up); `CAMERA_ISOMETRIC` is true isometric (45° azimuth, `ISO_ELEVATION` ≈ 35.26°); `CAMERA_PLAN` is the plan view |
| A swivel | `lerpCamera(from, to, progress(t, start, dur, easeStandard))`: every field interpolates, so plan → isometric is one move between two settled steps |
| Keep it in the picture | `fitCamera(worldPoints, cam, { width, height, margin })` returns `cam` with the pan and zoom that fit the points (the floor corners, the tallest heights, the route). Call it with each frame's camera, and a swivel never clips |
| A point on the screen | `project(cam, { x, y, z })` → `{ x, y, depth }` (`projector(cam)` for many points; larger `depth` is nearer the viewer) |
| Solids | `box({ x, y, w, d, h, z })` (centred on x, y), `slab({ x, y, w, d })` (a thin box, for a floor), `prism({ points, h, z })` with `regularPolygon(x, y, r, n)` for a footprint. Options: `fill` (top token), `sides` (side token, default `fill`), `shade` (token layered over the sides at 10–26 %, `null` for flat; `ink` darkens in the light theme and lightens in the dark one, pick `bg` where the dark theme should be darker), `stroke`, `opacity`, `id` |
| Draw them | `drawSolid(solid, cam)`, or `drawSolids(list, cam)`, which orders them far to near first (`orderSolids` alone returns the order). Only faces that face the camera are drawn: at 90° elevation just the tops |
| Animate a solid | Build it again each frame with the animated `h`, `z` or `opacity`. Two-state fills cross-fade two solids (`fade(p, {}, drawSolid(reached, cam))` over the pending one), as with any other element |
| Labels | `labelAnchor(cam, { id, at: { x, y, z }, lines, lift, side, opacity })` → `{ markup, box }`: a dot on the point, a stem `lift` px up, the label above it (`side: "up"`, or beside the stem's top with `"right"` / `"left"`). Wrap and localize `lines` first (`wrapLabel`) |
| Several tokens | `tokensAlong(path, t, runs, draw)`: see below |

**The gate checks labels.** Return `labelBoxes: (t) => [box, …]` from the scene
(the `box` of each `labelAnchor` you draw at `t`), and `motion-kit check` fails
the scene when, at any sampled time or step, two label boxes overlap (closer
than 4 px), a stem runs through another label, or a box leaves the picture. Fix
it in the layout: alternate `lift` between neighbours (more in a narrow format,
where they stand closer), shorten the label, or fade labels out while the
camera moves, as the example does. Boxes with `opacity: 0` are skipped.

**Several tokens at once.** `tokensAlong(path, t, runs, draw)` draws every token
in flight. `path` is anything with `at(fraction)`: `polyline`, `cubic`, or
`path3(worldPoints)`, which gives positions by distance, so a token moves at a constant speed in the
world whatever the camera does when its `ease` is linear (the default is
`easeStandard`; project each point in `draw`). `runs` is `[{ start, duration, ease?,
path?, hold? }]`, one per token, each with its own start and, if it needs one,
its own `path`; a token is drawn from `start` until it arrives (kept at the end
with `hold`). `tokenPoints` gives the positions without drawing. Stagger the
starts (`stagger()`) so the tokens do not sit on one another. Several tokens
may move at the same time **inside the story's beats only**: every token has
arrived, and the arrivals have filled, before the step's time (the settled-step
rule in the gate applies as ever), and a token that stops mid-path is not a
resting state. A token never loops back to the start.

## Connectors, junctions and pulses

`kit` also ties pieces together (`runtime/connectors.mjs`). Template:
`examples/connectors.scene.mjs` (a request fans out through a diamond splitter;
a result rides an isometric feeder line through three junctions).

| Need | Use |
|---|---|
| A route | `connectorPath(points, { camera? })`: flat `{ x, y }` points in pixels, or world `{ x, y, z }` points projected by `camera` (build it once if the camera rests, each frame if it moves). Positions go by distance, in the world under a camera |
| A dashed connector | `drawConnector(path, p, { stroke, width, dash, arrow, opacity })`: draws the route up to fraction `p`, a dashed line whose dashes stay put as it grows. Draw it on with `progress(t, start, 0.5, easeStandard)`; at `p = 1` it is the resting dashed line. An open-V arrowhead rides the leading end (`arrow: false` for none) |
| A diamond junction | `drawJunction({ at, camera?, plane, size, lit })` where connectors turn, split or join. `plane: "screen"` (default) stands on the picture, `"floor"` lies in an iso view's floor plane (give it the world point and the `camera`). `lit` (0..1) cross-fades the reached layer in, as a node's two layers do |
| A light pulse | `drawPulse(path, t, { start, duration, lag?, ease?, hold? }, { color, radius })`: a head with a soft glow and a fading tail, from the connector's start to its end, once. `color` is a token (default `emphasis`). Gone at `pulseEnd(run)`, or held at the end with `hold` |

**One pulse per step, inside the beat.** A pulse is a token with a glow: it runs
once, in its step's beat, and is over before the step. Take `pulseEnd(run)`
(`start + duration + lag`), add the time its target takes to light (200–300 ms),
and put the step's `at` at least 50 ms after that; the settled-frame rule in the
gate then holds. Several pulses may run in one beat: one per connector, starting
together to fan out from a junction (the twin pulses of an explainer), or one
after another, each starting when the last has arrived. Light a junction or a
target when the pulse reaches it: `lit: progress(t, arriveAt, 0.25, easeStandard)`,
where `arriveAt` is `run.start + run.duration` (with `ease: linear`, a junction
at a fraction `f` of the path is reached at `run.start + f * run.duration`).
A pulse never repeats while a step rests: a connector that pulses on a loop is
ambient motion, which the canon rules out.

Canon: no loops, no ambient motion, no continuous scrubbing, 12 s hard limit
(8 s target). An isometric scene plays once and holds its last frame, like any
other, and under reduced motion the player shows that frame. A constantly
moving hero is a 3D model's job, not motion-kit's.

## Text that sharpens into place, and a highlighter

`kit` carries text helpers (`runtime/svg.mjs`), for a label or a quote that
should arrive as a beat and not just appear. Template:
`examples/text-reveal.scene.mjs` (three labels reveal in reading order, then a
quoted line reveals and is marked).

| Need | Use |
|---|---|
| A reveal | `blurReveal(enter, { id, rise, blur }, ...markup)` with `enter = progress(t, start, 0.4, easings(style.motion).easeOut)`. The markup starts soft, transparent and `rise` units low (default 6) and sharpens into place; `blur` is the starting radius (default 4, at most 12). Any markup works, a `<text>`, a group, a card. The blur's region fits text 50 units wide or more; for a short label or an icon pass `box: { x, y, width, height }` |
| Its filter id | `id: idPrefix + "-reveal-" + i`, one per revealed element. The gate refuses a fixed id, and every slice of a baked SVG has its own prefix |
| A highlighter | `highlightSweep(p, { x, y, width, height, token, opacity, radius })`: a band in a token (default `emphasis`) at 30 % that grows from `x` to `x + width` as `p` (eased) goes 0 → 1. Draw it **before** the text; size it from `estimateWidth(line, fontSize)` plus padding each side (the estimate is generous, ×0.9 hugs a typical sans-serif) |

Rules that keep it inside the canon:

- **Settled means bare.** When `enter` reaches 1, `blurReveal` returns your
  markup with no group, no filter and no `<defs>`, so every step frame and the
  final frame are byte-identical to the same text drawn without the reveal.
  Finish each reveal 50 ms or more before the step it belongs to, as with any
  beat; the gate's settled-step rule then holds. Do not wrap the call in your
  own filter or opacity.
- **Once per element, inside a beat.** A reveal runs 300–600 ms and never
  repeats. Stagger siblings 80–150 ms in reading order. A blinking cursor or any
  other loop is ambient motion and stays out; a static cursor is fine.
- **Reduced motion** shows the final frame, which is the settled text and the
  full band: no filter, no motion.
- **Renderers.** The live player (in-place patch), `bake`, PNG export (resvg,
  Chrome) and video draw the same blur. A consumer that ignores SVG filters
  shows the fade and the rise only, and only mid-reveal; step frames carry no
  filter.
- **Cost.** A blur is the most expensive thing a frame can ask the browser for.
  Reveal the handful of elements the viewer must watch arrive, not every
  element in a dense diagram; for those, `fade()` is enough
  (`motion-vocabulary.md`, "Blur reveal or plain fade").
- **Contrast.** Start the band's `opacity` at 0.2–0.4, but the gate checks the
  text against the canvas, not against the tinted band. With a custom style,
  composite the band colour at that opacity over the token actually behind it
  (`bg` for text on the canvas, `surface` for text on a node, `accent` for text
  on an active node) and check every text colour actually drawn there (`ink`, `muted` for
  pending labels, or `onAccent` on an accent fill) against the result (4.5:1), or lower the
  opacity until it holds.

## Declared locales and narrative steps

Export `const locales = ["en", "nl"]` alongside the default factory so both
CLI and vendored checks test every shipped locale. Without a declaration the
check uses `en`; explicit `--locale` flags override the declaration.
`localize()` accepts shared plain strings or an exact locale translation;
a missing dictionary entry throws. It never silently selects another language.

A scene whose step labels narrate actions rather than name visible objects
sets `stepLabelsInFrame: false`. Those labels still belong in the player's
controls and accessible transcript; G10 otherwise requires each label in the
final frame. `frame(t, { idPrefix, style })` also receives the normalized style
when called through `renderSvg`; custom shape styling is opt-in. So is the
style's motion: `const { easeOut, easeStandard } = kit.easings(style.motion)` (or
`easings` from `runtime/motion.mjs`) gives the curves its `motion` names, the
neutral ones when it names none.

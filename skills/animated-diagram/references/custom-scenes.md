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
or buildings seen from an angle. Templates: `examples/isometric-swivel.scene.mjs`
(plan view that swivels to isometric, then three work items travel a line) and
`examples/isometric-platform.scene.mjs` (rounded slabs, grid backdrop, a mark on a top face, pill tags).
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
| Rounded solids | `roundedBox({ x, y, w, d, h, z, radius, segments })` and `roundedSlab({ x, y, w, d, radius })` (thin, for a floor or platform): a box with rounded vertical corners, `radius` up to half the shorter side, `segments` (default 8) per corner. Same options as `box`, same depth order. The visible sides draw as **one wall, outlined once**, so a rounded side has no seam per sample; only its shade changes. Use these, never a rounded rect sampled into a `prism`, which draws a face and a stroke per sample |
| A grid backdrop | `drawGrid(cam, { radius, step, stroke, opacity })`: grid lines in the floor plane (`z` for another height) that fade out radially from (`x`, `y`) in a few rings, diamonds in isometric. Token colour (`line` by default) at low opacity. **Draw it first**, under the solids: it has no depth. It is static; do not animate it (a shimmer or pan is ambient motion), fade it in with `opacity` like anything else |
| 2D content on a face | Give a solid a `top`: `{ markup, view: { width, height }, inset, opacity }`. `markup` is ordinary SVG (an icon's paths, `text`, rects) in its own `view` units (24 × 24 for an icon grid; stroke widths and font sizes in those units); it is fitted into the top face's bounding box less `inset`, centred, aspect kept, and turns with the camera, through a swivel. It is drawn inside the solid, so it is ordered and faded with it. For any horizontal plane at a height (a layer of a mock UI split along z), `drawOnPlane(cam, { x, y, z, w, d, view }, markup, opacity)`, drawn right after the solid below it; `planeMatrix(cam, plane)` gives the SVG matrix alone. Not drawn when the plane is edge on (elevation 0) |
| Labels | `labelAnchor(cam, { id, at: { x, y, z }, lines, lift, side, opacity })` → `{ markup, box }`: a dot on the point, a stem `lift` px up, the label above it (`side: "up"`, or beside the stem's top with `"right"` / `"left"`). Wrap and localize `lines` first (`wrapLabel`) |
| Pill tags | `labelPill({ id, x, y, lines, fontSize, fill, stroke, ink, opacity })` → `{ markup, box }`: a stemless rounded box of text centred on the screen point `x, y` (`project(cam, point)` plus an offset to pin it to the world). Colours are tokens; pick an `ink` that reads on `fill` (`onAccent` on `accent`). Return its `box` from `labelBoxes` with the anchors' |
| Several tokens | `tokensAlong(path, t, runs, draw)`: see below |

**The gate checks labels.** Return `labelBoxes: (t) => [box, …]` from the scene
(the `box` of each `labelAnchor` and `labelPill` you draw at `t`), and `motion-kit check` fails
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

## Bars with rolling values

`kit` also draws a row of a benchmark chart (`runtime/bars.mjs`). Template:
`examples/bars.scene.mjs` (three rows that reveal top to bottom, one step each).

| Need | Use |
|---|---|
| A hatched fill | `hatchPattern({ idPrefix, name?, stroke?, spacing?, width? })` returns `{ id, fill, markup }`: lines at 45° in a token colour (default `line`). Its id is `${safeId(idPrefix)}-hatch-${name}`, separate from clip-path IDs, so pass the `idPrefix` from `frame(t, { idPrefix, style })` and ensure prefixes stay unique after normalization; give each hatching its own `name` (letters, digits and `_`; no `-`, `title` or `desc`). Put `markup` (a `<defs>`) in the frame once, first, on every frame |
| An empty track | `drawTrack({ x, y, width, height, hatch, fill?, radius?, opacity?, id? })`: a rounded rect in the token `fill` (default `surface`) with the hatch over it |
| A bar | `drawBar({ x, y, width, height, p, fill?, radius?, trackRadius?, opacity?, idPrefix?, id?, trackWidth? })`: `width` is the bar's length when done (its value's share of the track's), the bar is `width * p` long and rounded at both ends as it grows. Pass the frame's `idPrefix`, a local safe row `id` (letters, digits and `_`, except `title` and `desc`), and the track's width to clip a short bar inside its pill; pass the track's `radius` as `trackRadius` whenever the track sets one explicitly. `p` is `barProgress(t, { start, duration }, style)`, which runs on the style's movement curve and is exactly 1 from `barEnd(run)` on |
| A value | `drawValue({ x, y, to, from?, p, format?, fontSize?, anchor?, family?, opacity?, id? })` draws `format(rollingValue(from, to, p))`: it shares the bar's raw progress, and exactly `to` once the bar has settled. A formatter may round to its final display early, so do not claim intermediate visible digits are synchronized. Without `format`, it rounds to a whole number (`to: 0.8` settles as `1`). `format` is yours (units, decimals, locale: `(v) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v) + " s"`) and returns a string |

Anchor the value at a fixed x with `anchor: "end"` so the digits do not push the
text sideways, and set `family` to a monospace face so they do not jitter as
they change (the style's own monospace face is a separate piece of work). The
bar's accent sits on the track's colour: declare `{ fg: "accent", bg: "surface",
min: 3, use: "the bar's fill on its track" }` and `{ fg: "line", bg: "surface",
min: 2.5, use: "decorative hatching on the track" }` in `contrastPairs`. Hatching that conveys information is a shape and needs 3:1.

**Bars settle inside each beat.** A bar grows once and rests, and its value
rolls with it, within a beat; several bars may share one. Put the step's `at` at least 50 ms after the last motion in the beat (including track entrance and every `barEnd(run)`), and start the next motion no earlier than 50 ms after `at`; the settled-frame rule in the
gate then holds. A value that keeps updating beside live footage is not this
part, and a bar that grows again or pulses while a step rests is ambient motion,
which the canon rules out.

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
| A reveal | `blurReveal(enter, { id, rise, blur }, ...markup)` with `enter = progress(t, start, 0.4, easings(style.motion).easeOut)`. The markup starts soft, transparent and `rise` units low (default 6) and sharpens into place; `blur` is the starting radius (default 4, at most 12). Any markup works, a `<text>`, a group, a card. The default region holds the blur when the element's painted bounds are at least 12 × `blur` units wide (50 units at the default blur) **and** at least 3 × `blur` units tall (it adds only one element height above and below). For a narrower or shallower element, a short label, a thin rule or an icon, a larger `blur`, or any shape whose stroke or markers reach past its geometry by more than that padding (a thick stroke on a small shape, at any size), pass `box: { x, y, width, height }` covering the painted bounds (all four finite; `width` and `height` positive; `x` and `y` may be anything) |
| Its filter id | `id: idPrefix + "-reveal-" + i`, one per revealed element. The gate reports ids shared across instances at its sampled times (it can miss a short reveal between samples), so keep the prefix, and every slice of a baked SVG has its own prefix |
| A highlighter | `highlightSweep(p, { x, y, width, height, token, opacity, radius })`: a band in a token (default `emphasis`) at 30 % that grows from `x` to `x + width` as `p` (eased) goes 0 → 1; its `token` is checked once the band is drawn. Draw it **before** the text; size it from `estimateWidth(line, fontSize)` plus padding each side (the estimate is generous; do not shrink it where wide glyphs such as a capital W may appear, since they can run past a shortened band. `examples/text-reveal.scene.mjs` takes 0.9 of it for its fixed lines only, checked by eye in the rendered frames; the gate does not compare glyph widths with the band) |

Rules that keep it inside the canon:

- **Settled means bare.** When `enter` reaches 1, `blurReveal` returns your
  markup with no group, no filter and no `<defs>`, so every step frame and the
  final frame are byte-identical to the same text drawn without the reveal, provided the scene finishes the reveal (the gate checks only that those frames are stable).
  Finish each reveal 50 ms or more before the step it belongs to, as with any
  beat; the gate's settled-step rule then holds. Do not wrap the call in your
  own filter or opacity.
- **Once per element, inside a beat.** A reveal runs 300–600 ms and never
  repeats. Stagger siblings 80–150 ms in reading order. A blinking cursor or any
  other loop is ambient motion and stays out; a static cursor is fine.
- **Reduced motion** shows the final frame, which is the settled text and the
  full band: no filter, no motion.
- **Renderers.** The live player (in-place patch), `bake`, PNG export (resvg,
  Chrome) and video use the same helper and filter parameters; the raster blur can vary with renderer, fonts and scale, and only one resvg frame is checked. A consumer that ignores SVG filters
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

## Code and a moving highlight

`kit` also walks through a snippet (`runtime/code.mjs`). Template:
`examples/code-steps.scene.mjs` (a short snippet; the band lands on one line
range per step).

| Need | Use |
|---|---|
| A panel of code | `codeBlock({ lines, x, y, width, maxHeight, fontSize, overflow, font })`, built once in the factory. A line is a string, or an array of strings and `{ text, role }` runs. The panel is as tall as its code; `maxHeight` is the room the picture has |
| Syntax tints | You supply the roles (a few patterns, or a build-time tool: there is no grammar). `CODE_ROLES` maps `code`, `keyword`, `string` and `comment` to style tokens; `roles: { name: { token, weight?, italic? } }` adds or replaces one. The defaults use `ink` and `muted`, told apart by weight and slant, because those read as text on `surface` in both themes of the neutral style; map a role to `accent` or `emphasis` only when the style meets 4.5:1 there (the gate says if it does not) |
| A fit rule | `overflow: "error"` (default) refuses a line wider than the block, `"wrap"` breaks it at a space (a word longer than the row is hard-broken) with the continuation indented, `"clip"` ends it with `…`. A snippet too tall for the picture is refused too. Each error names the line and the remedy. Text stays at 14 px or more |
| The band | `drawCode(block, t, moves, { ease })` with `moves = [{ lines: [3, 5], start, duration? }, …]` (1-based, inclusive; a number is one line). The first move is where the band appears (it fades in); each later one moves it from the range before. Pass `ease: easings(style.motion).easeStandard` from `frame(t, { style })` so it moves on the style's curve |
| Settled steps | `codeEnd(block, moves)` is when the last move is over; call it in the factory (it also checks the moves). Put each step's `at` at least 50 ms after the end of the move that leads to it: `codeEnd(block, moves.slice(0, i + 1)) + 0.1`; the next move starts at least 50 ms after that `at` |
| Contrast | `contrastPairs: codePairs(block)` (add the pairs of anything else you draw). The dimmed lines sit below 4.5:1 by design; the band's tint lowers the ratio a little, so check a style whose text is near 4.5:1 on `surface`. Only assigned Latin, Greek, Cyrillic and common symbols are accepted (precomposed letters included, e.g. `ế`, `ἄ`); other characters (CJK, emoji, combining marks, unassigned code points) are refused |
| An accessible text | `block.text` is the whole snippet, `block.rangeText(from, to)` a range: put the snippet in the scene's `description` and each range in its step's `detail` |
| The monospace face | `font` takes a comma-separated list of family names: unquoted ones are CSS identifiers (letters, digits, `_`, `-`, not starting with a digit) joined by spaces, anything else (`Hawaii 5-0`, a dot) is quoted, and CSS-wide keywords are refused; comments, `var()` and other CSS are refused. A style has no monospace field yet, so the kit's own stack (`CODE_FONT`) is used unless you pass one. The face must have a 0.6 em advance, the column the kit lays out; one with another advance (Iosevka's is 0.5 em) leaves gaps. resvg tries each name its parser reads in order (a missing face falls through to the next one), but its parser splits at commas, strips quotes and then trims, so a name it reads wrongly never matches an installed face: give identifier-safe names unquoted in a stack (`SF Mono`, not `"SF Mono"`), and quote only a name that needs it (one with a parenthesis or digit start) with the opening quote right after the comma and the closing quote right before the next comma or the end (`Fira Code,"Mono(Regular)", monospace`); a name that contains a comma cannot be used for PNG or video. Put the face installed on the render host first. Each run is placed by column, so the lines still align |

The band moves once per step and rests there; the leading edge goes first and the
trailing edge follows 70 ms later, so it stretches in flight when both edges travel the same way (a shared edge stays put) and gathers on
arrival. The lines under it are at full ink and the rest at 45 %, and each line
lights as the band reaches it. **One scene per snippet, one range per step**:
a scene is at most 12 s (8 s is the target), so a longer walkthrough is several
scenes, or a deck with one click per range. In Slidev the first range shows on arrival and each click moves to the next (n ranges, n − 1 clicks)
(`<AnimatedDiagram>` registers them); in Marp, PowerPoint or Keynote each step
is one slide from `export`, and the band is at rest on the range in every frame.
Write the steps' labels as what the range does (`stepLabelsInFrame: false`), not
as a copy of the code.

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

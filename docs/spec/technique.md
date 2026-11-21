---
title: motion-kit technique — normative specification
status: draft
last_updated: 2026-11-19
---

# motion-kit technique — normative specification

This is the authoritative contract for scenes, motion helpers, styles and
render targets. The design guidance (storyboards, timing taste, review
practice) stays in the skill references and is linked, not repeated:
[`technique.md`](../../skills/animated-diagram/references/technique.md),
[`motion-vocabulary.md`](../../skills/animated-diagram/references/motion-vocabulary.md),
[`styles.md`](../../skills/animated-diagram/references/styles.md),
[`interactivity.md`](../../skills/animated-diagram/references/interactivity.md),
[`qc.md`](../../skills/animated-diagram/references/qc.md),
[`scene-types.md`](../../skills/animated-diagram/references/scene-types.md),
[`formats.md`](../../skills/motion-render/references/formats.md),
[`video.md`](../../skills/motion-render/references/video.md).

**Conventions.** MUST / MUST NOT / SHOULD / MAY as in RFC 2119. **[gate]**
marks a rule `lib/check.mjs` or the CLI enforces; **[throws]** marks a rule the
runtime enforces by throwing; unmarked rules are by contract only. Citations are
`path:line` against the working tree of 2026-11-15; where code and skill docs
disagree, §12 records it.

## 1. Scene contract

A scene is a plain object (`runtime/scene.mjs:1-18`).

| Field | Type | Req. | Rule |
|---|---|---|---|
| `id` | string | MUST | Non-empty [throws] (`runtime/scene.mjs:43-44`). Scene types suffix the format: `<spec.id>-16x9` (`runtime/types/sequence.mjs:187`). Used as the default `<title>`/`<desc>` id prefix. |
| `width`, `height` | number | MUST | The viewBox, in user units [throws if missing]. |
| `duration` | number, s | MUST | Time of the final state. |
| `title` | string | MUST | Accessible name (`<title>`) [throws if empty]. |
| `description` | string | MUST | Accessible description (`<desc>`) [throws if empty]. |
| `steps` | `{at, label, detail?, id?}[]` | MUST | ≥ 1 step; `at` strictly increasing; `at ≤ duration` (+1e-9); every `label` non-empty; an `id`, if present, is a non-empty string unique within the scene [throws] (`validateScene`). The last step is the finished diagram. Page scripts address steps by `id` (§10.2); scene types copy a spec node's, hub's or spoke's `id`. |
| `frame(t, ctx)` | `(number, {idPrefix}) → string` | MUST | Inner SVG markup at `t` (§2). `ctx.idPrefix` is unique to the rendered instance; every id the frame defines (clip paths, gradients, masks, markers, filters) MUST start with it, as `${idPrefix}-name` [gate] G14. A frame that defines no ids MAY ignore `ctx`. |
| `stepLabelsInFrame` | boolean | MAY | `false` declares narrative steps whose labels are not drawn; exempts the scene from gate rule G10 (`lib/check.mjs:74`; used by `examples/custom-pulse.scene.mjs:137`, `brand/logo.scene.mjs:108`). |
| `contrastPairs` | `{fg, bg, min, use?}[]` | MAY | Token pairs the scene draws beyond `CONTRAST_PAIRS` (§6); the gate checks the style against them in both themes [gate] G12 (`lib/check.mjs`, rule 8; used by `examples/custom-pulse.scene.mjs`). Tokens MUST be known and `min` in [1, 21]. |
| `labelBoxes(t)` | `(number) → LabelBox[]` | MAY | The box of every label `frame(t)` draws, in the scene's own coordinates (`{id, x, y, width, height, stem?, opacity?}`; `labelAnchor` returns one, §4.9). Must be a function [throws]. The gate fails a scene whose labels overlap, whose stems cross a label or that leave the picture [gate] G15 (`lib/check.mjs`, rule 9; each box MUST be `{id, x, y, width, height}` with finite numbers [gate]; used by `examples/isometric-swivel.scene.mjs`). |
| `type`, `format`, `locale` | string | MAY | Set by scene types; recorded in the export manifest (`lib/export.mjs:75-77`). |

- A scene MUST be produced by either a registered scene type —
  `createScene(spec, {format, locale})` (`runtime/types/index.mjs:25-29`) — or a
  custom module whose default export is `(opts) → scene`, called by
  `sceneFromModule` (`runtime/kit.mjs`) with
  `opts = { ...options, format, locale, kit }`. `options` are the caller's
  serializable scene options, passed unchanged; option names `format`,
  `locale` and `kit` throw. `kit` is the flat exports of the `motion`, `svg`, `iso`, `style`, `scene` and `wrap` runtime modules (`KIT`); it has no `createScene`, scene types or player. Both paths
  run `validateScene`. The CLI (`--options`), the vendored gate and the Astro
  adapter call `sceneFromModule`, so one module with the same options, format
  and locale gives the same scene everywhere. A `build` page calls the factory
  with the same object, its `kit` being the bundled `KIT` (the same names as in
  Node: `test/runtime.test.mjs` checks), after the CLI has built the scene once
  through `sceneFromModule`.
- A custom module MUST take the runtime from `kit`, or import only from
  `runtime/` with single-line relative `import { … } from "./x.mjs";`
  statements and use only the export forms the inliner supports, or `build`
  throws (`lib/bundle.mjs:8-11,33,59`).
- `detail` SHOULD hold sentences; labels stay short (§7). `detail` feeds the
  player caption and screen-reader list (§10.2).

## 2. Time model and determinism

| # | Rule | Enforcement | Rationale |
|---|---|---|---|
| T1 | `frame(t)` MUST depend only on `t` and the scene's constants: no `Date`, `Math.random`, `performance.now`, no state carried between calls, no module-level mutable state. | [gate] G1 re-renders each `t`; G11 renders under stubbed clocks and scans the source (`lib/check.mjs`) | Random access: a player can jump, an exporter can write exactly one frame, video samples `t = f/fps` (`runtime/scene.mjs:14-17`). |
| T2 | Same `t` (and same style/options) MUST give byte-identical output. | [gate] G1 | Tests, diffs, caching and committed media all depend on it. |
| T3 | Callers MUST clamp `t` to `[0, duration]`; `renderSvg` does (`runtime/scene.mjs:70`). `frame` MAY assume a clamped `t`. | — | Defines "before start" and "hold". |
| T4 | Every number interpolated into markup MUST be rounded: `num(n, 2)` by default, 3 digits for `opacity`, 4 for scale factors (`runtime/svg.mjs:17-22,29,64`). `num` MUST throw on non-finite input and never emit `-0`. | [gate] G3; non-finite → G5 | 17-digit floats made "settled" frames differ by 1 ms (`skills/animated-diagram/references/technique.md:128-129`). |
| T5 | Visibility MUST be decided on rounded values: an element whose opacity rounds to 0 is omitted; an opacity that rounds to 1 is not written (`runtime/svg.mjs:28,39,68-72`). | by construction (`el`, `fade`) | Identical-looking frames must be identical bytes (opacity 0.9999 vs omitted). |
| T6 | Scenes MUST NOT use CSS transitions/animations or timers; the renderer owns the clock (`runtime/player.mjs:15`). | — | Exported frames would not match what plays. |
| T7 | Variation, if any, MUST derive from constants and `t` (seeded), never from runtime randomness. | [gate] G1, G11 | Same as T2. |

## 3. Formats and layout per format

Formats map a name to a viewBox (`runtime/scene.mjs:23-30`):

| Name | viewBox | Height |
|---|---|---|
| `16:9` | 960×540 | fixed |
| `4:3` | 960×720 | fixed |
| `1:1` | 720×720 | fixed |
| `9:16` | 540×960 | fixed |
| `wide` | 960×auto | computed by the scene type |
| `tall` | 360×auto | computed by the scene type |

- Layout MUST be computed per format from the shared spec and timings; output
  MUST NOT be produced by cropping or scaling another format's layout
  (`runtime/scene.mjs:22`).
- An unknown format MUST throw (`runtime/types/sequence.mjs:125`,
  `runtime/types/hub-spoke.mjs:92`, `examples/custom-pulse.scene.mjs:40`).
- Arrangement by aspect: "narrow" means `tall` or `W/H < 0.8` → column/tree;
  `W/H ≥ 1.5` → row (or 2-row snake when cells are < 96 px) for `sequence`;
  otherwise snake grid (`runtime/types/sequence.mjs:35-46`) or radial ellipse
  (`runtime/types/hub-spoke.mjs:40,59-73`). `timeline` runs its axis
  vertically when narrow and horizontally otherwise (`runtime/types/timeline.mjs:239`);
  `stack` is one column of layers with a rail on the right in every format.
- **Auto-fit text**: a type MUST try the largest font size and step down by
  1 px to `FONT_MIN = 14` (`runtime/parts.mjs:12`) until every label wraps
  into its budget; if none fits it MUST throw. Maxima: `sequence` 22 px fixed /
  16 px strips (`runtime/types/sequence.mjs:127`); `hub-spoke` 20 / 16
  (`runtime/types/hub-spoke.mjs:97`); `timeline` 22 / 16
  (`runtime/types/timeline.mjs:280`); `stack` 22 / 16
  (`runtime/types/stack.mjs:129`); `spec.fontSize` overrides the maximum.
- **Collisions**: a layout whose boxes overlap (6 px gap) or leave the canvas
  MUST throw rather than render (`runtime/types/hub-spoke.mjs:33-35,76-84,119`).
- Connectors MUST NOT cross labels; snake-grid row turns route as elbows
  outside the column (`runtime/types/sequence.mjs:101-119`); the narrow
  hub-spoke trunk runs outside the boxes (`runtime/types/hub-spoke.mjs:43-57`).
- Custom modules MUST either support every format or be checked with
  `--format` restricted to the ones they ship
  (`skills/animated-diagram/references/custom-scenes.md:34-35`).

Web breakpoint guidance (wide ↔ tall) is in
[`formats.md`](../../skills/motion-render/references/formats.md).

## 4. Motion primitives (`runtime/motion.mjs`)

All helpers are pure number → number functions (`runtime/motion.mjs:1-7`).
None overshoot.

### 4.1 Easing

`cubicBezier(x1, y1, x2, y2)` MUST reproduce CSS `cubic-bezier()` exactly
(`runtime/motion.mjs:24-55`):

- Polynomial coefficients `cx = 3x1`, `bx = 3(x2 − x1) − cx`, `ax = 1 − cx − bx`
  (same for y); `x(s) = ((ax·s + bx)·s + cx)·s`.
- For progress `p`: return 0 if `p ≤ 0`, 1 if `p ≥ 1`; otherwise solve
  `x(s) = p` by Newton's method from `s = p` (≤ 8 iterations, stop at
  |error| < 1e-7, abort if |x′| < 1e-7), then fall back to bisection on
  [0, 1] (≤ 60 iterations, interval < 1e-9); return `y(s)`.

| Export | Curve | Use |
|---|---|---|
| `easeOut` | `cubic-bezier(0, 0, .2, 1)` | entrances |
| `easeStandard` | `cubic-bezier(.4, 0, .2, 1)` | movement between visible states, fills, draw-on |
| `easeIn` | `cubic-bezier(.4, 0, 1, 1)` | exits |
| `linear` | `clamp01(p)` | mechanical progress only |

(`runtime/motion.mjs:57-63`.) Every ease MUST be monotonic on [0, 1] with
`ease(0) = 0`, `ease(1) = 1` (`test/runtime.test.mjs:20-31`). Bounce and
elastic curves MUST NOT be added (`runtime/motion.mjs:6`).

### 4.2 Progress

- `progress(t, start, duration, ease = easeOut)` = `ease(clamp01((t − start)/duration))`;
  holds 0 before `start` and 1 after; `duration ≤ 0` is a step at `start`
  (`runtime/motion.mjs:69-72`).
- `window01(t, start, end)` is the un-eased linear window
  (`runtime/motion.mjs:75-77`).
- Properties SHOULD be `lerp(a, b, progress(…))`; compose by multiplying
  progress values or stacking layers, never by mutation.

### 4.3 Critically damped spring

- Step response `s(τ) = 1 − (1 + ωτ)·e^(−ωτ)` for τ > 0, else 0; default
  ω = 12 rad/s (`runtime/motion.mjs:97-102`).
- **Settle snap**: once `ωτ ≥ SPRING_SETTLE_X = 9.24`, `s` MUST return exactly 1
  (`runtime/motion.mjs:86,100`). 9.24 solves `(1 + x)e^(−x) = 0.001`: the snap
  moves a 100 px travel ≤ 0.1 px, and settled frames become byte-stable.
- `springSettleTime(ω) = 9.24 / ω` (ω = 12 → 0.77 s; ω = 16 → 0.58 s)
  (`runtime/motion.mjs:105-107`). A spring started at `a` MUST settle by the
  next step's `at`: `a + 9.24/ω ≤ at` (§8).
- MUST be monotonic, never overshoot (`test/runtime.test.mjs:32-41`).
  Underdamped springs are out of scope.

### 4.4 Retarget

`springTo(t, from, changes, ω)` = `from + Σ (toᵢ − toᵢ₋₁)·s(t − atᵢ)` over
target changes in time order (`runtime/motion.mjs:121-129`). Exact by
superposition (the spring is linear time-invariant), continuous at every change,
still random-access (`test/runtime.test.mjs:42-51`). Frame-by-frame spring
simulation MUST NOT be used.

### 4.5 Split edges

`splitEdge(t, start, duration, lag = 0.07, ease = easeStandard)` →
`{lead, trail}`, where `trail` is the same curve delayed by `lag`
(`runtime/motion.mjs:139-144`). `trail ≤ lead` always
(`test/runtime.test.mjs:52-57`). Draw the shape from `trail` to `lead`; it
stretches in flight and lands at its own length. Lag SHOULD be 50–100 ms. The
move ends at `start + lag + duration`, which is what step timing MUST budget.

### 4.6 Stagger

`stagger(count, start, gap)` → start times `start + i·gap` in reading order
(`runtime/motion.mjs:150-152`). Gap SHOULD be 80–150 ms; one entrance SHOULD be
≤ `ENTRANCE_MAX = 0.6` s (`runtime/motion.mjs:10`). Neither is gate-enforced.

### 4.7 Geometry: arc length and draw-on (`runtime/svg.mjs`)

- `polyline(points)` → `{length, d, at(f)}`; `at` returns the point at fraction
  `f` of total arc length (`runtime/svg.mjs:92-113`).
- `cubic(p0…p3, samples = 64)` → `{length, d, at(f)}` with a 64-sample
  arc-length lookup table and binary search, so a marker moves at constant
  speed without a DOM in Node and browsers (`runtime/svg.mjs:119-152`).
- `drawOn(length, p)`: `null` for `p ≤ 0`, `{}` for `p ≥ 1`, else
  `stroke-dasharray: L L; stroke-dashoffset: L·(1 − p)`
  (`runtime/svg.mjs:159-163`). Callers MUST skip the element when it returns
  `null`: a zero-length dash with round caps paints a dot.
- Two-state elements (pending → active) MUST cross-fade two layers with
  opacities `1 − p` and `p` instead of interpolating colours, which would need
  literals (`runtime/parts.mjs:1-8,68,94,109`).

### 4.8 Several tokens (`runtime/svg.mjs`)

- `tokenPoints(path, t, runs)` → `{index, progress, point, run}[]` for each
  token in flight at `t`; `tokensAlong(path, t, runs, draw)` concatenates
  `draw(point, {index, progress, run})` for them. `path` is anything with
  `at(fraction) → point` (`polyline`, `cubic`, `path3`); `runs` is
  `{start, duration, ease?, path?, hold?}[]`, one per token, each on its own
  `path` if it has one and on `easeStandard` by default.
- A token is in flight while its eased progress is above 0 and below 1; with
  `hold` it stays at the end of its path once it has arrived. Both are pure
  functions of `t`: no token carries state from an earlier frame.
- Any number of tokens MAY move at the same time. The canon does not change:
  they MUST move only between settled steps, so every token has arrived (or is
  held still) at each step's `at` and the gate's settled-frame rule (G6)
  holds. A token MUST NOT loop or restart: a scene plays once (§2).

### 4.9 Isometric kit (`runtime/iso.mjs`)

For custom scenes that draw a 3D view; handed to them in `kit`. Pure
functions; a colour is a token name, resolved with `tok()` (G4 applies).

- **Camera.** `camera({azimuth, elevation, zoom, pan})` (degrees, pixels per
  world unit, and the screen position of the world origin; defaults: 45°,
  `ISO_ELEVATION` = atan(1/√2) ≈ 35.264°, 1, the screen origin). `elevation`
  MUST be in [0, 90], `zoom` > 0 [throws]. World: x east, y north, z up.
  The projection is orthographic:
  `x' = pan.x + zoom·u`, `y' = pan.y − zoom·(v·sin el + z·cos el)`,
  `depth = −v·cos el + z·sin el`, with `u = x·cos az + y·sin az` and
  `v = −x·sin az + y·cos az`. At 90° elevation the result does not depend on
  `z`: the plan view, which has north up at azimuth 0 (sine and cosine are exact
  at multiples of 90°); at the default 45° azimuth north points up and right.
  `projector(cam)` / `project(cam, p)` give `{x, y, depth}`; larger `depth` is
  nearer the viewer.
- **Swivel.** `lerpCamera(a, b, p)` interpolates every field linearly (`a` at
  `p ≤ 0`, `b` at `p ≥ 1`); `fitCamera(points, cam, {width, height, margin})`
  returns `cam` with the pan and zoom that centre and fit the points in what
  the margins leave. A swivel is a move between two settled steps (§8).
- **Solids.** `prism({points, h, z, fill, sides, shade, stroke, strokeWidth,
  opacity, id})` extrudes a convex footprint (any winding; stored
  counter-clockwise) from base height `z` by `h` ≥ 0; `box` (centred on x, y)
  and `slab` (default `h` 0.25) are rectangular prisms; `regularPolygon` makes
  a footprint. A non-convex, degenerate or too-small footprint, an unknown
  token or a negative height throws. `fill` is the token of the top face,
  `sides` of the side faces (default `fill`); `shade` (default `ink`, `null`
  for none) is layered over each side at an opacity from 0.10 to 0.26 by how
  far the face turns from screen left. Faces are `<path>`s outlined with
  `stroke`; only faces that face the camera are drawn (the top when elevation
  > 0, a side when its outward normal faces the camera and elevation < 90°).
- **Depth order.** `orderSolids(solids, cam)` returns the solids far to near.
  Two solids whose projections overlap are ordered by the axes that separate
  them (a footprint edge, or height when seen from above); where the axes
  disagree, or none separates them, they are not ordered. The result is a
  topological sort, ties and cycles broken by the nearer centre, then by input
  order: the same solids always give the same order. `drawSolids` draws in it.
- **Labels.** `labelAnchor(cam, {id, at, lines, fontSize, lift, side,
  opacity})` draws a dot on the projected point, a vertical stem `lift` pixels
  up and a label box above it (or beside its top), and returns the markup and
  the `LabelBox`. `labelProblems(boxes, {width, height, gap = 4})` lists the
  collisions G15 reports. Labels follow §7 (wrapped, localized, ≥ 14 px).
- **Paths.** `path3(points)` is a polyline through world points with its
  length in world units, so a token keeps a constant speed whatever the camera
  does when its progress is linear (`tokenPoints` defaults to `easeStandard`;
  pass `ease: linear`).

### 4.10 Connectors (`runtime/connectors.mjs`)

For custom scenes that tie pieces together; handed to them in `kit`. Pure
functions; a colour is a token name (G4 applies).

- **Path.** `connectorPath(points, {camera?})` is a route through flat points
  (picture pixels) or, with a `camera`, through world points projected by it.
  `at(f)`, `cut(f)` (the picture points up to `f`) and `tip(f)` (the point and
  the direction of travel, in radians) go by distance along the path, in the
  world under a camera, so a pulse on a linear `ease` keeps a constant world
  speed whatever the camera does. It throws for fewer than two points, a
  non-finite coordinate or a path of no length.
- **Connector.** `drawConnector(path, p, {stroke, width, dash, arrow,
  arrowSize, opacity, id})` draws the path up to fraction `p` (the eased
  progress of a draw-on) as a dashed polyline: nothing for `p ≤ 0`; the dash
  pattern (default `6 5`) starts at the path's start, so dashes stand still as
  the line grows, and `p ≥ 1` is the dashed line it rests as. An open-V
  arrowhead (default on) rides the leading end and fades in over the first
  tenth of `p`.
- **Junction.** `drawJunction({at, camera?, plane, size, lit, fill, stroke,
  litFill, litStroke, strokeWidth, opacity, id})` draws a diamond, a square
  turned 45°, `size` pixels from centre to corner. `plane: "screen"` stands on
  the picture; `"floor"` lies in the floor plane of an iso view: the same
  diamond flattened by `sin(elevation)`, full in plan view. `lit` (0..1)
  cross-fades the reached layer over the resting one. It throws for a size of
  0 or less and for another plane.
- **Pulse.** `drawPulse(path, t, run, {color, radius})` is a light that
  travels the connector once. `run` is `{start, duration, lag?, ease?, hold?}`:
  the head takes `duration` s on `ease` (default `easeStandard`) and the tail
  follows `lag` s later (default `PULSE_LAG`, 0.12 s) on the same curve, so the
  light stretches in flight and gathers at the end (split edges, §4.5). The
  head has a glow (three halos of one token, fainter outward) and the tail
  fades toward its trailing end. It grows in over the first tenth of its life
  and, unless held, fades over the last sixth. It draws nothing before `start`
  and, without `hold`, from `pulseEnd(run)` = `start + duration + lag` on; with
  `hold` the head stays lit at the end of the connector. `pulseHead(t, run)` is
  the head's fraction of the path, for lighting a target as the pulse passes.
- **Canon.** A pulse runs once, in a step's beat, like a token (§4.8): every
  pulse of the beat is over (`pulseEnd`) at least 50 ms before the step's `at`,
  its target has filled, and nothing repeats while a step rests, so the
  settled-frame rule (G6) holds. Several pulses may run in one beat.

## 5. Markup

- Text and attribute values MUST be escaped (`& < > " '`) via `esc`, `text` or
  `el`/`attrString` (`runtime/svg.mjs:10-14,24-33,45-57`). Labels MUST NOT be able
  to inject markup (`test/runtime.test.mjs:118-124`).
- `el(tag, attrs, …children)` treats children as trusted markup; untrusted
  strings MUST go through `text()`/`esc()`.
- Output MUST be well-formed: balanced tags, no stray `<`, no bare `&` [gate] G2.
- Icons are path data on a 24×24 grid supplied in the spec; motion-kit ships no
  icon set (`runtime/parts.mjs:14-34`). Glyphs are ≤ 3 characters
  (`runtime/parts.mjs:42`).

## 6. Tokens, styles, themes and contrast (`runtime/style.mjs`)

- Scenes MUST NOT contain colour literals [gate] G4. Colours MUST be
  `tok(name)` → `var(--mk-<name>)`; an unknown name throws
  (`runtime/style.mjs:52-55`). Besides tokens, a colour attribute (`fill`,
  `stroke`, `stop-color`, `color`, `flood-color`, `lighting-color`) or colour
  property (in `style="…"` or a `<style>` element: those, `background` and
  any `*-color`) MAY hold only `url(#…)` references and the keywords `none`,
  `currentColor`, `transparent`, `inherit`, `initial`, `unset`, `revert`,
  `revert-layer`, `context-fill` and `context-stroke`. None of them names a
  colour, so they look the same under every style and theme; `transparent`
  is allowed because it paints nothing in either theme. Named colours
  (`red`), hex, colour functions and other custom properties (`var(--brand)`,
  `var(--mk-accent, red)`) are literals. Text content is not checked: a label
  may say "#1".
- Tokens (`runtime/style.mjs:14-23`): `bg`, `surface`, `ink`, `muted`, `line`,
  `accent`, `onAccent`, `emphasis`. Roles: see
  [`styles.md`](../../skills/animated-diagram/references/styles.md). Exactly one
  element at a time SHOULD carry `emphasis`.
- A style is data: `{name, font, radius, stroke, motion, light: {token: #rrggbb}, dark: {…}}`.
  `normalizeStyle` fills missing fields from `NEUTRAL`
  (`runtime/style.mjs:25-50,58-77`) and MUST throw on an unknown token or a
  non-`#rrggbb` value (`runtime/style.mjs:70-73`). If `dark` is absent, dark
  takes the `light` overrides on top of neutral dark (`runtime/style.mjs:66`).
- **Live** output MUST carry tokens as CSS custom properties on the container
  (`runtime/player.mjs:52`, `lib/build.mjs:39-40`) so light/dark can switch
  without re-rendering. **Standalone** output MUST resolve every token to a
  literal (`runtime/scene.mjs:84`, `runtime/style.mjs:86-93`), because slide
  apps, rasterizers and image viewers ignore CSS variables; an unresolvable
  token throws.
- **Contrast** (`runtime/style.mjs`, `checkContrast`, WCAG relative
  luminance): in both themes, every pair in `CONTRAST_PAIRS`, the token pairs
  the scene types and shared parts draw where the pair carries meaning in a
  step frame. Text ≥ 4.5:1 — `ink`/`muted` on `bg` and `surface`, `onAccent`
  on `accent`; shapes ≥ 3:1 — `line`, `accent`, `emphasis` on `bg`, and
  `emphasis` on `accent` (the ring marking the current node sits 3.5 units
  from the reached node it surrounds, and tells "here" from "reached" without
  hue). `CONTRAST_EXEMPT` lists, with a reason each, the pairs left out:
  `line` on `surface` (an outline is told from the canvas outside it),
  `accent` on `surface` and `emphasis` on `surface` and `accent` on `line`
  (only in motion), `onAccent` on `emphasis` (only the logo; logos are exempt
  from WCAG 1.4.11). A scene adds the pairs it draws besides through
  `contrastPairs` (§1). `motion-kit check` MUST fail when the selected style
  violates any shared pair, once per run, or a scene's own, per scene [gate]
  G12 (`lib/gate.mjs`). `neutral` MUST pass (`test/runtime.test.mjs`).
- motion-kit ships only `neutral` (`styles/neutral.json`); brand styles MUST
  live in the consumer repo.

## 7. Labels, wrapping and locales

- SVG text does not wrap: every layout MUST declare a character budget and
  wrap with `wrapLabel(label, maxChars, maxLines = 2)` (`runtime/wrap.mjs:9-37`).
- Breaking: at whitespace and after `/`; a standalone separator
  (`/ – — & + |`) sticks to the preceding word so no line starts with it
  (`runtime/wrap.mjs:13-20`). No leading spaces.
- `wrapLabel` MUST throw on a single part longer than `maxChars` or more than
  `maxLines` lines (`runtime/wrap.mjs:24,33-35`) — a long translation fails
  the check instead of spilling out. [throws]
- Budgets use 0.56 × font size per character (`runtime/types/sequence.mjs:33`,
  `runtime/types/hub-spoke.mjs:31`, `runtime/wrap.mjs:40-42`). Layouts SHOULD
  budget for Dutch/German being ~30 % longer than English.
- Any string MAY be localized: `{en: "…", nl: "…"}`. `localize(value, locale)`
  returns a plain string unchanged or the exact requested translation. A missing
  or empty translation throws; null/undefined optional copy returns "".
- Labels are labels; sentences go in `detail`. Font size MUST NOT go below
  14 px at 1× (§3).
- A scene that places labels in a projected or moving view (§4.9) SHOULD
  declare their boxes in `labelBoxes` (§1); the gate then fails overlapping
  labels in every format and locale (G15).
- Every shipped locale × format MUST pass the gate. `check` derives locales
  from a `.json` spec's localized objects (keys `xx` or `xx-YY`)
  (`lib/gate.mjs`). Modules export a non-empty unique `locales` array (default
  `["en"]`); explicit `--locale` flags override either source.

## 8. Steps and settled frames

- `steps[i].at` is the time step *i* is fully shown; its frame is what a slide,
  a step button and Slidev show.
- Step frames MUST be settled: nothing moves at `at` [gate] G6. The step's
  own motion MAY end exactly at `at` but MUST be at rest there
  (`frame(at − 1 ms) === frame(at)`), and nothing MAY change in the 50 ms
  after it (`frame(at + δ) === frame(at)` for δ = 1, 15, 30 and 45 ms, up to
  the next step; `SETTLE_AFTER` in `lib/check.mjs`). The look-ahead is what
  catches slow motion passing through `at`, which rounding hides over 1 ms.
- Authoring rule: the next motion MUST NOT start earlier than 50 ms after
  `at` (the "pause between beats" in
  [`motion-vocabulary.md`](../../skills/animated-diagram/references/motion-vocabulary.md)),
  and anything that fades out by a step (a travelling dot) MUST reach 0 by
  `at`. Scene types satisfy this by construction: `PERIOD = HOP + FILL + 0.05`
  (`runtime/types/sequence.mjs:24-29`), step = fill end
  (`runtime/types/sequence.mjs:147`, `runtime/types/hub-spoke.mjs:149`).
  Springs and split edges MUST budget their settle time and lag (§4.3, §4.5).
- The step shown at `t` is the last step with `at ≤ t` (tolerance 1e-9), or
  −1 before the first (`runtime/scene.mjs:93-99`).
- Unless `stepLabelsInFrame === false`, every word of every step label MUST be
  visible in the final frame [gate] G10.
- Timeline constants SHOULD be named and every event derived from them
  (pattern in [`technique.md` §3](../../skills/animated-diagram/references/technique.md)).

## 9. Scene types

Registered types: `sequence` (2–12 nodes), `hub-spoke` (2–10 spokes),
`timeline` (2–8 events), `stack` (2–8 layers), `state-machine` and
`request-journey` (2–8 nodes; graph bounds in §11.1), and `flowchart` (2–12
nodes, 1–20 edges, layout stored in the spec). Fields and storyboards:
[`scene-types.md`](../../skills/animated-diagram/references/scene-types.md).
Normative points:

- Out-of-range node/spoke/event/layer counts, a missing hub and an unknown type MUST throw
  (`runtime/types/sequence.mjs:123`, `runtime/types/hub-spoke.mjs:89-90`,
  `runtime/types/timeline.mjs:203-231`, `runtime/types/stack.mjs:117-126`,
  `runtime/types/index.mjs:27`). A timeline event without `when` or `label`, a
  past event after a planned one, planned events without `now`, a stack layer
  without `label` and a stack `direction` other than `down`/`up` MUST throw.
- A new type MUST export `(spec, {format, locale}) → scene`, be registered in
  `SCENE_TYPES`, and get a gate run across every format and locale
  (`AGENTS.md:59-61`). A custom shape SHOULD be promoted to a type once used twice.

## 10. Render targets

### 10.1 `renderSvg(scene, t, options)` (`runtime/scene.mjs:68-85`)

Every target goes through this one function. It MUST emit `<svg>` with
`viewBox`, `role="img"`, `aria-labelledby` pointing at `<title>` and `<desc>`
(ids prefixed by `idPrefix ?? scene.id`), and the style's font.

| Option | Effect |
|---|---|
| `standalone` | Writes `width`/`height` (× `scale`) and resolves tokens to literals. |
| `theme` | `light`/`dark` for resolution or inline vars. |
| `live` | Omits inline vars; the container supplies them. |
| `background` | Paints a full-size `bg` rect behind the diagram. |
| `idPrefix` | Prefix for every id in the output: `<title>`/`<desc>`, and the scene's own through `frame(t, { idPrefix, style })`. Made a safe id token (`safeId`: letters, digits, `_`, `-`). MUST be unique per page when several diagrams share it. |

### 10.2 Live player (`runtime/player.mjs`)

| Requirement | Source |
|---|---|
| MUST touch the DOM only when mounted; scenes stay pure, the player owns the clock (`requestAnimationFrame`, wall time). | `runtime/player.mjs` (`mountPlayer`, `tick`), `AGENTS.md` |
| Initial state MUST be the final frame. A server/no-JS fallback SHOULD be `playerMarkup(scene, { id, … })` inside a `.mk-player` container, with `PLAYER_CSS` in a `style[data-mk-player-css]` and the tokens from `themeCss(selector, style, theme)`: the markup the player builds, with the controls `inert`. The step list and the colours then exist without JavaScript, and mounting moves nothing. A plain final-frame SVG MAY be used instead. | `runtime/player.mjs` (`view`, `playerMarkup`, `themeCss`), `lib/build.mjs`, `adapters/astro/AnimatedDiagram.astro`, `test/player.test.mjs` |
| Autoplay `visible` (default): plays once from 0 when ≥ 40 % of the diagram, or ≥ 40 % of the viewport's height, is in view (decided from the intersection, not `isIntersecting` alone), then holds; `none` disables. MUST NOT loop. | `runtime/player.mjs` (`shown`, `THRESHOLDS`) |
| While a playing diagram does not intersect the viewport (scrolled away, `display: none`), its clock MUST stop and no frame be drawn; when it intersects again, playback resumes from the same time. Visibility is observed until `destroy()`. | `runtime/player.mjs` (`onVisibility`, `run`) |
| Each frame MUST update the stage's SVG in place (`patchMarkup`): nodes that persist between frames are kept, only changed attributes and text are written, and nodes are added, removed or replaced (by position; a different tag replaces the subtree) only where the markup's structure changes. The DOM after each frame MUST equal what `innerHTML` would build from the same markup. Markup outside the subset the patch reproduces exactly (comments, CDATA, single-quoted or bare attributes, named entities beyond the XML five, elements inside `<title>`, `<desc>` or `<foreignObject>`, HTML elements that leave SVG) MUST fall back to `innerHTML` for that frame. Because nodes persist, a CSS transition on the diagram would run between frames: T6 keeps them out of scenes, and pages MUST NOT add them. | `runtime/patch.mjs`, `runtime/player.mjs` (`draw`), `test/patch.test.mjs`, `test/player.test.mjs`, `scripts/bench-player.mjs` |
| Play/pause MUST always be present when motion can play (WCAG 2.2.2); label shows Play/Pause/Replay. | `runtime/player.mjs` (`playLabel`, `draw`) |
| Every control (buttons, scrubber) MUST be at least 44 × 44 px. The caption and the play button MUST keep the size of their longest content, so playback does not shift the layout. | `PLAYER_CSS` (`.mk-btn`, `.mk-scrub`, `.mk-caption`, `.mk-play`) |
| One `<button>` per step, labelled `N. label`; activating it jumps by default. `animateSteps: true` opts buttons and keyboard navigation into `playToStep`. `aria-current="step"` marks the active step. | `runtime/player.mjs` |
| Optional range scrubber (`aria-label`, default "Timeline"); input pauses and seeks. | `runtime/player.mjs` (`options.scrubber`) |
| Caption shows the active step's `detail` and is `aria-hidden`; a visually hidden ordered list of all steps (`label: detail`) MUST be present for screen readers. | `runtime/player.mjs` (`caption`, `sr`) |
| Keyboard on the focusable stage, a `role="group"` named by the scene title and described by a visually hidden hint (`labels.keys`): ←/→ step, Home/End first/last, Space play/pause. Every element with `tabindex="0"` has a role. | `runtime/player.mjs` (`view`, `keydown` handler) |
| Visible focus style for the stage and every control. | `PLAYER_CSS` (`:focus-visible` rule) |
| `prefers-reduced-motion: reduce`: final frame, no autoplay, no play button, Space ignored. | `runtime/player.mjs` (`reduced`) |
| Theme: `options.theme`, else follows `prefers-color-scheme` live. Tokens MUST be set one custom property at a time, keeping the container's other inline CSS. | `runtime/player.mjs` (`applyTheme`, `themeQuery`) |
| The player stylesheet MUST be in the document whenever a player mounts: it is added to `<head>` unless a `style[data-mk-player-css]` is present, so a page swap that removed it cannot leave players unstyled. `injectCss: false` opts out. | `runtime/player.mjs` (`ensureStyle`), `test/player.test.mjs` |
| Ids: each player renders with its own prefix, `options.id`, else `scene.id` plus a per-page counter, so two players of one scene share no ids. | `runtime/player.mjs` (`prefix`) |
| `playToStep(ref)` MUST play forward from the current time, clamp to the target step's exact `at` and hold. Backward, same-time and reduced-motion calls MUST jump. `seekStep(ref)` jumps. `ref` is a zero-based index or a step `id`; an invalid index or unknown id throws `RangeError` (`stepIndex`). Retargeting replaces the target; `play()` continues to duration; `seek(t)` cancels playback. | `runtime/player.mjs`, `runtime/scene.mjs`, `test/player.test.mjs` |
| `destroy()` MUST cancel the animation frame, disconnect visibility observation, remove theme listening and remove this controller's capture entry. | `runtime/player.mjs`, `test/player.test.mjs` |
| **Capture hook**: the controller `{seek, play, pause, seekStep, playToStep, destroy, time, scene}` MUST be exposed at `globalThis.__motionKit[options.id ?? scene.id]`. | `runtime/player.mjs` |

UI strings MAY be localized via `options.labels`: a flat `{ play, pause, replay, steps, scrubber, keys }` object (`steps` names the controls group, `keys` is the stage's keyboard hint), or a dictionary keyed by locale (`{ en: {…}, nl: {…} }`) resolved with `options.locale`, then its language subtag, then `en`, then the first entry. Missing keys keep the English defaults (`resolveLabels`, `runtime/player.mjs`).

Keyboard step changes (←/→/Home/End) MUST be announced through a visually hidden `role="status"` polite live region (`N. label: detail`); autoplay, pointer and scrubber use stay silent.

`mountPlayer` MUST release any player already mounted on the same container (`destroy()`), so remounting never leaks clocks, observers or capture entries. The build output passes `locale` through, so label dictionaries resolve there too; the Slidev adapter announces each click's step through the same kind of live region.

The Astro adapter mounts each diagram once, tears the players down on `astro:before-swap` and mounts the new page's diagrams on `astro:page-load`. Its root element exposes the controller as `.controller` from mount, and dispatches `motion-ready` (bubbling, `detail.controller`) or `motion-error` (`detail.error`) once the page's own scripts and their `DOMContentLoaded` and `astro:page-load` handlers have run, so a script placed after the diagram can still listen. Its `id` prop sets the element id, the capture-hook key and the id prefix; it MUST be a safe id token, used once per page, or the build fails.

### 10.2.1 Custom element (`adapters/element/motion-diagram.mjs`)

- Vendoring with `--adapter element` MUST copy an unbuilt module importing the
  adjacent vendored runtime. Importing it in a browser defines `<motion-diagram>`.
- The spec MUST come from the `spec` JSON attribute, a child
  `script[type="application/json"]`, or a `src` URL, in that order. URLs resolve
  against the document base URI. `format` and `locale` select the scene;
  `theme` and JSON `style-spec` configure the player; HTML `style` remains CSS.
- Supplied final-frame child markup MUST remain visible without JavaScript,
  while loading and on errors. Only a successful mount hides the fallback.
- `controller` MUST expose the mounted player, or be null when unmounted.
  `motion-ready` carries `detail.controller`; `motion-error` carries `detail.error`.
- Observed attribute changes MUST remount. Disconnection MUST abort loading,
  destroy the player and restore the fallback; reconnection mounts afresh.
  Superseded asynchronous loads MUST NOT mount or publish errors.

### 10.2.2 Page links (`runtime/links.mjs`)

Helpers that drive a player controller from the page around it. They MUST
touch the DOM only when called, never move focus, never change layout (the
only marks are `aria-current="step"` attributes), and return a `dispose()`
that removes every listener, observer and mark they added.

| Requirement | Source |
|---|---|
| A step reference (`data-mk-step`, or a number) MUST resolve to the step with that `id`, else to a whole-number index; an unknown id or an index out of range throws `RangeError` when the helper binds. | `runtime/links.mjs` (`stepRef`, `sectionSteps`), `test/links.test.mjs` |
| `scrollSteps(controller, sections, options)`: a section's step is its `data-mk-step`, else its position. The active section MUST be the last one, in order, whose top has reached a line at `line` (default 0.5) of the viewport's or `root`'s height (`activeSection`), observed with one IntersectionObserver whose root margin ends at that line. Before the first section nothing changes. | `runtime/links.mjs` (`scrollSteps`, `activeSection`) |
| Moving one section forward to a later step MUST play to it (`playToStep`); every other change (back, skipping, the first section, `animate: false`, `prefers-reduced-motion: reduce`) MUST jump (`seekStep`); a change to the same step calls nothing (`scrollMove`). The diagram MUST only rest on settled steps: no continuous scrubbing. | `runtime/links.mjs` (`scrollMove`), `test/links.test.mjs` |
| `linkSteps(controller, rootOrElements, options)`: every element with `data-mk-step` (under the root, or given) MUST select its step on `pointerenter` (not touch), `focusin` and `click`, so keyboard focus selects the same step as hover. A selection jumps; `animate: true` plays forward unless reduced motion. With `restore: true`, once neither hover nor focus is on a term, the frame shown before the preview returns (`seek`), unless a click committed a step. | `runtime/links.mjs` (`linkSteps`), `test/links.test.mjs` |
| Without IntersectionObserver, `scrollSteps` MUST do nothing (the text still reads). | `runtime/links.mjs` |

### 10.3 Self-contained HTML (`motion-kit build`, `lib/build.mjs`)

- MUST be one document with the runtime inlined by `lib/bundle.mjs`, no
  external scripts, stylesheets or fetches (`test/cli.test.mjs:31-37`), so it
  works under `connect-src 'none'` and from `file://`.
- MUST pre-render the player's first state (`playerMarkup`, `PLAYER_CSS`,
  `themeCss`) and set `<html lang>` to the scene locale (`lib/build.mjs`).
- A custom module is built with the caller's `--options` and `kit`: the
  runtime's `kit` module is a bundle entry, and its `KIT` is what the module
  receives, the isometric helpers (§4.9) included. The page-link helpers
  (§10.2.2) are bundled too (`MotionKitRuntime.scrollSteps`,
  `MotionKitRuntime.linkSteps`).
- The CLI MUST refuse a scene that fails the gate (`cli/motion-kit.mjs:112-113`)
  and bundled code containing `</script>` (`:115`).
- The inlined runtime MUST render the same bytes as Node
  (`test/runtime.test.mjs:150-160`).

### 10.4 Baked SVG (`motion-kit bake`, `runtime/bake.mjs`)

- MUST contain no JavaScript.
- Sample at `fps` (default 15) for `f = 0…⌈duration·fps⌉`, `t = min(f/fps, duration)`
  (`runtime/bake.mjs:18-23`); render standalone (tokens resolved); merge
  identical consecutive frames (`:25-27`); each slice lasts until the next one
  starts (`:30`).
- Each slice is a `<g class="mk-f">` made visible by a `steps(1,end)` CSS
  animation delayed `0.3 s + start`; the last slice holds (`mk-hold`, fill
  forwards) (`:35-47`). Plays once; MUST hold the final frame.
- Under `prefers-reduced-motion: reduce` only the final slice is visible (`:39`).
- Slices share one document: a slice whose markup defines ids is rendered with
  its own prefix (`<idPrefix>-<n>`, base `mk-bake` or `options.idPrefix`).
- One theme per file; for theme-following embeds publish a light and dark file
  (`README.md:21-29`, `scripts/render-media.sh`).
- Size grows with fps × duration; README use SHOULD lower fps to 10–12.

### 10.5 Step export (`motion-kit export`, `lib/export.mjs`)

- MUST refuse a scene that fails the gate (`cli/motion-kit.mjs:125-126`).
- One standalone SVG per step at exactly `steps[i].at`, named
  `NN-<slug(label)>.svg` (`lib/export.mjs:54-57`); tokens resolved
  (`test/cli.test.mjs:26`); same viewBox for every frame so slides register.
- `--png`: PNG per frame at `--scale` (default 2) via resvg, else headless
  Chrome; fails up front without a rasterizer (`cli/motion-kit.mjs:127`,
  `lib/raster.mjs:39-64`). `--theme dark` resolves dark tokens; `--background`
  makes the canvas opaque (transparent by default).
- `--qc`: frames at `max(0, at − 0.2)` and `at + 0.2` (not after the last step)
  under `qc/` (`lib/export.mjs:58-65`).
- `index.html` contact sheet: steps, QC row, a phone row and the human review
  checklist (`lib/export.mjs`, `contactSheet`). The phone row MUST show the
  scene built for the `tall` format, in the same locale, options, style and
  theme, at 360 px (`qc/phone.svg`, manifest `kind: "phone"`); when the tall
  layout cannot be built, it shows the exported frame and says why.
- `manifest.json` MUST contain no timestamps: tool, version, scene, type,
  format, locale, scene options, size, duration, style, theme, a 16-hex input
  hash (source file + style + scene options), source commit, source dirty
  flag, render settings, file list (`lib/export.mjs`). Two exports of the
  same inputs MUST be equal (`test/cli.test.mjs`).
- `sourceCommit` is the short `HEAD` of the repository holding the source
  file. `sourceDirty` is `true` when that file differs from it (modified,
  staged or untracked: `status --porcelain -- <file>` is not empty), `false`
  when it does not, and `null`, like `sourceCommit`, outside a repository.
  Only the source file counts: modules a custom scene imports, the style file
  and the options file do not (the input hash covers the style and options).
- A re-export into the same folder MUST replace the previous one: files the
  folder's previous `manifest.json` listed and the new one does not are
  removed, so the folder holds what the new manifest lists. Files no manifest
  listed MUST NOT be touched; the export names them in a warning on stderr
  (`lib/export.mjs`, `test/cli.test.mjs`).

### 10.6 Video (`motion-kit video`, `lib/video.mjs`)

- Frame `f` maps to `t = clamp(f/fps − lead, 0, duration)`; total frames
  `round((lead + duration + hold)·fps)`; defaults fps 30, scale 2, hold 1.5 s,
  lead 0.25 s (`lib/video.mjs:32-36,45`).
- Each frame: standalone SVG with opaque background → PNG → ffmpeg stdin; no
  per-frame files; a repeated `t` reuses the previous PNG (`:44-51`).
- Encoders by extension (`:18-24`): MP4 `libx264 -preset slow -crf 18
  -pix_fmt yuv420p -movflags +faststart`, padded to even dimensions; WebM
  `libvpx-vp9 -crf 32`; GIF two-pass palette, ≤ 20 fps, Bayer dither, loops.
- Missing `ffmpeg` MUST fail with an install hint (`:31`). Output is silent.
- Same inputs ⇒ same frames; encoded bytes are only stable per machine/ffmpeg
  version.

### 10.7 Adapters and vendoring

- **Slidev** (`adapters/slidev/AnimatedDiagram.vue`): registers `N − 1` clicks
  itself (`:67-72`); forward by one click animates from the previous step's
  `at` to the next, any other move seeks (`:93-100`); print/export, overview
  and reduced motion show the settled step frame (`:65`).
- **Astro** (`adapters/astro/AnimatedDiagram.astro`): server-renders the
  player's first state (§10.2) and mounts the player. It takes a `spec`, or a
  custom module by path (`module`, a `/src/…/*.scene.mjs|js` file found with
  `import.meta.glob`, loaded on demand in the browser) with its `options`;
  `theme` (`light`/`dark`, else the system), `style` (token data), `id`,
  `scrubber`, `labels`, `class`. Props MUST be serializable (a spec or a module
  path, not a scene). The player stylesheet is emitted once per page; each
  instance carries its tokens and a page-unique id (`mk-<scene.id>-<n>` unless
  `id` is given). It fails the build for a missing module, options with a spec,
  or an invalid theme.
- **Vendor** (`cli/motion-kit.mjs`, `vendor` command): copies `runtime/`, one
  adapter, `lib/check.mjs`, `lib/gate.mjs`, `lib/load.mjs` and the full MIT
  `LICENSE`; writes `check.mjs`, which runs the same gate as `motion-kit
  check` (§11) with `--format`, `--locale`, `--style` and `--options`, and
  `MOTION_KIT_VERSION`. Consumers MUST retain `LICENSE` and the
  SPDX headers when redistributing vendored files. Vendored files MUST NOT
  be edited in the consumer.

## 11. The gate

`checkScene(scene)` (`lib/check.mjs`) samples 121 evenly spaced times
(`SAMPLES = 120`) and stops collecting after 13 problems.
`motion-kit check` and the vendored `check.mjs` both run `checkFiles`
(`lib/gate.mjs`): every file × format (all six unless `--format`, repeatable)
× locale (`--locale`, repeatable; else every locale a spec's strings carry, and
`en` for a module, §7), with `--options` for modules, plus the style contrast
check. A file that cannot be read, parsed or built fails on its own and the
remaining files are still checked; the exit code is 1 on any failure. `npm run gate` = unit tests +
`check` over `examples/` and `brand/` (`package.json:15-18`).

| ID | Rule | Code | Rationale |
|---|---|---|---|
| G1 | Rendering the same `t` twice MUST yield identical bytes. | `lib/check.mjs:41-42` | Determinism (T1/T2). Catches clocks/randomness and call-to-call state; cannot catch state that is consistent between two calls. |
| G2 | Each sampled frame MUST be well-formed (balanced tags, no stray `<`, entities only `amp lt gt quot #39 #n`). | `:12-31,43-44` | Escaping failures and broken markup break every target. |
| G3 | No number with ≥ 5 decimals in the full SVG. | `:45-46` | Rounding (T4). |
| G4 | No colour literal in `frame()` markup: colour attributes and properties hold only tokens, `url(#…)` and the colourless keywords of §6; no hex or colour function (`rgb()`, `hsl()`, `oklch()`, …) in any attribute or `<style>`. Id references (`url(#…)`, `href="#…"`) are not colours; text content is not checked. | `lib/check.mjs` (`findColourLiteral`) | Token-only colours: themes and brand styles must work everywhere. |
| G5 | No `NaN`, `undefined`, `Infinity` in `frame()` output. | `:50` | Silent geometry bugs. |
| G6 | For every step, `render(at)` equals `render(at − 1 ms)` and `render(at + δ)` for δ = 1, 15, 30, 45 ms (before the next step). | `lib/check.mjs` (rule 2, `SETTLE_AFTER`) | Settled step frames (§8); the 45 ms look-ahead sees slow motion that rounding hides over 1 ms. |
| G7 | First frame ≠ last frame. | `:61-63` | Something must animate. |
| G8 | `render(duration + 5) === render(duration)`. | `:65` | Holds the final frame. |
| G9 | `duration ≤ 12` s. | `:68` | Hard limit; authoring target ≤ 8 s. |
| G10 | Every word of every step label (escaped, trailing `/` stripped) appears in the final frame's text, unless `stepLabelsInFrame === false`. | `:72-77` | Step buttons and slides refer to things the viewer can see. Word-level, so it does not prove the label is contiguous. |
| G11 | Every sampled frame MUST render the same bytes under two stubbed clocks as under the real one: `Date`, `performance.now`, `Temporal.Now` and `Math.random` fixed at 1970 and 0, then at 2100 and ≈ 1, the globals restored afterwards. `frame.toString()` MUST NOT contain `Date.now`, `new Date`, `Math.random`, `performance.now`, `Temporal.Now`. | `lib/check.mjs` (rules 1 and 6) | T1. The stubbed render catches reads in the helpers a frame calls; the source scan, code paths the samples miss. A reference taken before the check runs (`const D = Date` at import) escapes the stub. |
| G12 | Style passes WCAG contrast in both themes for every pair in `CONTRAST_PAIRS` (once per run) and for each scene's `contrastPairs` (per scene). | `lib/gate.mjs`, `lib/check.mjs` (rule 8), `runtime/style.mjs` (`checkContrast`) | Legibility in light and dark, for the pairs actually drawn (§6). |
| G13 | Scene construction succeeds for the format × locale (validation, fit, collisions, wrapping). | `lib/gate.mjs` | Reject, don't invent: a broken picture never renders. |
| G14 | Rendered with two different `idPrefix` values, sampled frames share no `id`. | `lib/check.mjs` (rule 7) | Two instances on one page (wide and tall, or one diagram twice) must not share ids: `url(#x)` resolves to the first element with that id, and WCAG 2.1 SC 4.1.1 forbids duplicates. |
| G15 | If the scene defines `labelBoxes`, at each sampled time and each step time: no two boxes with `opacity` > 0 are closer than 4 px, no stem crosses another box and every box lies inside the picture (`0, 0, width, height`). `labelBoxes` MUST return an array and not throw. Each problem is reported once, at its first time. | `lib/check.mjs` (rule 9), `runtime/iso.mjs` (`labelProblems`) | Labels placed in a projected view move with the camera; nothing else checks them against one another. Opacity 0 is not drawn, so a scene hides labels while the camera moves. |

The gate checks structure, not looks. Visual review (before/after frames,
phone size, real-time playback, dark mode) is required by
[`qc.md`](../../skills/animated-diagram/references/qc.md), and a human signs
off.

### 11.1 Gate policy decisions

Recorded 2026-11-18 for [#12](https://github.com/liqweed/motion-kit/issues/12):

| Question | Contract and reason |
|---|---|
| Duration | 12 s is the hard gate limit; ≤ 8 s is the design target. Keep valid existing scenes while making the two numbers explicit. |
| Export coverage | CLI build, export, bake, video and icon MUST run the same scene and style gate before writing output. Library render primitives remain composable. |
| Module locales | Modules MAY export `locales`; all declared locales MUST be checked by default. Undeclared modules retain `en` for compatibility. Explicit `--locale` overrides. |
| Translations | A localized object MUST supply the exact requested locale. Plain strings are shared. Silent cross-language fallback is forbidden. |
| Shape styles | Built-in scenes MUST use radius 0–24 (default 10) for rectangular node corners and stroke 1–4 (default 2) as their base width. Accent lines are 1.5×; timeline stems 0.75×. Circles, region borders and pills retain their shapes. Custom scenes MAY read normalized `style` from the frame context. |
| Motion tokens | A style MAY set `motion.enter` (entrances) and `motion.move` (movement between visible states) as four numbers, a CSS `cubic-bezier(x1, y1, x2, y2)`, each from 0 to 1: no curve overshoots. Defaults: `(0, 0, .2, 1)` and `(.4, 0, .2, 1)`. Built-in scene types read them through `easings(style.motion)`; durations, delays and step times stay fixed, so a curve changes how a move travels and never when a step settles. A curve that is still moving near its end (a linear one) would leave a step frame unsettled, so `easings` finishes it in the first 95 % of each move and holds it at 1 for the last 5 %; a curve that ends flat (both defaults) is the exact CSS curve. Custom scenes MAY do the same. |
| Vendored parity | CLI and vendored checks MUST call the same `lib/gate.mjs` and `lib/check.mjs`, including contrast, locales and caller options. |
| Neutral contrast | Keep emphasis-on-accent at 3:1, the darker light accent and lighter dark emphasis. The site chrome follows the corresponding neutral tokens. |

The controller also exposes `onStep(callback) → unsubscribe`, with an immediate
current index and subsequent changed indices (`-1` before the first step).
Destroy releases subscribers. `seek(t)` requires a finite time, clamps it,
pauses playback and cancels pending autoplay; external drivers use the controller
and must implement their own reduced-motion policy.

Registered graph walks are `state-machine` and `request-journey` (2–8 nodes,
1–12 edges, 1–10 explicit path edges). Their fields, narrative steps, region
boundaries and limits are in the [scene type reference](../../skills/animated-diagram/references/scene-types.md).

A `flowchart` spec carries its layout: integer `rank` and `pos` ≥ 0 per node,
one `via` waypoint per rank an edge crosses. The type MUST NOT lay a graph out;
it scales the stored layout per format and MUST throw on overlapping nodes,
waypoints through a node, self-loops, edges that skip ranks, and labels or
connectors that collide in a format (`runtime/types/flowchart.mjs`). The
layout is computed at build time by `motion-kit import` (`lib/mermaid.mjs`,
`lib/layout.mjs`), deterministically: the same chart gives the same spec.

Export manifests include `runtimeHash` (SHA-256 of sorted runtime module paths
and contents); `inputHash` includes it, source, style, scene options, format,
locale and rendering settings. Custom modules' arbitrary imported dependencies
are not recursively hashed; inspect regenerated output when those change.

## 12. Discrepancies

No known discrepancies remain from the November 2026 gate audit. The gate
is sampled validation, not a proof of purity or visual quality.

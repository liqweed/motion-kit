---
title: motion-kit technique — normative specification
status: draft
last_updated: 2026-11-15
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
| `steps` | `{at, label, detail?}[]` | MUST | ≥ 1 step; `at` strictly increasing; `at ≤ duration` (+1e-9); every `label` non-empty [throws] (`runtime/scene.mjs:46-53`). The last step is the finished diagram. |
| `frame(t)` | `(number) → string` | MUST | Inner SVG markup at `t` (§2). |
| `stepLabelsInFrame` | boolean | MAY | `false` declares narrative steps whose labels are not drawn; exempts the scene from gate rule G10 (`lib/check.mjs:74`; used by `examples/custom-pulse.scene.mjs:137`, `brand/logo.scene.mjs:108`). |
| `type`, `format`, `locale` | string | MAY | Set by scene types; recorded in the export manifest (`lib/export.mjs:75-77`). |

- A scene MUST be produced by either a registered scene type —
  `createScene(spec, {format, locale})` (`runtime/types/index.mjs:19-23`) — or a
  custom module whose default export is `(opts) → scene`
  (`lib/load.mjs:29-32`). Both paths run `validateScene`.
- A custom module MUST import only from `runtime/` with single-line relative
  `import { … } from "./x.mjs";` statements and use only the export forms the
  inliner supports, or `build` throws (`lib/bundle.mjs:8-11,33,59`).
- `detail` SHOULD hold sentences; labels stay short (§7). `detail` feeds the
  player caption and screen-reader list (§10.2).

## 2. Time model and determinism

| # | Rule | Enforcement | Rationale |
|---|---|---|---|
| T1 | `frame(t)` MUST depend only on `t` and the scene's constants: no `Date`, `Math.random`, `performance.now`, no state carried between calls, no module-level mutable state. | [gate] G1 re-renders each `t`; G11 scans the source (`lib/check.mjs:42,80-81`) | Random access: a player can jump, an exporter can write exactly one frame, video samples `t = f/fps` (`runtime/scene.mjs:14-17`). |
| T2 | Same `t` (and same style/options) MUST give byte-identical output. | [gate] G1 | Tests, diffs, caching and committed media all depend on it. |
| T3 | Callers MUST clamp `t` to `[0, duration]`; `renderSvg` does (`runtime/scene.mjs:70`). `frame` MAY assume a clamped `t`. | — | Defines "before start" and "hold". |
| T4 | Every number interpolated into markup MUST be rounded: `num(n, 2)` by default, 3 digits for `opacity`, 4 for scale factors (`runtime/svg.mjs:17-22,29,64`). `num` MUST throw on non-finite input and never emit `-0`. | [gate] G3; non-finite → G5 | 17-digit floats made "settled" frames differ by 1 ms (`skills/animated-diagram/references/technique.md:128-129`). |
| T5 | Visibility MUST be decided on rounded values: an element whose opacity rounds to 0 is omitted; an opacity that rounds to 1 is not written (`runtime/svg.mjs:28,39,68-72`). | by construction (`el`, `fade`) | Identical-looking frames must be identical bytes (opacity 0.9999 vs omitted). |
| T6 | Scenes MUST NOT use CSS transitions/animations or timers; the renderer owns the clock (`runtime/player.mjs:15`). | — | Exported frames would not match what plays. |
| T7 | Variation, if any, MUST derive from constants and `t` (seeded), never from runtime randomness. | [gate] G11 (heuristic) | Same as T2. |

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
  (`runtime/types/hub-spoke.mjs:40,59-73`).
- **Auto-fit text**: a type MUST try the largest font size and step down by
  1 px to `FONT_MIN = 14` (`runtime/parts.mjs:12`) until every label wraps
  into its budget; if none fits it MUST throw. Maxima: `sequence` 22 px fixed /
  16 px strips (`runtime/types/sequence.mjs:127`); `hub-spoke` 20 / 16
  (`runtime/types/hub-spoke.mjs:97`); `spec.fontSize` overrides the maximum.
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
  (`runtime/style.mjs:52-55`).
- Tokens (`runtime/style.mjs:14-23`): `bg`, `surface`, `ink`, `muted`, `line`,
  `accent`, `onAccent`, `emphasis`. Roles: see
  [`styles.md`](../../skills/animated-diagram/references/styles.md). Exactly one
  element at a time SHOULD carry `emphasis`.
- A style is data: `{name, font, radius, stroke, light: {token: #rrggbb}, dark: {…}}`.
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
- **Contrast** (`runtime/style.mjs:114-134`, WCAG relative luminance): in both
  themes, text ≥ 4.5:1 — `ink`/`muted` on `bg` and `surface`, `onAccent` on
  `accent`; shapes ≥ 3:1 — `line`, `accent`, `emphasis` on `bg`. `motion-kit
  check` MUST fail when the selected style violates any pair [gate] G12
  (`cli/motion-kit.mjs:83-85`). `neutral` MUST pass (`test/runtime.test.mjs:96-98`).
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
  returns the plain string, the requested locale, else the first value, else ""
  (`runtime/scene.mjs:33-40`).
- Labels are labels; sentences go in `detail`. Font size MUST NOT go below
  14 px at 1× (§3).
- Every shipped locale × format MUST pass the gate. `check` derives locales
  from a `.json` spec's localized objects (keys `xx` or `xx-YY`)
  (`cli/motion-kit.mjs:89,209-220`); see §12 D3 for modules.

## 8. Steps and settled frames

- `steps[i].at` is the time step *i* is fully shown; its frame is what a slide,
  a step button and Slidev show.
- Step frames MUST be settled: nothing moves at `at` [gate] G6
  (`frame(at − 1 ms) === frame(at)`, `lib/check.mjs:55-58`).
- Authoring rule: the next motion MUST NOT start before `at`, and anything that
  fades out by a step (a travelling dot) MUST reach 0 by `at`. Scene types
  satisfy this by construction: `PERIOD ≥ HOP + FILL`
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

Registered types: `sequence` (2–12 nodes) and `hub-spoke` (2–10 spokes)
(`runtime/types/index.mjs:14-17`). Fields and storyboards:
[`scene-types.md`](../../skills/animated-diagram/references/scene-types.md).
Normative points:

- Out-of-range node/spoke counts, a missing hub and an unknown type MUST throw
  (`runtime/types/sequence.mjs:123`, `runtime/types/hub-spoke.mjs:89-90`,
  `runtime/types/index.mjs:21`).
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
| `idPrefix` | MUST be unique per page when several diagrams share it. |

### 10.2 Live player (`runtime/player.mjs`)

| Requirement | Source |
|---|---|
| MUST touch the DOM only when mounted; scenes stay pure, the player owns the clock (`requestAnimationFrame`, wall time). | `runtime/player.mjs:15,135-149`, `AGENTS.md:31` |
| Initial state MUST be the final frame; a server/no-JS fallback SHOULD put the final frame in the container. | `:172`, `lib/build.mjs:25`, `adapters/astro/AnimatedDiagram.astro:31` |
| Autoplay `visible` (default): plays once from 0 when ≥ 40 % in view, then holds; `none` disables. MUST NOT loop. | `:173-191` |
| Play/pause MUST always be present when motion can play (WCAG 2.2.2); label shows Play/Pause/Replay. | `:69-75,129` |
| One `<button>` per step, labelled `N. label`; activating it jumps by default. `animateSteps: true` opts buttons and keyboard navigation into `playToStep`. `aria-current="step"` marks the active step. | `runtime/player.mjs` |
| Optional range scrubber (`aria-label`, default "Timeline"); input pauses and seeks. | `:88-102` |
| Caption shows the active step's `detail` and is `aria-hidden`; a visually hidden ordered list of all steps (`label: detail`) MUST be present for screen readers. | `:103-115` |
| Keyboard on the focusable stage: ←/→ step, Home/End first/last, Space play/pause. | `:59,156-165` |
| Visible focus style for every control. | `:26` |
| `prefers-reduced-motion: reduce`: final frame, no autoplay, no play button, Space ignored. | `:38,70,142,162,174` |
| Theme: `options.theme`, else follows `prefers-color-scheme` live. | `:50-54,192-194` |
| `playToStep(i)` MUST play forward from the current time, clamp to the target step's exact `at` and hold. Backward, same-time and reduced-motion calls MUST jump. Indices are zero-based; invalid indices throw `RangeError`. Retargeting replaces the target; `play()` continues to duration; `seek(t)` cancels playback. | `runtime/player.mjs`, `test/player.test.mjs` |
| `destroy()` MUST cancel the animation frame, disconnect visibility observation, remove theme listening and remove this controller's capture entry. | `runtime/player.mjs`, `test/player.test.mjs` |
| **Capture hook**: the controller `{seek, play, pause, seekStep, playToStep, destroy, time, scene}` MUST be exposed at `globalThis.__motionKit[options.id ?? scene.id]`. | `runtime/player.mjs` |

UI strings MAY be localized via `options.labels`.

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

### 10.3 Self-contained HTML (`motion-kit build`, `lib/build.mjs`)

- MUST be one document with the runtime inlined by `lib/bundle.mjs`, no
  external scripts, stylesheets or fetches (`test/cli.test.mjs:31-37`), so it
  works under `connect-src 'none'` and from `file://`.
- MUST pre-render the final frame (`lib/build.mjs:25`) and set `<html lang>`
  to the scene locale (`:31-33`).
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
- `index.html` contact sheet: steps, QC row, a 360 px phone row and the human
  review checklist (`lib/export.mjs:93-108`).
- `manifest.json` MUST contain no timestamps: tool, version, scene, type,
  format, locale, size, duration, style, theme, a 16-hex input hash
  (source file + style), source commit, render settings, file list
  (`lib/export.mjs:66-88`). Two exports of the same inputs MUST be equal
  (`test/cli.test.mjs:20-30`).

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
- **Astro** (`adapters/astro/AnimatedDiagram.astro`): server-renders the final
  frame and mounts the player; props MUST be serializable (a spec, not a scene).
- **Vendor** (`cli/motion-kit.mjs`, `vendor` command): copies `runtime/`, one
  adapter, `lib/check.mjs` and the full MIT `LICENSE`; writes a spec-only gate
  script and `MOTION_KIT_VERSION`. Consumers MUST retain `LICENSE` and the
  SPDX headers when redistributing vendored files. Vendored files MUST NOT
  be edited in the consumer.

## 11. The gate

`checkScene(scene)` (`lib/check.mjs:33-84`) samples 121 evenly spaced times
(`SAMPLES = 120`, `:9`) and stops collecting after 13 problems (`:51`).
`motion-kit check` runs it for every file × format (all six unless `--format`)
× locale (§7) and adds the style contrast check; it exits 1 on any failure or
construction error (`cli/motion-kit.mjs:81-108`). `npm run gate` = unit tests +
`check` over `examples/` and `brand/` (`package.json:15-18`).

| ID | Rule | Code | Rationale |
|---|---|---|---|
| G1 | Rendering the same `t` twice MUST yield identical bytes. | `lib/check.mjs:41-42` | Determinism (T1/T2). Catches clocks/randomness and call-to-call state; cannot catch state that is consistent between two calls. |
| G2 | Each sampled frame MUST be well-formed (balanced tags, no stray `<`, entities only `amp lt gt quot #39 #n`). | `:12-31,43-44` | Escaping failures and broken markup break every target. |
| G3 | No number with ≥ 5 decimals in the full SVG. | `:45-46` | Rounding (T4). |
| G4 | No `#hex`, `rgb(a)(`, `hsl(a)(` in `frame()` output. | `:47-49` | Token-only colours: themes and brand styles must work everywhere. |
| G5 | No `NaN`, `undefined`, `Infinity` in `frame()` output. | `:50` | Silent geometry bugs. |
| G6 | `render(at − 0.001) === render(at)` for every step. | `:55-58` | Settled step frames (§8). |
| G7 | First frame ≠ last frame. | `:61-63` | Something must animate. |
| G8 | `render(duration + 5) === render(duration)`. | `:65` | Holds the final frame. |
| G9 | `duration ≤ 12` s. | `:68` | Explainer budget (see §12 D1). |
| G10 | Every word of every step label (escaped, trailing `/` stripped) appears in the final frame's text, unless `stepLabelsInFrame === false`. | `:72-77` | Step buttons and slides refer to things the viewer can see. Word-level, so it does not prove the label is contiguous. |
| G11 | `frame.toString()` MUST NOT contain `Date.now`, `new Date`, `Math.random`, `performance.now`. | `:80-81` | T1. Textual heuristic: helpers defined outside `frame` are not scanned. |
| G12 | Style passes WCAG contrast in both themes. | `cli/motion-kit.mjs:83-85`, `runtime/style.mjs:114-134` | Legibility in light and dark. |
| G13 | Scene construction succeeds for the format × locale (validation, fit, collisions, wrapping). | `cli/motion-kit.mjs:92-103` | Reject, don't invent: a broken picture never renders. |

The gate checks structure, not looks. Visual review (before/after frames,
phone size, real-time playback, dark mode) is required by
[`qc.md`](../../skills/animated-diagram/references/qc.md), and a human signs
off.

## 12. Discrepancies

Recorded, not resolved. Each needs an owner decision.

| # | Topic | Code says | Docs say |
|---|---|---|---|
| D1 | Duration budget | Gate fails only above **12 s** (`lib/check.mjs:68`). | "≤ ~8–10 s" (`README.md:98`, `AGENTS.md:47`); "≤ ~8 s" (`skills/animated-diagram/SKILL.md:50`, `motion-vocabulary.md:21`). |
| D2 | Exporters refuse failing scenes | Only `build` and `export` run the gate; `bake` and `video` render any loadable scene (`cli/motion-kit.mjs:132-157`). | "Exporters refuse scenes that fail the gate" (`skills/motion-render/SKILL.md:17`). |
| D3 | Every locale is checked | `.mjs` modules are checked in `en` only (`cli/motion-kit.mjs:89`), although `examples/custom-pulse.scene.mjs` ships `nl`. | "Labels fit … in every locale" (`README.md:97`, `AGENTS.md:48-49`). |
| D4 | Missing copy | `localize` silently falls back to the first available language (`runtime/scene.mjs:36-39`). | "Missing label → throw" (`skills/animated-diagram/references/technique.md:111`). Only an empty *step* label throws. |
| D5 | Gate rule G10 and `stepLabelsInFrame` | Enforced (`lib/check.mjs:70-77`). | Absent from the scene contract comment (`runtime/scene.mjs:4-12`), `custom-scenes.md`, and the rule lists in `README.md:94-99` and `AGENTS.md:38-49`. |
| D6 | "Enforced by `motion-kit check`" | G1 and G11 only partly verify purity (no cross-call state detection; source scan limited to `frame`'s own text); CSS-transition and "no earlier-frame state" rules are not checked. Escaping is guaranteed by `esc`/`text`, and only detected by G2 for `<` and `&`. | All 11 determinism rules listed as "enforced by `motion-kit check`" (`skills/animated-diagram/references/technique.md:23-39`). |
| D7 | Style `radius` / `stroke` | Normalized (`runtime/style.mjs:63-64`) but never read; parts default to radius 10, stroke 2 (`runtime/parts.mjs:52,75`). | Documented as style fields (`styles.md:28-29`). |
| D8 | Dark fallback | A style with no `dark` applies its **light** overrides to dark (`runtime/style.mjs:66`). | "Missing tokens fall back to neutral" (`styles.md:35`). |
| D9 | Video frame reuse | PNGs are reused only when `t` repeats (lead and hold) (`lib/video.mjs:46`). | "Identical consecutive frames are rasterized once" (`skills/motion-render/references/video.md:9`). |
| D10 | Capture-hook key | Key is `options.id ?? scene.id`, i.e. format-suffixed (`order-flow-16x9`); the Astro adapter appends a random suffix (`adapters/astro/AnimatedDiagram.astro:51`); the Slidev adapter exposes none. | `window.__motionKit[sceneId]` / `[id]` (`adapters/page/README.md:22`, `interactivity.md:14-15`). |
| D11 | Vendored gate | `check.mjs` written by `vendor` handles `.json` only, skips the contrast check, and detects locales with `^[a-z]{2}$` (no region, no string-value test) (`cli/motion-kit.mjs:177-207`). | Implied parity with `motion-kit check` (`README.md:90-92`). |
| D12 | Auto-fit maximum | Sequence 22 px, hub-spoke 20 px (`runtime/types/hub-spoke.mjs:97`). | "Fixed formats ≤ 22 px" without type distinction (`technique.md:90`); `formats.md:12` is correct. |
| D13 | Timing budgets | `ENTRANCE_MAX` is exported but unused; stagger and entrance limits are not checked. | Listed as "Hard rules" (`skills/animated-diagram/SKILL.md:50`). |
| D14 | Manifest reproducibility | `inputHash` covers the source file and style only, not the runtime; a runtime change keeps the hash while frames change (only `version` hints at it) (`lib/export.mjs:66-70`). | "A stale export is easy to spot" (`skills/motion-render/SKILL.md:66-68`). |

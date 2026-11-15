# The technique: animation as a pure function of time

Origin: a production technique for code-driven motion design ("an automated
motion design system", X article by @e1genqq, Oct 2026, read via paraphrase),
first applied to live website diagrams and then generalized here. Numbers below
marked *derived* were worked out for motion-kit; the article gave none.

## 1. The model

Write `frame(t)` that draws the **complete** picture for any time `t`, instead of
authoring a timeline and recording it. Consequences:

- **Random access.** Frame 600 renders without frames 0–599. A step button can
  jump anywhere; an exporter writes exactly the frame a slide needs; a test can
  sample any instant.
- **Editable.** Change a label, a timing or a colour and re-render: nothing is baked.
- **Repeatable.** The same `t` gives the same bytes, so tests, diffs, caching and
  review all work.
- **One source, many outputs.** Live page, Slidev, SVG/PNG stills, baked SVG, video.

Video maps frame `f` at `fps` to `t = f / fps` (30 fps × 25 s = 750 frames).

## 2. Determinism rules (enforced by `motion-kit check`)

1. No dependence on previous frames.
2. No uncontrolled randomness (derive variation from a seed and `t` if needed).
3. No CSS transitions/animations or timers while rendering; the renderer owns time.
4. No state that exists only because something happened earlier.
5. Every visible property is computed from `t`.
6. Same input, same bytes.
7. Round every number. `el()` rounds numeric attributes; numbers you put in a
   template string (`transform`, `points`, path `d`) must go through `num()`.
   The gate rejects any number with 5+ decimals.
8. No `Date`, `Math.random()`, `performance.now()` inside a scene.
9. **Step frames are settled** (§4).
10. Markup is balanced and escaped: labels cannot inject markup.
11. Visibility decisions use rounded values: an element whose opacity rounds to
    0 is dropped, and an opacity that rounds to 1 is omitted, so frames that
    look identical are byte-identical (`fade()`, `el()` do this).

## 3. Authoring a timeline

Name the timing constants, derive every event from them:

```js
const ENTER_GAP = 0.1;           // stagger between siblings
const ENTER = 0.4;               // one entrance (≤ 0.6)
const START = ENTER_GAP * (n - 1) + ENTER + 0.1;   // after the last entrance
const FILL = 0.25;               // a node turning accent
const HOP = 0.4;                 // emphasis travelling between nodes
const PERIOD = HOP + FILL + 0.05;                  // ≥ HOP + FILL → settled steps
const hopStart = (k) => FIRST_HOP + k * PERIOD;
const stepAt = (k) => fillStart(k) + FILL;
```

Helpers (`runtime/motion.mjs`): `progress(t, start, dur, ease)` is eased 0..1,
holding 0 before and 1 after; a property is `lerp(a, b, progress(...))`.
Compose by multiplying progress values or by stacking layers, never by mutation.

Patterns:

- **Skeleton first, then fill.** Everything appears (pending style) so the whole
  structure is visible, then the walk-through starts. Each step frame reads as
  "you are here"; the viewer never holds an unseen future in mind.
- **Cross-fade states, don't interpolate colours.** Pending and active are two
  layers with opacities `1 − p` and `p`. Scenes stay token-only.
- **Draw-on connectors.** `stroke-dasharray = L`, `dashoffset = L·(1 − p)`.
  `drawOn()` returns null at `p ≤ 0`: a zero-length dash with round caps still
  paints a dot.
- **One emphasis element** (ring, dot) carries the narrative; it is the only
  thing in the emphasis colour.
- **Route connectors around text.** A snake-grid row turn is an elbow outside
  the column, beyond the widest possible label, never a straight line through
  the label below a node.

## 4. Settled step frames

`steps[i].at` is when build step *i* is fully shown, and its frame is what a
slide shows. It must look intentional on its own: nothing mid-motion, no
half-drawn line pointing at nothing, no fading dot. Rule: **the next motion may
not start before `at`.** The gate asserts `frame(at − 1 ms) === frame(at)`.
Anything that fades out by a step (a travelling dot) must reach 0 by `at`.

## 5. Layouts are computed per format

Never crop one master. Timings and the spec are shared; geometry is a function
of the format (`16:9`, `4:3`, `1:1`, `9:16`, `wide` strip, `tall` column):

- Row for wide aspects, snake grid for square-ish, column or tree for tall.
- **Auto-fit text:** try the largest font (fixed formats ≤ 22 px, strips ≤ 16 px)
  and step down to 14 px until every label wraps into its budget; fail if even
  14 px doesn't fit. Never shrink below 14 px at 1×.
- **Collision checks:** nodes must not overlap or leave the canvas; the layout
  throws instead of rendering a broken picture.
- **Web breakpoint:** switch wide → tall where the wide layout's text would drop
  under ~14 px on screen (a 960-wide strip → switch at ~1024 px).

## 6. Text

- SVG text does not wrap. Each layout has a character budget; `wrapLabel()`
  breaks at spaces and after a slash, keeps a standalone "/" with the word
  before it, and **throws** on an unbreakable word or too many lines.
- Dutch/German run ~30 % longer than English: check every locale shipped.
- Labels, not paragraphs. Sentences go in `detail` → the player's caption and
  the screen-reader list.
- Copy comes from the approved source (the page's dictionary, the deck's text).
  A diagram must not claim what the surrounding content doesn't.

## 7. Validate before rendering (reject, don't invent)

Missing label → throw. Label too long → throw. Unknown token → throw. Layout
overlap → throw. Unknown scene type/format → throw. Claims are checked by a
human (no unmeasured numbers, "supports" rather than "guarantees").

## 8. Architecture (the article's six components → motion-kit)

| Component | Job | motion-kit |
|---|---|---|
| Brief compiler | material → structured data, creative input separate from code | the spec JSON (+ style file) |
| Scene engine | data → animation | `runtime/types/*` (spec-driven), custom modules |
| Renderer | frame at timestamp | `renderSvg(scene, t, opts)` in Node and browser |
| Quality controller | find problems before delivery | `check`, contact sheet `--qc`, review checklist, human sign-off |
| Variant generator | formats × locales × hooks | `--format`, `--locale`, `--style`; one spec, many outputs |
| Delivery | package | `export` (SVG/PNG + manifest), `build`, `bake`, `video` |

## 9. Lessons learned (each now a rule or a check)

1. Unrounded numbers in template strings leaked 17 digits and made a "settled"
   frame differ from 1 ms earlier → `num()`, decimal check.
2. A connector started drawing 50 ms before its step → settled-step check,
   `PERIOD ≥ HOP + FILL`.
3. Zero-length dash + round caps = a stray dot → `drawOn()` returns null.
4. Slash-separated labels left a leading space or a line starting with "/" →
   `wrapLabel` rules.
5. A badge collided with long Dutch labels → give labels the full width; test
   every locale.
6. Importing all dictionaries into a client island bloated the bundle → keep
   label resolution server-side; pass serializable data (a spec, not a scene).
7. `opacity` 0.9999 vs omitted made identical-looking frames differ → decide
   visibility on rounded values.
8. A straight row-turn connector crossed a label in a snake grid → elbow routing.
9. A hub-spoke trunk drawn through boxes in a tall layout → tree layout with
   the trunk outside the boxes.
10. Headless-Chrome `--virtual-time-budget` doesn't advance the player's clock
    faithfully (blank frame at t=0) → check playback in real time (`--timeout`,
    DevTools protocol) or with `--force-prefers-reduced-motion` for the final frame.
11. A dev server silently moved to another port and served a stale page → read
    the printed URL.

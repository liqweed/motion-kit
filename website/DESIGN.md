---
title: motion-kit.dev design
status: draft
last_updated: 2026-11-21
---

# motion-kit.dev design

The house values of motion-kit.dev: what a design session or a build of the
site does not decide again. Impeccable and similar skills read this file;
`design_brief.design_language` in `.config/jig.yaml` points here, so a new
design brief binds to it.

The values come from the **Module** direction, which Ophir picked in the
design round of [#14](https://github.com/liqweed/motion-kit/issues/14). The
picked artboards, the record of the pick and its token plan are in
[`design/prototypes/motion-kit-site/`](../design/prototypes/motion-kit-site/).
Where this file and the artboards differ, this file wins and the artboards get
fixed. Building the site from them is #61.

## Pinned values

| Value | Pinned |
|---|---|
| **Typeface** | Instrument Sans for all text; DM Mono for callout numerals, parameter names, commands and spec strips. Both SIL OFL 1.1, self-hosted (Latin and Latin Extended). Never Space Grotesk or Inter. |
| **Heading case** | Sentence case. Weight 600, tracking 0, no uppercase headings. Small labels may be uppercase with +0.06em tracking. |
| **Easing curve** | `cubic-bezier(0.4, 0, 0.2, 1)` for the site's own motion and the logo; scene styles may set their own enter and move curves. No bounce, no elastic. |
| **Press scale** | `scale(0.97)` on `:active` for buttons and square controls, 100 ms, the easing curve above. Proposed by Claude, confirmed by Ophir on 2026-11-21. |

**Typeface: resolved.** Impeccable's detector flags Instrument Sans as an
overused primary font on the hero and "where it runs" pages (2026-11-21). Ophir
kept Instrument Sans + DM Mono on 2026-11-21, after seeing both pairs side by
side. The flag is a heuristic about how common a font is, not a defect in the
design, and the repository's design language wins over a vendored skill. The
alternative, Albert Sans + Spline Sans Mono, is not flagged; it was drawn as a
variation in the round and is not used. A later detector run that reports
`overused-font` on Instrument Sans is this known, accepted finding.

## Type

Every size and line height is a multiple of 8.

| Role | Size / line | Weight |
|---|---|---|
| Hero heading | 64 / 64 | 600 |
| Section heading | 48 / 56 | 600 |
| Title | 24 / 32 | 600 |
| Body, controls | 16 / 24 | 400, 500 for controls, 600 for emphasis |
| Mono labels | 16 / 24 | 400 to 500 |

The arrow in `frame(t) → SVG` is not in the Latin subset of either face, so it
falls back to a system glyph; subset it in if that shows.

## Grid, shape and spacing

- A 12-column grid with 16 px gutters. The unit is 8 px: every block is a whole
  number of modules, except the 44 px interactive control target below. The
  design shows an 8 px ruler on a plate's top and left edges.
- Square corners everywhere (`border-radius: 0`). The logo is the only rounded
  shape.
- 1 px rules, 2 px plate edges, 24 px square callout markers, 44 px controls.
  No circles or pills.
- Figures carry numbered callouts keyed to a legend beneath them.

## Colour

The shipped neutral style's tokens, plus a dark theme. The site follows the
OS theme.

| Token | Light | Dark |
|---|---|---|
| bg | `#ffffff` | `#0d1117` |
| plate (surface) | `#f3f4f6` | `#151922` |
| ink | `#111827` | `#f3f4f6` |
| muted | `#4b5563` | `#a3aab5` |
| line | `#8b929c` | `#8b929c` |
| accent | `#1d36a8` | `#1d36a8` |
| onAccent | `#ffffff` | `#ffffff` |
| emphasis | `#d97706` | `#d97706` |

- Accent on white is 9.8:1. On near-black it is 1.9:1: there it is only ever a
  filled block that carries white content, never text or a lone outline, and a
  blue shape on a plate gets a light keyline.
- Emphasis on white is 3.2:1: shapes and marks only, never small text. On
  near-black it is about 6:1 and may carry text. It marks the active step and
  the focus ring.
- Text reaches 4.5:1 (3:1 from 24 px), shapes and control edges 3:1, in both
  themes. One known exception: the amber emphasis stripe on the isometric
  side list's current step sits at about 2.9:1 on the light alternate plate;
  the step's text and `aria-current` carry the meaning, the stripe is redundant.

## Motion

The canon holds on the site as it does in the diagrams: no loops, no ambient or
decorative motion, no continuous scrubbing or parallax. A diagram plays once,
holds its final frame, and moves between settled steps. At most 12 s per scene,
8 s as the target. Reduced motion shows the final frame. Interface transitions
use the easing curve above. The design's one motion moment
is the hero's callout leaders drawing to the diagram, one at a
time, once the scene has settled or the reader first presses a control (or
waits out the scene's length plus four seconds with playback held back); only
in the layout that shows the callouts.

## Decided in the build (#61, first pull request)

The round drew the hero, "where it runs" and the player at 1200 px and wider.
The build settled the rest, in `website/src/styles/site.css`:

- **At 1200 px and below** (the breakpoint is inclusive) the 12-column grid
  loosens (32 px side margin) and the two-column bands stack, except the gallery
  comparison, which keeps both columns while they fit, and the scroll story,
  which keeps its rail beside the text after moving the stage above it. At 720 px and below the margin is 16 px, the hero
  heading drops to 40 / 48 and section headings to 32 / 40 (still multiples of
  8), the figure switches to the portrait `tall` format, and callouts and their
  legend are left out (the controls carry their own labels).
- **Figures** are plates with the 8 px ruler, a "Fig. n" label and, on figures that
  track the active step, a row of step squares (done, now, to come; filled in by
  script, and absent from figures that carry none). The live player's own
  controls are drawn in the design's language (square, 2 px ink edge; play and
  the current step have an accent fill and a 1 px light keyline, because the
  accent alone is about 1.8:1 against the dark plate).
- **Gallery cards** are 1 px-ruled square plates with the player, the title, the
  scene type and a "built" badge. A **needs card** has a dashed 1 px edge, a
  hatched storyboard in place of the player, and a "needs: type" badge.
- **The isometric showcase** is Fig. 6 on the home page, playing
  `examples/isometric-swivel.scene.mjs` beside its step list.
- **The motion moment**: after the hero scene has settled (or earlier, when the
  reader presses a control, or after the scene's length plus 4 s when playback
  is paused or the hero stays out of view), the callout leaders draw once, one at a time (160 ms each, the easing curve). Under reduced motion
  the leaders are simply there. Without JavaScript the callouts and the legend
  are not built; the controls carry their own labels.
- **Dark theme**: page chrome uses the site-dark tokens above. The default
  studio diagrams keep the neutral dark tokens (accent `#2563eb`; the style
  previews, such as Tidewater, show their own palettes), because accent `#1d36a8` is 1.9:1
  on near-black, under the 3:1 that reached nodes and connectors need.

## Not decided yet

The docs pages and navigation (the second pull request of #61).

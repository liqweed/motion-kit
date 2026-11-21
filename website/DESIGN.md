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
| **Easing curve** | `cubic-bezier(0.4, 0, 0.2, 1)` for everything, the curve the logo draws and the diagrams use. No bounce, no elastic. |
| **Press scale** | `scale(0.97)` on `:active` for buttons and square controls, 100 ms, the easing curve above. Proposed by Claude: the round drew static frames, so Ophir has not seen it. Confirm or change it before #61 builds it. |

**Open decision on the typeface.** Impeccable's detector flags Instrument Sans
as an overused primary font on the hero and "where it runs" pages (2026-11-21).
The pinned pair stays as Ophir chose it until Ophir decides. The alternative,
Albert Sans + Spline Sans Mono, is not flagged; it was drawn as a variation in
the round. Record the outcome here, as the repository's design language wins
over a vendored skill.

## Type

Every size and line height is a multiple of 8.

| Role | Size / line | Weight |
|---|---|---|
| Hero heading | 64 / 64 | 600 |
| Section heading | 48 / 56 | 600 |
| Title | 24 / 32 | 600 |
| Body, controls | 16 / 24 | 400, 500 for controls, 600 for emphasis |
| Mono labels | 14 / 24 | 400 to 500 |

The arrow in `frame(t) → SVG` is not in the Latin subset of either face, so it
falls back to a system glyph; subset it in if that shows.

## Grid, shape and spacing

- A 12-column grid with 16 px gutters. The unit is 8 px: every block is a whole
  number of modules. The design shows an 8 px ruler on every plate edge.
- Square corners everywhere (`border-radius: 0`). The logo is the only rounded
  shape.
- 1 px rules, 2 px plate edges, 24 px square callout markers, 40 px controls.
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
  themes.

## Motion

The canon holds on the site as it does in the diagrams: no loops, no ambient or
decorative motion, no continuous scrubbing or parallax. A diagram plays once,
holds its final frame, and moves between settled steps. At most 12 s per scene,
8 s as the target. Reduced motion shows the final frame. Interface transitions
use the easing curve above. The design's one motion moment,
not yet built, is the hero's callout leaders drawing to the diagram, one at a
time, after the scene has settled.

## Not decided yet

The round drew three frames in two themes. These are open and belong to #61 or
to their own issues: the gallery and its cards, the docs pages and navigation,
a "needs" card, the isometric showcase, any width below 1200 px, and the
motion above.

# The pick: Module

Recorded 2026-11-21 for [#14](https://github.com/liqweed/motion-kit/issues/14).
Ophir picked the design; Claude recorded it.

## What was picked, and by whom

| Date | Step | Who picked | Pick |
|---|---|---|---|
| 2026-11-20 | Directions to render, from eight contracts in text (four written by Claude, four by GPT-6.2 Astra through Codex) | Ophir | Departures, Module, Standards, Scale |
| 2026-11-20 | Two to take into one round of variations, from rendered artboards | Ophir | Departures, Module |
| 2026-11-20 | One direction, from rendered variations (typeface pair and dark theme) | Ophir | **Module** |
| 2026-11-20 | Dark theme | Ophir | Accepted as drawn |
| 2026-11-21 | Typeface pair, from a side-by-side specimen | Ophir, relayed by the coordinating session | **Instrument Sans + DM Mono** (pair A, the original) |
| 2026-11-21 | Impeccable's `overused-font` flag on Instrument Sans: keep or switch to Albert Sans + Spline Sans Mono | Ophir, relayed by the coordinating session | **Keep** Instrument Sans + DM Mono; the flag is a heuristic |
| 2026-11-21 | Press scale `scale(0.97)` on `:active`, 100 ms (proposed by Claude) | Ophir, relayed by the coordinating session | **Confirmed** |

Ophir gave no rationale for the pick. The first pick, from text alone, was
hard for them to make with confidence; the later picks were made from images.

## Why Module fits, from its contract

- Callout labels match parameter names, which suits authors and the coding
  agents that write scenes.
- The 12-column grid of 8 px modules stacks to one column on a phone.
- It lets the diagram be the only picture: figures carry numbered callouts, the
  rest is type and rules.
- Square corners against the rounded logo are a deliberate clash.

Its risks, as the contract states them: every plate looks alike, so the site
can drone; the grid and ruler can clutter; the square corners clash with the
logo.

## Token plan

[`website/DESIGN.md`](../../../website/DESIGN.md) pins the values: the
typeface pair, sentence-case headings, the easing curve, the press scale, the
8-multiple type scale, the grid and shape rules, and the light and dark colour
tokens. The colour tokens are the neutral style's, so the site and the
diagrams share them. The site's CSS takes them as custom properties when #61
builds it.

## Not decided

The gallery and its cards, the docs pages, a "needs" card, the isometric
showcase, motion, and any width below 1200 px.

## For the method's retrospective

- Step 2 of the `direction` skill has a person pick four directions from text.
  Ophir could not do that with confidence: show a visual per option first.
- Artboards written without being rendered need a look before they reach the
  person; this round's workers could not render.
- A typeface choice needs a specimen at the design's real sizes and copy, not
  a full artboard.

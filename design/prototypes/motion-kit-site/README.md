# motion-kit.dev design: Module

The design Ophir picked for motion-kit.dev in the design round of
[#14](https://github.com/liqweed/motion-kit/issues/14), run with the needle-eye
method (`direction`, `model-routing`, `checks`). It is the **Module**
direction: a product manual. Pages are built from 8 px modules, and every
figure carries numbered callouts keyed to a legend.

## What is here

| Path | What |
|---|---|
| `hero-light.html`, `hero-dark.html` | The home hero with the live player |
| `where-it-runs-light.html`, `where-it-runs-dark.html` | The "Where it runs" section: five targets |
| `player-light.html`, `player-dark.html` | One frame of the recurring figure: the player at step 4 of 6 |
| `fonts/` | Instrument Sans and DM Mono, self-hosted (SIL OFL 1.1, licences beside them), Latin and Latin Extended |
| `assets/` | The logo and four real step frames of `examples/order-flow.json`, drawn by the product (steps 3 and 4, light and dark) |
| `canvas-source/` | The six Claude Design artboards these pages were converted from |
| `design-handback.json`, `screenshots/` | The landing check's scenarios and delivered screenshots (1440 and 1200 px wide) |
| `handback-report.json` | Written by `handback.ts merge` |

The decisions behind it (the pick, its rationale and the token plan) are in
[`DECISION.md`](DECISION.md). The house values are pinned in
[`website/DESIGN.md`](../../../website/DESIGN.md).

## Provenance

Claude Design drew the artboards on a canvas on 2026-11-20 from a brief that
held the product's real copy; the canvas keeps no version history. The six
Module artboards (three, light and dark) were then copied here as
`canvas-source/` and converted to static pages: the canvas wrapper and runtime
were removed, the web-font link was replaced by the self-hosted files, and the
canvas's uploaded images became files under `assets/`. Nothing in the markup or
copy was changed otherwise. This is a hand conversion, not an export made by
Claude Design's own tool.

What this bundle does not show: the gallery, the docs pages, a "needs" card,
the isometric showcase, motion, and any width below 1200 px. Building the site
from it is [#61](https://github.com/liqweed/motion-kit/issues/61).

Bar outcome: pending

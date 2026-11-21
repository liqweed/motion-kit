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
| `where-it-runs-light.html`, `where-it-runs-dark.html` | The "Where it runs" section and its target list |
| `player-light.html`, `player-dark.html` | One frame of the recurring figure: the player at step 4 of 6 |
| `fonts/` | Instrument Sans and DM Mono, self-hosted (SIL OFL 1.1, licences beside them), Latin and Latin Extended |
| `assets/` | The logo and real step frames of `examples/order-flow.json`, drawn by the product |
| `canvas-source/` | The Claude Design artboards these pages were converted from |
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
canvas's uploaded images became files under `assets/`. The conversion also
adds ink outlines to amber markers and strengthens the light-page borders from
`#8b929c` to `#4b5563` where the contrast check required it. Subsequent
repository corrections add `box-sizing: border-box` and 2 px `#f3f4f6`
keylines to the five dark target markers in both the static page and its
archived canvas-source counterpart. Those are post-delivery contrast fixes,
not attributes of the raw Claude Design export; other markup and copy are
unchanged. This is a hand conversion, not an export made by Claude Design's
own tool.

What this bundle does not show: the gallery, the docs pages, a "needs" card,
the isometric showcase, motion, and any width below 1200 px. Building the site
from it is [#61](https://github.com/liqweed/motion-kit/issues/61).

Bar outcome: pass

Decided: Impeccable's detector (`impeccable@4.10.0 detect`, 2026-11-21) flags the primary typeface, Instrument Sans, as overused on the hero and "where it runs" pages (59% and 65% of their text). The pair Albert Sans + Spline Sans Mono, drawn as the variation, is not flagged. Ophir chose Instrument Sans + DM Mono before this was known; on 2026-11-21, after seeing both pairs side by side, they kept Instrument Sans + DM Mono. The flag is a heuristic, and `website/DESIGN.md` records the outcome.

Export base: 343535f6be880c246f19bde9c11194d5f5c95dc4
Export base provenance: raw export
Previous export base: 343535f6be880c246f19bde9c11194d5f5c95dc4
Previous export base provenance: first-added fallback (no recorded raw export)

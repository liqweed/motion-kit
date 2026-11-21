# Review scorecard: motion-kit-site (Module)

Reviewed by Claude on 2026-11-21 against [`RUBRIC.md`](RUBRIC.md), for
[#14](https://github.com/liqweed/motion-kit/issues/14). The review looked at
the rendered pages at 1440 and 1200 px in both themes (the landing check's own
renders, read as images), computed contrast from the colour values the pages
use, and read the markup.

Reviewed export base: 343535f6be880c246f19bde9c11194d5f5c95dc4

## Rows

| # | Bar | Result | Note |
|---|---|---|---|
| 1 | Renders at every width, no external request, error or overflow | Pass | Landing check |
| 2 | Fonts self-hosted, open licence, licences in the bundle | Pass | Instrument Sans and DM Mono, SIL OFL 1.1, `fonts/` |
| 3 | No forbidden terms | Pass | Landing check |
| 4 | Real copy only | Pass | Every line of the brief's copy is present verbatim. The pages add structural labels, no claims: `Fig. 1` to `Fig. 3`, `Counter`, `Caption`, `Steps`, `Paused` |
| 5 | Motion canon | Pass | The pages have no script, transition or animation. The design's one motion moment is not built yet |
| 6 | Contrast, both themes | Pass after one fix | See finding 1 |
| 7 | The diagram is the product's own frame | Pass | `assets/frame-*.svg` come from `examples/order-flow.json`, unredrawn and uncropped |
| 8 | Real controls, focus state, target size | Pass with a finding | Real `<button>` and `<a>`, labelled, amber focus ring (3.2:1 on white). See finding 2 |
| 9 | The look is the picked direction's | Pass with a finding | Instrument Sans and DM Mono, square corners, 8 px ruler, numbered callouts keyed to a legend. See finding 3 |
| 10 | A person picked this design | Pass | `motion-kit-site/DECISION.md` |

## Findings

1. **Fixed.** In the light theme the neutral `line` colour on a plate is 2.85:1
   and emphasis on a plate is 2.89:1, just under the 3:1 bar for shapes. They
   occur on small state markers: the 8 px step dots and the 24 px numbered
   outlines. The text counter says the same thing, but the bar is the bar. The
   outlines now use `muted` (6.9:1 on the plate) and the amber marks have a 1 px
   ink outline. No new colour. Dark passes without a change (5.6:1 or better).
   The same weakness lies in the shipped neutral style itself, where `line` on
   `surface` is 2.85:1; the site build should not put information-bearing
   shapes in that pair.
2. **Open, for #61.** The design draws 40 px controls. The product's own
   player has 44 px targets (#37). The site should keep the product's 44 px.
3. **Open, for #61.** The hero's callout leaders point at the player's
   controls, not at parts of the diagram, because the scene exposes no anchors
   for page callouts. The design's motion moment (leaders drawing to the
   diagram) needs them; see the issue filed for it.
4. **Open.** The arrow in `frame(t) → SVG` is not in the Latin subset of
   either typeface and falls back to a system glyph.

## Not covered by this bundle

The gallery, the docs pages, a "needs" card, the isometric showcase, motion,
and any width below 1200 px.

Bar outcome: pass

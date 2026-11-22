---
release: minor
---

### Added

- Bars with rolling values for custom scenes, in `kit` beside the connectors. `hatchPattern` makes a pattern of diagonal lines at 45° in a token colour, its id built from the frame's `idPrefix` so two instances on a page never share one; `drawTrack` fills a rounded, empty bar with it; `drawBar` grows a bar, rounded at both ends, over the track; `barProgress` gives its growth on the style's movement curve and `barEnd` the time it has settled; `drawValue` and `rollingValue` roll a number from a start value to its end value with the bar's progress, formatted by the caller (units, decimals, locale), and show exactly the end value once the bar has settled. The hatch draws the same in the live player, the baked SVG, PNG and video. A bar grows once inside its step's beat and rests; nothing repeats. Colours are style tokens. **Consumer action:** none.
- A generic example, `examples/bars.scene.mjs`: three rows of a small benchmark that reveal top to bottom, one step each. It plays once, holds its final frame, lasts 4.45 s and passes the gate in every format and in English and Dutch. The `animated-diagram` skill's custom-scenes and motion-vocabulary references describe the parts and the timing rule. **Consumer action:** none.

---
release: minor
---

### Changed

- **Breaking:** the label gate (`labelBoxes()`) now fails a box with a negative `width` or `height`, which it used to pass. **Consumer action:** required at machine. Fix any custom scene whose label boxes have a negative size, or whose footprints repeat a vertex (see Fixed), as it now fails the gate.
- `labelAnchor` returns its box and stem rounded to two decimals, as the SVG attributes are drawn, so the gate and the picture agree: a label whose left edge is -0.004 is drawn at x = 0 and no longer fails as outside the picture. Each coordinate and dimension is rounded independently, so a raw gap of 3.999 px is not always drawn as 4 px. `labelPill` boxes are not rounded: a reported edge derived from `x + width` or `y + height` can differ from the drawn one by up to 0.01 px.
- `labelProblems(boxes, { width, height, limit })` takes a `limit` (a whole number from 0, or Infinity; default all) and the gate stops collecting once it has the problems it reports, so a scene of a thousand colliding labels no longer builds half a million messages. The limit bounds the diagnostics collected; the collision scan can end early after the boxes are prepared. Code that counts `labelProblems` results sees one sentence per distinct diagnostic string, not one per collision.

### Fixed

- A solid's footprint that repeats a vertex in a way the old check missed (the unit square traversed twice, say) was accepted and drew faces and sides twice. `prism` and every solid built on a caller-supplied footprint now throw "a solid's footprint has a repeated point" for such a nonadjacent repeat.

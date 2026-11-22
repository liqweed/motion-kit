---
release: patch
---

### Fixed

- A solid's footprint that visits one vertex twice (the unit square traversed twice, say) was accepted and drew every face twice. `prism`, `box`, `slab` and every solid built on the footprint check now throw "a solid's footprint has a repeated point" for any repeated vertex, adjacent or not.
- The label gate (`labelBoxes()`) now fails a box with a negative `width` or `height`, which it used to pass although the box left the picture.
- The label gate stops collecting once it has the problems it reports: a scene of a thousand colliding labels no longer builds half a million messages in one call. `labelProblems(boxes, { width, height, limit })` takes a `limit` (default: all problems).
- `labelAnchor` returns its box and stem rounded to two decimals, as the SVG attributes are drawn, so the gate and the picture agree: a label whose left edge is -0.004 is drawn at x = 0 and no longer fails as outside the picture, and a raw gap of 3.999 px, say, is drawn as 4 px and no longer fails the gap check (an example, not a guarantee: each coordinate and dimension is rounded independently, so the drawn gap depends on the position). **Consumer action:** none.

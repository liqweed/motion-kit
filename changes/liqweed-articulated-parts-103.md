---
release: minor
---

### Added

- A custom scene can draw a tilted solid: `kit.rotateSolid(solid, { axis, deg, about })` turns a prism, box or rounded box without `top` content (such a solid throws: content on a plane is horizontal) about an axis through a point, so a link, lever or ramp can lean. It is outlined and shaded under the same token rules as an upright solid, and `orderSolids` and `drawSolids` order it against upright prisms and other tilted solids, through a camera swivel, including solids that touch at a pivot. Scenes without a tilted solid draw byte for byte as before. **Consumer action:** none.

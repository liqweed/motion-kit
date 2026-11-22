---
release: minor
---

### Added

- Rounded solids for the isometric kit's custom scenes: `roundedBox` and `roundedSlab` give a box rounded corners, and the rounded sides draw as one smooth wall, outlined once, instead of a stroked face per sample. They take the same tokens, shade and depth order as `box` and `slab`.
- `drawGrid`, a faint diamond-grid backdrop in the floor plane that follows the camera, fades out radially from the centre and sits under the solids. It is static: nothing shimmers or pans while a step rests.
- 2D content on a horizontal plane: a solid's `top` draws ordinary SVG (an icon, text, rects) on its top face, in its own units, and `drawOnPlane` and `planeMatrix` do the same for any plane at a height. The content follows the camera, through a `lerpCamera` swivel included.
- `labelPill`, a stemless pill tag whose box the label gate checks with the other labels.
- A generic example, `examples/isometric-platform.scene.mjs`: a rounded platform with a mark on its top face, seen in plan and then turned isometric, with two pill tags. It plays once, holds its final frame, lasts 4.6 s and passes the gate in every format and in English and Dutch. The `animated-diagram` skill's custom-scenes and motion-vocabulary references describe the new parts. **Consumer action:** none.

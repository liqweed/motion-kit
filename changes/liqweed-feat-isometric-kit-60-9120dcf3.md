---
release: minor
---

### Added

- An isometric kit for custom scenes, in `kit` beside the rest of the runtime. A camera (azimuth, elevation, pan and zoom) projects a world of x, y and height onto the picture: 90° elevation is the plan view, a 45° azimuth with `ISO_ELEVATION` is true isometric, and a swivel from one to the other is `lerpCamera` between two cameras, which `fitCamera` keeps in the frame. Solids (`box`, `slab`, `prism`) take their face colours from style tokens and shade their sides with a second token, so they follow every style and theme; `orderSolids` and `drawSolids` draw them far to near. `labelAnchor` places a label with a stem in the projected view. **Consumer action:** none.
- Several tokens can travel at once. `tokensAlong` and `tokenPoints` place any number of tokens on one path or on a path each, each with its own start, duration and easing, still as a pure function of time; a scene keeps its steps settled by having every token arrive before the step. `path3` positions a token by distance along a path through the world, so with a linear `ease` its speed is constant whatever the camera does. **Consumer action:** none.
- The scene gate checks labels. A scene that returns `labelBoxes(t)` (the boxes `labelAnchor` makes) fails `motion-kit check` when two labels overlap, a stem runs through another label, or a label leaves the picture, at any sampled time or step. **Consumer action:** advised at configuration. Return `labelBoxes` from a custom scene that places its own labels, to have the gate check them.
- A generic example, `examples/isometric-swivel.scene.mjs`: four stations seen in plan, turned to isometric, then three work items travel the line together. It plays once, holds its final frame, lasts 7.1 s and passes the gate in every format and in English and Dutch. The `animated-diagram` skill's custom-scenes and motion-vocabulary references describe the kit. **Consumer action:** none.

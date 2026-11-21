---
release: minor
---

### Added

- Connectors for custom scenes, in `kit` beside the isometric kit. `connectorPath` routes through flat points, or through world points projected by a camera; `drawConnector` draws it on as a dashed line with an optional open-V arrowhead, and it rests as a dashed line. `drawJunction` draws a diamond where connectors turn, split or join, flat on the picture or lying in the floor plane of an isometric view, and lights it when a pulse arrives. `drawPulse` sends a light with a glow and a fading tail along a connector once, from its start to its end, and removes it on arrival (or holds it at the end with `hold`); `pulseEnd` gives the time it is over, so a scene keeps every step settled. Nothing repeats: a pulse runs once, inside its step's beat, like a token. Colours are style tokens. **Consumer action:** none.
- A generic example, `examples/connectors.scene.mjs`: a request fans out through a diamond splitter to three services, then a result rides an isometric feeder line through three junctions. It plays once, holds its final frame, lasts 6.9 s and passes the gate in every format and in English and Dutch. The `animated-diagram` skill's custom-scenes and motion-vocabulary references describe the parts and the pulse's timing rule. **Consumer action:** none.

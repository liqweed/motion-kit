---
release: patch
---

### Fixed

- `motion-kit build` gave a custom scene's `kit` no isometric helpers: `kit.camera`, `kit.box`, `kit.drawSolids`, `kit.labelAnchor` and the rest were undefined in the built page, though the scene passed `check` and `export` in Node. A built page now hands the module the same `kit` as Node, name for name. **Consumer action:** none. A scene that used the player or a scene type through `kit` in a built page (never possible in Node) must import them instead.

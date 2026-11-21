---
release: patch
---

### Fixed

- `motion-kit build` gave a custom scene's `kit` no isometric helpers: `kit.camera`, `kit.box`, `kit.drawSolids`, `kit.labelAnchor` and the rest were undefined in the built page, though the scene passed `check` and `export` in Node. A built page now hands the module the same `kit` as Node, name for name; the player and the scene types, which only a built page ever offered through `kit`, are no longer on it. **Consumer action:** only for a custom scene that read the player, `createScene`, `mountPlayer` or the page-link helpers (`scrollSteps`, `linkSteps`) from `kit` in a built page: those names were never in `KIT` or in Node, so such a scene already failed `check` and `export`. Import them from the vendored `runtime/` modules instead, or build the page from a spec, then rebuild. Every other scene needs nothing.

---
release: minor
---

### Added

- Build state-machine and request-journey specs with explicit branches, cycles, self-transitions, async hops and component regions. Includes bilingual examples in every format. **Consumer action:** none.
- Subscribe to player step changes with `controller.onStep(callback)`; surrounding page helpers follow player controls and release subscriptions on disposal. **Consumer action:** none.
- Export a custom module's `locales` array to check every shipped language automatically in both CLI and vendored gates. **Consumer action:** advised at configuration. Declare all shipped locales in custom modules, or pass them explicitly to check.

### Changed

- **Breaking:** localized dictionaries require the requested translation instead of silently falling back to another language. Plain strings remain shared across locales. **Consumer action:** required at configuration. Supply every requested locale in localized strings before building or checking scenes.
- **Breaking:** bake and video now reject scenes or styles that fail the same gate as build and export. Duration is limited to 12 seconds; the design target remains 8 seconds. **Consumer action:** required at configuration. Fix gate errors before baking or rendering video.
- Style radius and stroke now control built-in node corners and line widths. Radius accepts 0–24 and stroke 1–4; custom scenes receive normalized style in their frame context. **Consumer action:** advised at configuration. Review non-default shape settings, which previously had no effect, and keep them within the supported ranges.
- Explicit seeks cancel pending autoplay and reject non-finite times. **Consumer action:** none.

### Fixed

- Export input hashes include runtime bytes, format, locale and render settings so a runtime change invalidates stale exports. **Consumer action:** none.
- The gate rejects invalid dimensions and step times and checks the scene's raw final-frame hold without the renderer's time clamp. **Consumer action:** none.

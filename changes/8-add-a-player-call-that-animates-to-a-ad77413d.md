---
release: minor
---

### Added

- `playToStep(i)` on the player plays forward to a settled step and holds at that step’s time (an invalid index throws `RangeError`); going backward, or with reduced motion, jumps straight to the step. The step buttons and keyboard can opt in to animated navigation.
- A `<motion-diagram>` custom element embeds a diagram in plain HTML or any framework from an inline or URL spec, with appearance attributes and fallback content kept until it renders. `motion-kit vendor --adapter element` copies it into your project.

### Fixed

- Destroying a player, or interrupting its playback, now cleans up its timers and listeners.

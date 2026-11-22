---
release: minor
---

### Added

- A player controller exposes `playing` and `autoplayPending`, so a page that replaces one player with another (a layout change) can keep playback running and a pending autoplay pending. A destroyed controller reports no pending autoplay.

### Changed

- `pause()` now cancels a pending visible autoplay, so a player paused before it appeared stays paused when it scrolls into view. A page that relied on playback starting on entry after an offscreen `pause()` must now call `play()` itself. Every valid `seek()` also ends a pending autoplay, including one made by a step subscriber while the reset frame publishes.

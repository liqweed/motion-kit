---
release: patch
---

### Added

- A player controller exposes `playing` and `autoplayPending`, so a page that replaces one player with another (a layout change) can keep playback running and a pending autoplay pending. A destroyed controller reports no pending autoplay.

### Changed

- `pause()` now cancels a pending visible autoplay, so a player paused before it appeared stays paused when it scrolls into view.

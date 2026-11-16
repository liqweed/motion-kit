# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-16

### Added

- `playToStep(i)` on the player plays forward to a settled step and holds at that step’s time (an invalid index throws `RangeError`); going backward, or with reduced motion, jumps straight to the step. The step buttons and keyboard can opt in to animated navigation.
- A `<motion-diagram>` custom element embeds a diagram in plain HTML or any framework from an inline or URL spec, with appearance attributes and fallback content kept until it renders. `motion-kit vendor --adapter element` copies it into your project.

### Fixed

- Destroying a player, or interrupting its playback, now cleans up its timers and listeners.

## [0.2.0] - 2026-11-16

### Added

- Published to npm as `@liqweed/motion-kit`; run it with `npx @liqweed/motion-kit`.

[Unreleased]: https://github.com/liqweed/motion-kit/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/liqweed/motion-kit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/liqweed/motion-kit/releases/tag/v0.2.0

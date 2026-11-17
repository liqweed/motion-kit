# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-11-17

### Added

- The player's `labels` option also takes a dictionary keyed by locale (`{ en: {…}, nl: {…} }`), chosen by a new `locale` option and falling back to the language subtag, then `en`. The Astro and `<motion-diagram>` adapters pass the locale; the element gains a `labels` attribute.
- Keyboard step changes (←/→/Home/End) are announced to screen readers through a polite live region.
- The Astro adapter mounts custom scene modules: `module="/src/diagrams/flow.scene.mjs"` names a module under `src/`, and `options` passes serializable scene options (text from the page's dictionary, a view) to its factory, on the server and in the browser.
- Custom scene modules take scene options from every caller: the factory gets `{ ...options, format, locale, kit }`. `motion-kit check`, `export`, `build`, `bake`, `video` and `icon` take `--options` (inline JSON, a `.json` file, or an `.mjs` exporting `({ format, locale }) => options`), so a module is gated and exported with the text a site shows.
- The Astro adapter takes `theme` (`light` or `dark`) and `style` (token data), and an `id` that names the root element. Page scripts reach its player through the root element's `controller` and the `motion-ready` event, as with `<motion-diagram>`.
- Steps can carry a stable `id` (in specs on a node, hub or spoke, and in custom scenes), and `seekStep` and `playToStep` accept it as well as an index; an unknown id throws `RangeError`.
- `frame(t, { idPrefix })` receives a prefix unique to each rendered instance, for the ids of clip paths, gradients, masks and markers. Players, server renders and baked SVG slices each get their own, so two instances on one page share no ids.
- `playerMarkup`, `themeCss` and `PLAYER_CSS` server-render the player's first state: the final frame, the step list and the style's colours, with the controls inert until the player mounts. The Astro adapter and `motion-kit build` use them, so diagrams are complete without JavaScript and mounting causes no layout shift.
- `motion-kit check` takes `--format` and `--locale` more than once.
- A contributing guide and a page on the public API and what semver promises for it ([stability](docs/stability.md)).

### Changed

- **Breaking:** the gate refuses a scene whose frames contain fixed ids: build them from `idPrefix`, as in `${idPrefix}-clip`. **Consumer action:** advised at configuration. Re-vendor and run the gate; a custom scene that defines ids fails until it builds each id from `frame(t, { idPrefix })`. **Detect:** `file:**/*.scene.mjs`.
- The vendored `check.mjs` runs the same checks as `motion-kit check`: custom modules, `--locale`, `--style` with the contrast check, and `--options`. A file it cannot load fails on its own, and the remaining files are still checked. **Consumer action:** advised at configuration. Re-vendor, then pass your locales, style and scene options to `check.mjs` in CI.
- Every player control is at least 44 × 44 px, and the caption and play button keep the size of their longest text, so playback no longer moves the page.
- The player's stage is a named group with a keyboard hint (the new `keys` label), and the controls group is named by the `steps` label.
- Autoplay starts once 40 % of the diagram or 40 % of the viewport shows, so diagrams taller than the screen autoplay. While a diagram is out of view or hidden (`display: none`), its clock waits and nothing is drawn; it resumes where it stopped.
- The player sets its colour tokens one CSS property at a time, so inline CSS the page put on the container stays.
- `motion-kit build` passes `kit` to custom modules, so modules that take the runtime from `kit` build too.
- The export contact sheet's phone row shows the scene's `tall` layout, as a phone shows it, instead of the exported frame scaled down.
- A style's `font` may no longer contain `<`, `>`, `{`, `}`, `;` or `\`, which could break out of CSS.

### Fixed

- The Astro adapter now destroys its players on view-transition swaps and mounts the new page's diagrams, instead of mounting once per page load.
- `mountPlayer` releases any player already mounted on the same container, so remounting no longer leaks its clock, observer or capture entry.
- `motion-kit build` output and the Slidev adapter support the same features: label dictionaries resolve in built HTML, and Slidev announces each click's step.
- The player adds its stylesheet again when a page swap (Astro view transitions) removed it, so players mounted after client-side navigation are styled.
- The vendored gate no longer crashes on a custom scene module.

## [0.3.0] - 2026-11-16

### Added

- `playToStep(i)` on the player plays forward to a settled step and holds at that step’s time (an invalid index throws `RangeError`); going backward, or with reduced motion, jumps straight to the step. The step buttons and keyboard can opt in to animated navigation.
- A `<motion-diagram>` custom element embeds a diagram in plain HTML or any framework from an inline or URL spec, with appearance attributes and fallback content kept until it renders. `motion-kit vendor --adapter element` copies it into your project.

### Fixed

- Destroying a player, or interrupting its playback, now cleans up its timers and listeners.

## [0.2.0] - 2026-11-16

### Added

- Published to npm as `@liqweed/motion-kit`; run it with `npx @liqweed/motion-kit`.

[Unreleased]: https://github.com/liqweed/motion-kit/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/liqweed/motion-kit/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/liqweed/motion-kit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/liqweed/motion-kit/releases/tag/v0.2.0

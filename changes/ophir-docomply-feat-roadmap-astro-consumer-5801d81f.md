---
release: minor
---

### Added

- The Astro adapter mounts custom scene modules: `module="/src/diagrams/flow.scene.mjs"` names a module under `src/`, and `options` passes serializable scene options (text from the page's dictionary, a view) to its factory, on the server and in the browser.
- Custom scene modules take scene options from every caller: the factory gets `{ ...options, format, locale, kit }`. `motion-kit check`, `export`, `build`, `bake`, `video` and `icon` take `--options` (inline JSON, a `.json` file, or an `.mjs` exporting `({ format, locale }) => options`), so a module is gated and exported with the text a site shows.
- The Astro adapter takes `theme` (`light` or `dark`) and `style` (token data), and an `id` that names the root element. Page scripts reach its player through the root element's `controller` and the `motion-ready` event, as with `<motion-diagram>`.
- Steps can carry a stable `id` (in specs on a node, hub or spoke, and in custom scenes), and `seekStep` and `playToStep` accept it as well as an index; an unknown id throws `RangeError`.
- `frame(t, { idPrefix })` receives a prefix unique to each rendered instance, for the ids of clip paths, gradients, masks and markers. Players, server renders and baked SVG slices each get their own, so two instances on one page share no ids.
- `playerMarkup`, `themeCss` and `PLAYER_CSS` server-render the player's first state: the final frame, the step list and the style's colours, with the controls inert until the player mounts. The Astro adapter and `motion-kit build` use them, so diagrams are complete without JavaScript and mounting causes no layout shift.
- `motion-kit check` takes `--format` and `--locale` more than once.
- A contributing guide and a page on the public API and what semver promises for it ([stability](../docs/stability.md)).

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

- The player adds its stylesheet again when a page swap (Astro view transitions) removed it, so players mounted after client-side navigation are styled.
- The vendored gate no longer crashes on a custom scene module.

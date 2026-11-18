# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2026-11-18

### Added

- A style can name the curves its diagrams move on. `motion.enter` (entrances) and `motion.move` (movement between visible states, fills, draw-on) are each the four numbers of a CSS `cubic-bezier(x1, y1, x2, y2)`, every number from 0 to 1 so nothing overshoots. A diagram can now match the page it sits on; durations and step times do not change, so step frames stay settled, and a style without `motion` moves as before. Custom scenes read the curves with `kit.easings(style.motion)`. To match a site's easing, add `"motion": { "move": [0.23, 1, 0.32, 1] }` to the style file. **Consumer action:** none.

### Changed

- The `animated-diagram` skill's description says what it is not for (page and component micro-interactions, faux product-UI demos, hero illustrations, decorative effects), and `motion-vocabulary.md` records where the motion vocabulary departs from interface-motion standards such as Emil Kowalski's `choreograph`, so an agent with both installed does not "fix" a scene's uniform stagger or settled steps. **Consumer action:** none.

## [0.7.0] - 2026-11-18

### Added

- Import a Mermaid flowchart with `motion-kit import flow.mmd --out flow.json`. A plain chain becomes a `sequence` spec; a chart with branches, joins, link labels or dotted links becomes a spec of the new `flowchart` type, laid out once at build time and checked in every format. Styling statements are ignored with a warning; subgraphs, `click`, unsupported shapes and link kinds fail with an error naming the line. **Consumer action:** none.
- Build `flowchart` specs: 2–12 nodes with `box`, `round`, `pill` and `decision` shapes, labelled, dashed and arrowless links, back edges, and a stored layout (`rank`, `pos`, `via`) that every format scales without re-laying out the graph. **Consumer action:** none.
- Check whether a vendored copy is behind the latest release with `motion-kit outdated <dir>`, which compares its `MOTION_KIT_VERSION` with npm and exits 1 when a newer version exists. **Consumer action:** advised at configuration. Run it in CI, or now and then, in repositories that vendor motion-kit.

## [0.6.0] - 2026-11-18

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

## [0.5.0] - 2026-11-18

### Added

- Two new scene types. `timeline` (`events` with `when`, `label`, optional `planned`, and an optional `now` marker) drops milestones onto an axis, horizontal in wide formats and vertical in tall ones. `stack` (`layers`, listed top to bottom, with `direction: "down" | "up"`) builds the layers bottom-up, then a packet travels through them. Examples: `examples/incident.json` and `examples/web-stack.json`.
- `runtime/links.mjs` connects page content to a player. `scrollSteps(controller, sections)` moves to a settled step as each text section reaches a line across the viewport: one section forward plays, any other move jumps. `linkSteps(controller, root)` selects a step when a reader hovers, focuses or clicks an element with `data-mk-step`, given as a step id or an index. Both jump under reduced motion, mark the active element with `aria-current="step"`, and return a function that removes them. Built pages expose them as `MotionKitRuntime.scrollSteps` and `MotionKitRuntime.linkSteps`.
- The export manifest records `sourceDirty`: `true` when the source file differs from `sourceCommit` (modified, staged or untracked), `false` when it does not, `null` outside git.
- A scene can declare extra colour pairs it draws as `contrastPairs`, and the gate checks the style against them. `CONTRAST_PAIRS` and `CONTRAST_EXEMPT` in `runtime/style.mjs` list the shared pairs and the exempt ones, each exemption with its reason.
- `motion-kit --version` prints the version.

### Changed

- The live player updates the SVG in place: nodes that persist between frames are kept, and only changed attributes and text are written. On a scene of about 25 KB per frame, a frame costs about a third of what it did. What each frame shows is unchanged, and exports, baked SVG, video and the server render are untouched. Don't put CSS transitions on a diagram's SVG elements: the nodes now persist, so a transition would run between frames.
- The skills find the CLI through `MOTION_KIT_HOME`, then the npm package through `npx` at the plugin's version (which installs the PNG renderer), then the plugin copy. They no longer look for a clone at `~/workspace/motion-kit`.
- **Breaking:** the colour check (G4) accepts only `var(--mk-*)` tokens, `url(#…)` references and colourless keywords (`none`, `currentColor`, `transparent`, `inherit` and the like) in colour attributes and colour style properties. Named colours such as `fill="red"`, other custom properties and every colour function now fail. Text content is no longer scanned. **Consumer action:** advised at configuration. Re-vendor and run the gate; replace any colour that is not a token with `tok(…)`. **Detect:** `file:**/*.scene.mjs`.
- **Breaking:** the gate renders every sample under stubbed clocks and randomness as well, so a frame that reads `Date`, `performance.now`, `Temporal.Now` or `Math.random` in a helper it calls now fails, not only in its own source. It compares output under two stubbed clocks at the sampled times; it does not catch every clock read, such as one that changes output only at other times. Each step frame must also equal the frames up to 45 ms after it, so motion that runs slowly through a step fails. **Consumer action:** advised at configuration. Re-vendor and run the gate; make each step's motion end by the step's `at`, and the next one start at least 50 ms later. **Detect:** `file:**/*.scene.mjs`.
- **Breaking:** the contrast check also requires emphasis on accent at 3:1, in both themes. A style whose emphasis sits close to its accent now fails `motion-kit check --style`; on a light canvas this usually means a darker accent. **Consumer action:** advised at configuration. Run `motion-kit check <a scene> --style <your style>` and adjust the tokens it names. **Detect:** `file:**/*style*.json`.
- The neutral style's light accent is darker (`#2563eb` → `#1d36a8`) and its dark emphasis lighter (`#f59e0b` → `#fbbf24`), so neutral passes the extended contrast check. Diagrams and the logo drawn in neutral change colour.

### Fixed

- Exporting again into the same folder removes the files the previous export wrote and the new one does not, so stale step frames no longer sit next to the new ones. Files no export wrote are left in place and named in a warning, unless the new export writes a file of the same name, which it overwrites.

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

[Unreleased]: https://github.com/liqweed/motion-kit/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/liqweed/motion-kit/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/liqweed/motion-kit/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/liqweed/motion-kit/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/liqweed/motion-kit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/liqweed/motion-kit/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/liqweed/motion-kit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/liqweed/motion-kit/releases/tag/v0.2.0

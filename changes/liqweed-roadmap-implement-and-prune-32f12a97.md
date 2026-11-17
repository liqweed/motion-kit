---
release: minor
---

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
- **Breaking:** the gate renders every sample under stubbed clocks and randomness as well, so a frame that reads `Date`, `performance.now`, `Temporal.Now` or `Math.random` in a helper it calls now fails, not only in its own source. Each step frame must also equal the frames up to 45 ms after it, so motion that runs slowly through a step fails. **Consumer action:** advised at configuration. Re-vendor and run the gate; make each step's motion end by the step's `at`, and the next one start at least 50 ms later. **Detect:** `file:**/*.scene.mjs`.
- **Breaking:** the contrast check also requires emphasis on accent at 3:1, in both themes. A style whose emphasis sits close to its accent now fails `motion-kit check --style`; on a light canvas this usually means a darker accent. **Consumer action:** advised at configuration. Run `motion-kit check --style <your style>` and adjust the tokens it names. **Detect:** `file:**/*style*.json`.
- The neutral style's light accent is darker (`#2563eb` → `#1d36a8`) and its dark emphasis lighter (`#f59e0b` → `#fbbf24`), so neutral passes the extended contrast check. Diagrams and the logo drawn in neutral change colour.

### Fixed

- Exporting again into the same folder removes the files the previous export wrote and the new one does not, so stale step frames no longer sit next to the new ones. Files no export wrote are left in place and named in a warning.

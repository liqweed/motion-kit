---
title: motion-kit — public API and stability
status: draft
last_updated: 2026-11-22
---

# motion-kit — public API and stability

Consumers copy `runtime/` and an adapter into their repositories
(`motion-kit vendor`) or install `@liqweed/motion-kit` from npm. This page says
which parts of motion-kit are public, what each kind of release may change, and
how a vendoring consumer learns that a new version exists. The contract itself
is [`spec/technique.md`](spec/technique.md); this page names its surface.

## What semver promises

Versions follow [Semantic Versioning](https://semver.org/). While the version is
`0.x`:

- a **patch** release (`0.4.0 → 0.4.1`) never changes the public API below in a
  way that breaks a caller, a scene or a page;
- a **minor** release (`0.4 → 0.5`) may break it, and its changelog entry says
  what changed and what to do, under **Changed** or **Removed**;
- an export that is going away is first marked deprecated (JSDoc `@deprecated`
  and a changelog line) in one minor release, and removed no earlier than the
  next.

From `1.0` on, breaking changes come only in major releases.

Some kinds of change are not breaking, even though output differs:

- **Rendered output.** The same version renders the same bytes for the same
  input. A new version may draw differently (layout, motion, markup); the
  change note says so and the regenerated media show it.
- **Gate rules.** The gate may grow stricter in a minor release, when a new
  rule catches a defect (for example the rule that a scene's ids come from
  the instance prefix). The change note names the rule and how to comply.
- **Advice.** The canon rules (spec §11.2) are advice: advice wording may change in any release; a new advice rule is added in a minor release, because an unacknowledged one fails a scene in strict mode (it never fails one outside it; until #95 the advisory curve, type-range, shape-style and font-size rules still refuse to build; the change note names it, as it does a stricter gate rule), and advice never fails a scene
  unless `--strict` (or `MOTION_KIT_STRICT=1`) is on. A rule moving from hard to
  advice is not breaking; one moving from advice to hard is a gate rule growing
  stricter, as above. The `acknowledge` field and the rule ids it names
  (`duration`, `nothing-animates`, `step-labels-in-frame`, `emphasis-on-accent`)
  are public; the `advice` list in `manifest.json` is too. Retiring or renaming an id a scene may name makes that scene fail validation, so it is a breaking change.

## What is public

### Scenes

- The scene contract: `{ id, width, height, duration, title, description,
  steps: [{ at, label, detail?, id? }], frame(t, { idPrefix, style }), stepLabelsInFrame?,
  acknowledge?: [{ rule, reason }], contrastPairs?, labelBoxes?(t) }`
  and its rules (spec §1–§8).
- Custom scene modules: a default export `(opts) => scene`, called with
  `{ ...options, format, locale, kit }`, with optional exported `locales` for gate coverage.
- The spec format of each registered scene type (`sequence`, `hub-spoke`, `timeline`,
  `stack`, `state-machine`, `request-journey`, `flowchart`).
- Style data: `{ name?, font?, radius?, stroke?, motion?: { enter?, move? }, light: {token: "#rrggbb"}, dark: {…} }`
  and the token names in `TOKENS`.

### Runtime exports

| Module | Public exports |
|---|---|
| `runtime/scene.mjs` | `FORMATS`, `localize`, `validateScene`, `renderSvg` and its options, `stepTimes`, `stepIndexAt`, `stepIndex`, `safeId` |
| `runtime/types/index.mjs` | `createScene`, `SCENE_TYPES`, `SCENE_TYPE_PAIRS` |
| `runtime/kit.mjs` | `KIT`, `sceneFromModule` |
| `runtime/motion.mjs` | `clamp01`, `lerp`, `cubicBezier`, `linear`, `easeOut`, `easeStandard`, `easeIn`, `progress`, `window01`, `springStep`, `springSettleTime`, `springTo`, `SPRING_SETTLE_X`, `splitEdge`, `stagger` |
| `runtime/svg.mjs` | `esc`, `num`, `attrString`, `el`, `text`, `translate`, `scaleAbout`, `fade`, `dist`, `pointOnLine`, `trimSegment`, `polyline`, `cubic`, `drawOn`, `tokenPoints`, `tokensAlong`, `blurReveal`, `highlightSweep` |
| `runtime/iso.mjs` | `camera`, `CAMERA_PLAN`, `CAMERA_ISOMETRIC`, `ISO_ELEVATION`, `lerpCamera`, `fitCamera`, `projector`, `project`, `path3`, `box`, `slab`, `roundedBox`, `roundedSlab`, `prism`, `regularPolygon`, `orderSolids`, `drawSolid`, `drawSolids`, `drawGrid`, `planeMatrix`, `drawOnPlane`, `labelAnchor`, `labelPill`, `labelProblems` (the solid, plane and label-box shapes they take and return) |
| `runtime/connectors.mjs` | `connectorPath` (its `at`, `cut`, `tip`), `drawConnector`, `drawJunction`, `drawPulse`, `pulseEnd`, `pulseHead`, `PULSE_LAG` (the option and `run` shapes they take) |
| `runtime/bars.mjs` | `hatchPattern` (its `{ id, fill, markup }`), `drawTrack`, `drawBar`, `drawValue`, `rollingValue`, `barProgress`, `barEnd` (the option and `run` shapes they take) |
| `runtime/wrap.mjs` | `wrapLabel`, `estimateWidth` |
| `runtime/style.mjs` | `TOKENS`, `NEUTRAL`, `tok`, `normalizeStyle`, `cssVars`, `resolveTokens`, `contrast`, `checkContrast` (and its optional pair list), `contrastReport`, `sharedPairs`, `CONTRAST_PAIRS`, `CONTRAST_EXEMPT` |
| `runtime/patch.mjs` | `patchMarkup` |
| `runtime/player.mjs` | `mountPlayer` (its options and the controller: `seek`, `play`, `pause`, `seekStep`, `playToStep`, `onStep`, `destroy`, `time`, `scene`), `resolveLabels` and the label keys, `playerMarkup`, `themeCss`, `PLAYER_CSS` |
| `runtime/links.mjs` | `scrollSteps` and `linkSteps` (their options, the `data-mk-step` attribute, the `aria-current="step"` marks, the returned dispose function), `stepRef`, `sectionSteps`, `activeSection`, `scrollMove` |
| `runtime/bake.mjs` | `bake`, `bakeStats` |

`KIT` holds every export of `motion`, `svg`, `iso`, `connectors`, `bars`, `style`, `scene` and `wrap`; only
the ones listed above are covered. Anything else in `runtime/` (for example
`runtime/parts.mjs`, `withId`, `ENTRANCE_MAX`) is internal and may change in
any release.

### The player in the page

- The capture hook `globalThis.__motionKit[id]`.
- The class names pages style: `mk-player`, `mk-stage`, `mk-controls`,
  `mk-btn`, `mk-play`, `mk-scrub`, `mk-caption`, `mk-sr`, and the
  `data-mk-player-css` marker on the stylesheet. The markup inside them is not
  public: style by class, not by structure.
- Behaviour the spec states as MUST in §10.2 (autoplay, reduced motion, the
  keyboard, announcements). The 44 px control size is a SHIPPED DEFAULT (§10.2 says SHOULD); a page may override it, and the spec's accessibility condition (WCAG 2.5.8) still applies to the override.

### Adapters

- Astro (`AnimatedDiagram.astro`): its props (`spec`, `module`, `options`,
  `format`, `locale`, `theme`, `style`, `id`, `scrubber`, `labels`, `class`),
  the `/src/**/*.scene.{mjs,js}` module location, and the root element's
  `controller` with the `motion-ready` and `motion-error` events.
- `<motion-diagram>`: its attributes (`spec`, `src`, `format`, `locale`,
  `theme`, `style-spec`, `labels`), `.controller`, and the `motion-ready` and
  `motion-error` events.
- Slidev (`AnimatedDiagram.vue`): its props.

### Command line and files

- `motion-kit` commands, their flags and exit codes (`--help` lists them).
- The vendored gate, `check.mjs`, and its flags; the layout a vendored copy
  has (`runtime/`, `adapter/`, `lib/`, `check.mjs`, `LICENSE`,
  `MOTION_KIT_VERSION`).
- Export output: file names and the fields of `manifest.json`.

Not public: `lib/` modules imported directly, the website, tests and scripts.

## Learning about a new version

Each release has a GitHub release and an npm version, and `CHANGELOG.md` lists
what changed. A vendored copy records its version in `MOTION_KIT_VERSION`;
compare it with the latest:

```bash
npx @liqweed/motion-kit outdated src/motion-kit   # exit 1 and the re-vendor command when behind
```

It reads `MOTION_KIT_VERSION`, asks npm for the `latest` version (or the
mirror in `npm_config_registry`), and exits 0 when current, 1 when behind and
2 when it cannot tell. Run it on a schedule in CI to be told; or watch the
repository on GitHub with **Releases** selected. To
update, read the changelog entries in between, re-vendor from the new version,
and run the vendored gate:

```bash
npx @liqweed/motion-kit@latest vendor src/motion-kit --adapter astro
node src/motion-kit/check.mjs src/diagrams/*.json src/diagrams/*.scene.mjs
```

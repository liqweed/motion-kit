---
name: motion-render
description: "Render motion-kit scenes (animated diagrams) to deliverables: slide-ready step frames (SVG/PNG, per-format, light/dark), a review contact sheet, zero-JS baked SVG, self-contained HTML for Craft Pages, and MP4/WebM/GIF video in 16:9, 1:1, 4:3 or 9:16, plus format × locale variant matrices. Use when asked to 'export the diagram', 'make slides from the animation', 'render a video / reel / GIF of the diagram', 'vertical version for social', or to package diagram outputs. To design or build the diagram itself use animated-diagram."
---

# Motion render

All outputs come from the same pure scene, so they always agree. Locate the
toolkit as in the animated-diagram skill's "Locate the toolkit": first
`MOTION_KIT_HOME`, then the npm package through `npx` (at the version of these
skills), then the plugin copy two levels above this skill. PNG and video need
`@resvg/resvg-js`, which the `npx` route installs; video also needs `ffmpeg`.
The plugin copy alone has neither, so prefer `npx` there.

```bash
PLUGIN="$(cd -P "<this skill's base directory>" && cd ../.. && pwd -P)" # -P: the base may be a symlink to a clone
V="$(node -p "require(process.argv[1] + '/package.json').version" "$PLUGIN")"
if [ -n "${MOTION_KIT_HOME:-}" ]; then
  MK="$MOTION_KIT_HOME"; mk() { node "$MK/cli/motion-kit.mjs" "$@"; }
elif npx -y "@liqweed/motion-kit@$V" --help >/dev/null 2>&1; then
  MK="$PLUGIN"; mk() { npx -y "@liqweed/motion-kit@$V" "$@"; }
else
  MK="$PLUGIN"; mk() { node "$MK/cli/motion-kit.mjs" "$@"; }
fi
```

**Always run `mk check <scene>` first.** Exporters refuse scenes that fail the gate. The gate also gives *advice* on the motion canon (a scene over 12 s, a still scene, step labels the frame does not draw); advice never stops an export, unless `--strict` (or `MOTION_KIT_STRICT=1`) is on and the scene has not acknowledged it. Every exporter prints the same advice as `check`.

## Slides

```bash
mk export spec.json -o out/slides -f 16:9 -l nl --png --scale 2 [--background] [--theme dark] [--style brand.json]
```
One `NN-<step>.svg` (+ `.png`) per build step, tokens resolved. Put one step
per slide at an identical position and size; transition None, Dissolve or
Morph. Details and per-app notes: `references/slides.md`.
Slidev decks: use the Slidev adapter instead (click-driven, live). See the
animated-diagram skill, `references/targets.md`.

## Review sheet

```bash
mk export spec.json -o out/review --png --qc
```
`index.html` holds the steps, frames 0.2 s before and after each step, a phone-size row (the
scene's `tall` layout at 360 px, as a phone shows it; if the tall layout fails the gate or cannot be built, the row shows the reason and the last primary frame instead, so check that it shows the tall layout, or that `manifest.json` has a `phone` entry) and the review checklist. Do not approve a row that shows the reason or the primary frame: it is not the tall layout, and the approval line covers only what the sheet shows. Fill in the review report (animated-diagram
`references/qc.md`) and get a human approval line before delivery.

## Video

```bash
mk video spec.json -f 9:16 -o out/reel.mp4 --fps 30 --scale 2 --hold 1.5 --sheet out/reel-sheet.png
mk video spec.json -f 16:9 -o out/demo.webm
mk video spec.json -f wide -o out/readme.gif --fps 15 --scale 1
```
Formats, sizes, encoder settings, variant matrices and the HyperFrames handoff:
`references/video.md` and `references/formats.md`.

## Other outputs

```bash
mk build spec.json -o out/page.html -f wide         # Craft Page / standalone interactive
mk bake  spec.json -o out/diagram.svg -f wide --fps 12   # zero-JS animated SVG
```

`bake` and `video` refuse more than 20,000 frames (a hard resource limit, not advice; no acknowledgement waives it): `bake` counts `ceil(duration × fps) + 1`, `video` counts `round((lead + duration + hold) × fps)`. For a very long scene lower `--fps`; `icon` bakes at 15 fps, so shorten the scene instead.

A custom module whose text comes from the caller (a site's dictionary) takes
scene options: `--options labels.json`, inline JSON, or an `.mjs` whose default
export is `({ format, locale }) => options`. `check`, `export`, `build`, `bake`,
`video` and `icon` pass them to the module's factory unchanged.

For plain HTML or a framework-independent live embed, use
`mk vendor public/motion-kit --adapter element`, then load
`./motion-kit/adapter/motion-diagram.mjs` with `type="module"` and place
`<motion-diagram src="./spec.json" format="wide">` around a final-frame SVG
or image fallback. Copy the spec to `public/spec.json` and serve over HTTP.
Inline JSON (`spec` attribute or child
`script[type="application/json"]`), `locale`, `theme` and JSON `style-spec`
are supported; the normal `style` attribute stays CSS. The element exposes
`controller` after `motion-ready`, preserves the fallback during loading or
errors, and cleans up on disconnect. Full usage: `adapters/element/README.md`.

## Delivery package

```
<name>/
  spec.json (+ style.json)       source of truth: edit and re-render
  slides/   NN-step.svg|png, manifest.json, index.html
  video/    <name>-<format>.mp4, sheet.png
  web/      <name>.html, <name>.svg (baked)
  REVIEW.md                      review report with human approval line
```
`manifest.json` records scene, type, format, locale, size, duration, style,
theme, an input hash, the advice the gate gave (each piece with `acknowledged`, and
the scene's `reason` when it acknowledged it), the source commit and `sourceDirty` (`true` when the
source file has uncommitted changes, so the frames match no commit; `null`
outside git), with no timestamps, so a re-render from the same inputs is
byte-identical and a stale export is easy to spot. Deliver from a clean
source (`sourceDirty: false`).

Re-exporting into the same folder replaces the previous export: files its
`manifest.json` listed that the new export does not write are deleted, so the
folder holds exactly what the new manifest lists. Files no export wrote are
left alone and named in a warning; keep notes and review files elsewhere.

The CLI gates `build`, `export`, `bake`, `video` and `icon` before writing
output, including the style contrast of the pairs the scene draws (a shared pair it does not draw is only a printed warning), and print its advice the same way as `check`. `build` also holds the style to what the page's player paints, whatever the scene declares: ink/surface, onAccent/accent, muted/bg, emphasis/bg, line/bg, accent/bg, and ink/bg for the heading unless `--no-heading`; so `check` can pass where `build` fails. Exports
include `runtimeHash`, a SHA-256 of runtime module paths and bytes, in the
manifest and in `inputHash`, together with format, locale and render settings.
A changed runtime invalidates the hash even before its package version changes.
The hash does not recursively fingerprint arbitrary imports of custom scenes.

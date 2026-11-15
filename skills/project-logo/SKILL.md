---
name: project-logo
description: "Design a project's logo / avatar / app icon as a motion-kit scene and write the icon set where tools discover it: assets/icon.png (Conductor), .idea/icon.svg (JetBrains IDEs), assets/icon.svg + an animated SVG for the README. Use when asked for 'a logo', 'an avatar', 'a repo icon', 'a project icon', 'an icon for Conductor / IntelliJ', or to refresh a project's mark. Also writes a prompt for an external vector generator (Quiver) when the user wants a second option."
---

# Project logo

A logo here is a **square motion-kit scene whose final frame is the mark**.
That gives you, from one source file: a static SVG, a PNG at any size, a
light and dark variant, and an animated SVG intro that plays once and holds.
Same gate, same determinism as any diagram.

## Locate the toolkit

```bash
MK="$HOME/workspace/motion-kit"                 # canonical clone (has node_modules)
[ -d "$MK" ] || MK="$(cd "<this skill's base directory>/../.." && pwd)"   # plugin copy
mk() { node "$MK/cli/motion-kit.mjs" "$@"; }
```
Node ≥ 22. PNG needs `@resvg/resvg-js` (`npm install` in `$MK`).

## Workflow

1. **Brief: one message, skip what's known.** Read the target repo's README
   first and propose answers rather than asking blind:
   - What the project *does*, in one line, and the single idea the mark
     should carry (a mechanism, not a pun on the name).
   - Existing brand colours? Otherwise derive a palette (below).
   - Where it will show: GitHub avatar, IDE/Conductor sidebar, favicon,
     README header. All of them are small: design for 32 px.
2. **Concept: 2–3 options in words**, each one motif from the project's own
   domain (the motion-kit mark is an easing curve between two keyframes,
   because the project is about motion between states). Recommend one.
3. **Build** `<repo>/brand/logo.scene.mjs`, starting from
   `$MK/brand/logo.scene.mjs` (copy it; change the motif, keep the
   structure). It has **no imports**: the CLI passes the runtime in as
   `kit` (`export default ({ kit }) => …`), so the file works from any repo.
   Rules for the mark: see `references/design.md`.
4. **Style.** If the palette is not neutral's blue/amber, write
   `<repo>/brand/style.json` (same shape as `$MK/styles/neutral.json`) and
   pass `--style brand/style.json`. Colours stay tokens in the scene.
5. **Gate + look.**
   ```bash
   mk check brand/logo.scene.mjs -f 1:1
   mk export brand/logo.scene.mjs -f 1:1 -o out/logo --png --scale 1
   ```
   Open the PNG. Then judge it at 32 px and 16 px (render with
   `mk icon … --size 32` into a scratch dir and look). Iterate on the scene,
   not by editing SVG output.
6. **Write the icon set into the repo:**
   ```bash
   mk icon brand/logo.scene.mjs -o <repo> [--size 512] [--style brand/style.json]
   ```
   Writes `assets/icon.svg`, `assets/icon.png`, `assets/icon-animated.svg`,
   `.idea/icon.svg`, `.idea/icon_dark.svg`. Then check discovery
   (`references/discovery.md`): a higher-priority file (e.g. a root
   `favicon.svg`) wins in Conductor; a git-ignored `.idea/` needs
   `!.idea/icon.svg` and `!.idea/icon_dark.svg` re-included.
7. **Hand over:** show the PNG, list files written, and give the one manual
   step tools don't read from the repo: the **GitHub avatar / social
   preview** is uploaded in the repo or org settings (use `assets/icon.png`
   at 512+; social preview is 1280×640).
8. **Optional second opinion:** write a prompt for an external vector
   generator (`references/external-prompt.md`) describing the *same* concept,
   so the user can compare.

## Don't

- Don't put the project name or letters in the mark; it's unreadable at
  16 px and duplicates the label every tool shows next to it.
- Don't use gradients, shadows or thin hairlines; they vanish when small.
- Don't recreate another product's logo or a well-known brand mark.

# Output targets

| Target | JS? | Use | Command |
|---|---|---|---|
| **Craft Page** (revisit / share) | yes, inline only; no network (`connect-src 'none'`) | interactive player | `build -o x.html` → `create_page` with the file content (read `~/.craft-agent/docs/pages.md` first) |
| **Craft in-chat preview** | **no** (`html-preview` iframe blocks scripts) | baked SVG, or step PNGs | `bake -o x.svg` → `image-preview`; or `export --png` → `image-preview` items |
| **Slidev** (stagewright, docomply-presentations) | yes | one step per click (component registers its own clicks; composes with `v-click`) | `vendor <deck>/components/motion-kit --adapter slidev` → `<AnimatedDiagram :spec="spec" />`; `maxHeight` (default 380px fits under a title) |
| **Marp / PowerPoint / Keynote** | no | one slide per step, same position; transition None/Dissolve/Morph | `export --png --scale 2` (Marp, Google Slides) or the SVGs (PowerPoint 365, Keynote) |
| **Website** (Astro, React, static) | yes | server-rendered first state (final frame, step list, colours) + player | `vendor <repo>/src/motion-kit --adapter astro`; `<AnimatedDiagram spec={…}>` or `module="/src/…/x.scene.mjs" options={…}`; `theme`, `style`; wide + tall instances switched with CSS; CI runs the vendored `check.mjs` |
| **README / Obsidian / email / docs** | no | baked SVG (animated) or a GIF | `bake` (CSS animation inside SVG: works in browsers and GitHub `<img>`); `video -o x.gif` for email |
| **Video** (social, demos, talks) | n/a | MP4/WebM/GIF | `video -f 9:16 -o reel.mp4`; see motion-render |

## Notes per target

- **Craft Pages** must be one standalone document; `build` output already is.
  Don't write into `pages/<slug>/` directly. Use the page tools.
- **Code walkthroughs** (a code block with a moving highlight band, `custom-scenes.md`): one range per step, so a deck advances it one range per click: Slidev (build the scene with the example's factory and pass it as `<AnimatedDiagram :scene="scene" />`; `:spec` takes only built-in scene types) shows the first range on arrival and registers a click for each later one (n ranges, n − 1 clicks), and Marp, PowerPoint and Keynote get one slide per step with the band at rest on the range. A snippet is one scene; a longer walkthrough is several scenes, one per snippet.
- **Baked SVG** costs size (fps × duration distinct frames, holds merged): a
  6 s scene at 15 fps is ~150–400 KB. Lower `--fps` (10–12) for READMEs.
- **Slides:** frames from one scene share a viewBox, so consecutive step slides
  register exactly. Fonts in standalone SVG fall back to the viewer's system
  font: send PNGs for decks that travel.
- **Websites:** pass serializable props (a spec, or a module path and its
  options) to islands; pass the page's locale's text as options, so the other
  dictionaries stay out of client bundles; mount wide and tall, switch with CSS
  (`display:none` also removes the hidden one from the a11y tree and stops its
  clock). The server render reserves the controls' space: mounting causes no
  layout shift.
- **Brand repos** keep their own style file next to their specs; motion-kit
  ships only `neutral`.

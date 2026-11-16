# Page adapter (self-contained HTML)

No component to copy: `motion-kit build` inlines the runtime and the player
into one HTML document with no network requests.

```bash
motion-kit build diagram.json --out diagram.html [--format wide] [--locale nl] [--style brand.json]
```

- **Craft Pages:** pass the file's content to `create_page` / `update_page`.
  Pages block all network egress (`connect-src 'none'`), and this output makes
  no requests.
- **Craft in-chat `html-preview`:** scripts are blocked there. Use
  `motion-kit bake` (zero-JS animated SVG) or step PNGs via `image-preview`.
- **Static hosting / file://:** works as is.

The player's first state (final frame, step list, colours) is pre-rendered
into the markup, so the diagram is complete before JS runs and nothing moves
when the player mounts. The player replays once on scroll-into-view, shows pause/play,
step buttons, a scrubber and captions, and respects `prefers-reduced-motion`
and `prefers-color-scheme`.

Capture hook for renderers: `window.__motionKit[sceneId].seek(t)`.

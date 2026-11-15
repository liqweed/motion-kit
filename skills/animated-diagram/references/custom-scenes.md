# Custom scenes

When no scene type fits, write a module. Template: `examples/custom-pulse.scene.mjs`.

```js
// my-diagram.scene.mjs. Import ONLY from motion-kit's runtime, single-line
// relative imports (the HTML builder inlines modules line by line).
import { easeOut, easeStandard, progress } from "../runtime/motion.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { tok } from "../runtime/style.mjs";
import { el, fade, num, text } from "../runtime/svg.mjs";

export default function make({ format = "16:9", locale = "en" } = {}) {
  const { width, height } = FORMATS[format];
  // timeline constants …
  return {
    id: `my-diagram-${format.replace(":", "x")}`, width, height,
    duration: 4.2,
    title: localize({ en: "…", nl: "…" }, locale),
    description: localize({ en: "…", nl: "…" }, locale),
    steps: [{ at: 1.2, label: "…", detail: "…" }, …],
    frame(t) { /* return inner SVG markup for time t */ },
  };
}
```

Rules:

- Pure: the frame depends only on `t` and constants. No clock, no randomness,
  no module-level mutable state.
- Colours only via `tok()`; numbers in strings via `num()`.
- Use `fade()`/`el()` so invisible elements disappear; `drawOn()` for lines.
- Lay out per format; throw if labels don't fit (`wrapLabel`).
- Gate: `motion-kit check my-diagram.scene.mjs` (all formats you support; pass
  `--format` to limit).
- Imports must be single-line `import { a, b } from "./relative.mjs";` and the
  default export a function; the HTML builder supports only that subset.
- If the same shape is needed twice, promote it to a scene type in
  `runtime/types/` with a spec and tests.

## Scenes outside this repository: `kit`

The CLI calls `make({ format, locale, kit })`, where `kit` is the whole
runtime in one flat namespace (`lib/load.mjs` `KIT`). A scene file kept in
another repository can destructure what it needs instead of importing:

```js
export default function make({ format = "1:1", kit }) {
	const { tok, el, num, progress, easeOut } = kit;
	…
}
```

Every Node-side command (check, export, bake, icon, video) supports this.
`motion-kit build` bundles the module for the browser and needs relative
imports; vendor the runtime for that.

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
    steps: [{ at: 1.2, label: "…", detail: "…", id: "request" }, …],
    frame(t, { idPrefix }) {
      // inner SVG markup for time t; ids are `${idPrefix}-…`
    },
  };
}
```

Rules:

- Pure: the frame depends only on `t` and constants. No clock, no randomness,
  no module-level mutable state.
- Colours only via `tok()`; numbers in strings via `num()`. Named colours
  (`"red"`) are literals too.
- Drawing a token pair the scene types don't (accent on surface, emphasis on
  onAccent)? Declare it so the gate checks the style against it:
  `contrastPairs: [{ fg: "accent", bg: "surface", min: 3, use: "bar on its track" }]`
  (4.5 for text, 3 for shapes; `references/styles.md`).
- Use `fade()`/`el()` so invisible elements disappear; `drawOn()` for lines.
- Ids (clip paths, gradients, masks, markers, filters) MUST be built from
  `idPrefix`, the second argument's field: `${idPrefix}-clip`, referenced as
  `url(#${idPrefix}-clip)`. Every render gets a prefix unique to its instance,
  so two copies on one page never share an id. The gate refuses fixed ids.
- Give steps an `id` when page scripts or links address them
  (`controller.playToStep("request")`); ids are unique within the scene.
- Lay out per format; throw if labels don't fit (`wrapLabel`).
- Gate: `motion-kit check my-diagram.scene.mjs` (all formats you support; pass
  `--format` to limit).
- Imports must be single-line `import { a, b } from "./relative.mjs";` and the
  default export a function; the HTML builder supports only that subset.
- If the same shape is needed twice, promote it to a scene type in
  `runtime/types/` with a spec and tests.

## Scene options: text and views from the caller

Every caller builds a module through `sceneFromModule` (`runtime/kit.mjs`):

```js
make({ ...options, format, locale, kit })
```

`options` are the caller's serializable scene options, passed unchanged: a
site's dictionary entry (`labels`), a `view` to draw. `format`, `locale` and
`kit` are reserved. The same module, options, format and locale give the same
scene in the gate, the exporters and the browser.

```js
export default function make({ format = "16:9", labels, view = "full" }) {
  // labels: { title, description, steps: [{ id, label, detail }] } from the caller
}
```

- CLI: `--options` takes inline JSON, a `.json` file, or an `.mjs` whose
  default export is the options or `({ format, locale }) => options`, so the
  gate checks each locale with that locale's text:

  ```js
  // labels.mjs
  import en from "../i18n/en.json" with { type: "json" };
  import nl from "../i18n/nl.json" with { type: "json" };
  export default ({ locale }) => ({ labels: { en, nl }[locale].flow });
  ```

  ```bash
  motion-kit check flow.scene.mjs -l en -l nl --options labels.mjs --style brand.json
  ```

  A vendored copy runs the same gate: `node <vendored>/check.mjs` takes the
  same files and flags.
- Astro adapter: `<AnimatedDiagram module="/src/diagrams/flow.scene.mjs"
  options={{ labels: t.flow }} locale={lang} format="wide" />`. The module
  lives under `src/` and ends in `.scene.mjs` or `.scene.js`; the adapter
  renders it on the server and loads it in the browser on demand. Only the
  page's locale's text ships.

## Scenes outside this repository: `kit`

`kit` is the whole runtime in one flat namespace (`runtime/kit.mjs` `KIT`). A
scene file kept in another repository can destructure what it needs instead of
importing:

```js
export default function make({ format = "1:1", kit }) {
	const { tok, el, num, progress, easeOut } = kit;
	…
}
```

Every command supports this, `motion-kit build` included (it bundles the whole
runtime and passes it as `kit`). A module that imports instead must use
relative imports to a vendored runtime.

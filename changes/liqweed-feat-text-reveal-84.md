---
release: minor
---

### Added

- A blur-and-fade reveal and a highlighter sweep for text, in `kit` beside the rest of the runtime. `blurReveal(enter, { id, rise, blur }, ...markup)` fades markup in while it rises a few units and a blur goes to zero, on the style's entrance curve. Once `enter` reaches 1 it returns the markup bare, with no group, no filter and no `<defs>`, so every step frame, the final frame, a baked last slice and a reduced-motion frame are byte-identical to the same text drawn without the reveal. The filter id comes from `idPrefix`, so two instances on a page and the slices of a baked SVG never share one, and the live player, `bake`, PNG export and video use the same filter parameters (raster appearance can vary with renderer). `highlightSweep(p, { x, y, width, height, token, opacity })` grows a token-coloured band at low opacity behind a line of text. **Consumer action:** none.
- A generic example, `examples/text-reveal.scene.mjs`: three labels reveal in reading order, then a quoted line reveals and is marked, one band per wrapped line. It lasts 2.6 s and passes the gate in every format and in English and Dutch. The `animated-diagram` skill's custom-scenes and motion-vocabulary references say when the blur reveal earns its cost and when a plain fade is enough. **Consumer action:** none.

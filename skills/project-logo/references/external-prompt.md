# Prompt for an external vector generator (Quiver, etc.)

Fill the template from the chosen concept; keep it literal and geometric.
Generators drift towards gradients and extra detail, so forbid them.

```text
Minimal flat vector app icon for "<project>", <one-line what it does>.
A rounded-square tile in solid <colour name> (<hex>). On it, <the motif,
described as shapes: "a single bold white S-shaped curve rising from the
bottom-left to the top-right, thick rounded caps">. <The accent detail:
"the end point is a solid amber (#D97706) dot with a white outline">.
<Optional secondary detail, semi-transparent>. Geometric, precise, generous
padding, no text, no gradients, no shadows, readable at 32 px. Clean SVG with
few paths.
```

Variations to request: "tile edge-to-edge for a circular crop";
"monochrome, single colour on transparent".

To use a generated SVG instead: copy it to `assets/icon.svg` and
`.idea/icon.svg`, and rasterize `assets/icon.png` with any SVG rasterizer
(`rsvg-convert -w 512 -h 512`). It won't have the animated intro, the dark
variant or the gate's guarantees.

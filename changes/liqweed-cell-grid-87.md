---
release: minor
---

### Added

- Cell grids for custom scenes, in `kit` beside the bars (`runtime/cells.mjs`). `cellGrid` lays out rows × columns of rounded square cells in a box or at a size; `cellLighting` lights them one by one, a row or column at a time, all at once or in the order of any function of the cell (a ripple), each ending at a level a field gives it, and `coverage` turns a signed distance into a partial alpha for the cells on a shape's edge; `drawCells` draws the lit cells (a token fill, an opacity the scene computes per cell and frame, rounded to three decimals), an empty grid underneath as one pattern, an outline for a highlighted cell and a glyph per cell. It draws the same in the live player, the baked SVG, PNG and video. **Consumer action:** none.
- A generic example, `examples/cell-grid.scene.mjs`: a 12 × 6 pixel grid that lights one by one and then all at once, and an 8 × 3 glyph atlas whose letters fly out along arcs. It plays once, lights the grid once per step, has no cursor and passes the gate in every format and in English and Dutch.
- The cost of a grid, measured: `npm run bench:player` now draws a 100-, 600- and 2,400-cell grid (`bench/cells.scene.mjs`) and prints the peak sampled frame size (KiB) per scene, and the `animated-diagram` skill's custom-scenes reference records the budget (live player, baked SVG, video) and when a scene should leave SVG.

---
release: minor
---

### Added

- Import a Mermaid flowchart with `motion-kit import flow.mmd --out flow.json`. A plain chain becomes a `sequence` spec; a chart with branches, joins, link labels or dotted links becomes a spec of the new `flowchart` type, laid out once at build time and checked in every format. Styling statements are ignored with a warning; subgraphs, `click`, unsupported shapes and link kinds fail with an error naming the line. **Consumer action:** none.
- Build `flowchart` specs: 2–12 nodes with `box`, `round`, `pill` and `decision` shapes, labelled, dashed and arrowless links, back edges, and a stored layout (`rank`, `pos`, `via`) that every format scales without re-laying out the graph. **Consumer action:** none.
- Check whether a vendored copy is behind the latest release with `motion-kit outdated <dir>`, which compares its `MOTION_KIT_VERSION` with npm and exits 1 when a newer version exists. **Consumer action:** advised at configuration. Run it in CI, or now and then, in repositories that vendor motion-kit.

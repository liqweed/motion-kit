# Ecosystem: when another tool is the better choice

Checked Nov 2026. Re-verify licences before commercial use.

| Tool | Licence | Use it when | Fit with motion-kit |
|---|---|---|---|
| **HyperFrames** (heygen-com/hyperframes) | Apache-2.0 | Video with media, screen recordings, audio, longer edits, captions; HTML compositions rendered deterministically (headless Chrome + FFmpeg); ships Claude Code skills | Same seek(t) principle. A motion-kit scene can be a clip: the player exposes `window.__motionKit[id].seek(t)` for a custom-runtime adapter. Install its skills only in repos that need video editing: `npx skills add heygen-com/hyperframes` or the Claude Code plugin marketplace |
| **Remotion** | source-available; free for individuals and companies ≤ 3 people, paid company licence otherwise | React-based video compositions, rich templates, Lambda rendering | Official agent skills: `npx skills add remotion-dev/skills`. Prefer HyperFrames for licence simplicity unless the team already uses React video |
| **GSAP** (incl. DrawSVG, MorphSVG, MotionPath, SplitText) | free incl. commercial since 3.13 (not for competing no-code builders) | Rich page motion, morphing, text splitting | Paused timelines are seekable (`tl.seek(t)`), so determinism holds. ~70 KB must be inlined for Craft Pages. Use for website polish; keep explainers in motion-kit |
| **Motion Canvas / Revideo** | MIT | Hand-crafted technical explainer *videos* with generator timelines | Good for one-off videos; no live-page reuse |
| **Manim CE** | MIT | Mathematics and science visuals, equations | Python; video only |
| **Mermaid** | MIT | Static diagrams from text; quick structure | Flowcharts import directly: `motion-kit import flow.mmd` (layout at build time). State diagrams: write a `state-machine` spec |
| **ELK.js / dagre** | EPL-2.0 / MIT | Automatic layout of graphs larger than a scene's 12 nodes | `motion-kit import` has its own small layered layout; for more, run one at build time in Node and store coordinates in the spec |
| **Lottie / Rive** | MIT runtimes | Designer-authored animation assets | Embed as media; not data-driven |
| **resvg-js** | MPL-2.0 | SVG → PNG without a browser | motion-kit's rasterizer |

## Related agent skills worth borrowing ideas from

- **visual-explainer** (nicobailon, MIT): fixed visual registers, hover-linking
  between text and figure, contact-sheet self-check.
- **Dashmotion** (csthink, MIT): Mermaid → animated SVG with CSS/SMIL, zero
  dependencies; a pause toggle and reduced-motion handling inside the SVG.

## Further reading

- Bret Victor, "Explorable Explanations"; Nicky Case's explorables: interaction
  that teaches.
- WCAG 2.2: 2.2.2 Pause, Stop, Hide; 2.3.3 Animation from Interactions.

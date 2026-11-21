# Landing rubric for design bundles

The bar a design bundle under `design/prototypes/` must clear before it is
planned for implementation. The landing check
(`bun <design-brief-builder>/scripts/handback.ts check <bundle>`) verifies the
mechanical rows; a person verifies the rest, and the scorecard
(`review-scorecard.md`) records both.

| # | Bar | How it is checked |
|---|---|---|
| 1 | Every scenario renders at every configured width with no external request, no console error, no HTTP error and no horizontal overflow | Landing check |
| 2 | Fonts are self-hosted and open-licence; their licences are in the bundle | Landing check (no external request) and file listing |
| 3 | No forbidden terms in files or rendered text | Landing check |
| 4 | Copy is the product's real copy: no invented claims, numbers, customers, quotes or placeholder text | Compare the rendered text with the brief's copy |
| 5 | Motion canon holds: no loop, no ambient or decorative motion, no continuous scrubbing, at most 12 s per scene (8 s target), one standard easing curve, reduced motion shows the final frame | Read the markup for animation and transition |
| 6 | Text contrast at least 4.5:1 (3:1 from 24 px), shapes and control edges at least 3:1, in both themes | Compute from the colour values the pages use |
| 7 | The diagram is the product's own frame, unredrawn and uncropped, on a surface it contrasts with | Look at the screenshots |
| 8 | Controls are real buttons and links, with a visible focus state and 40 px or larger targets where the design says so | Read the markup |
| 9 | The look is the picked direction's: its typefaces, shape language and layout idea | Look at the screenshots against the contract |
| 10 | A person has picked this design | Recorded in `DECISION.md` |

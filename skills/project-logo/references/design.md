# Designing a mark that survives 16 px

- **Canvas:** 720×720 viewBox (`-f 1:1`). Tile inset ≈ 40, corner radius ≈
  0.25 × tile width (squircle feel). For a full-bleed avatar (GitHub crops
  to a circle on some surfaces) set the inset to 0 and keep the motif inside
  the central 70 %.
- **One motif, ≤ 3 shapes of note.** Strokes ≥ 4 % of the canvas (≥ 28 px at
  720) so they are ≥ 1 px at 32 px. Dots ≥ 10 % diameter.
- **Two colours + one accent:** tile = `accent`, motif = `onAccent`, a single
  `emphasis` detail where the eye should land. Secondary detail at 0.5
  opacity at most, and only if it still reads when removed.
- **Optical centre:** centre the motif's bounding box, then nudge up ~2 %.
- **Motion (the intro, 2–3.5 s):** tile settles (spring, ω ≈ 16), the motif
  draws on (`drawOn` + `easeStandard`), one accent beat lands last
  (`springTo` pop). The final frame is the logo and must hold. Same scene
  rules as diagrams: tokens only, `num()` everything, no clock/randomness;
  set `stepLabelsInFrame: false` and one step at `duration`. A still form with
  identical first and last frames (a 16 px variant, a one-colour sketch) needs
  no fake fade: acknowledge the advice instead,
  `acknowledge: [{ rule: "nothing-animates", reason: "A still mark." }]`.
- **Dark variant:** check `.idea/icon_dark.svg`. If `accent` is the same in
  both themes, the tile carries the contrast; otherwise make sure the motif
  still reads on the dark accent.
- **Review at three sizes:** 512 (detail), 64 (sidebar), 16–32 (tab/favicon).
  If something only reads at 512, remove it.

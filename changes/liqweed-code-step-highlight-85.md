---
release: minor
---

### Changed

- `renderSvg` with `standalone: true` now resolves `var(--mk-…)` only in the background and the scene's frame, no longer in the outer `<title>` and `<desc>` or the root `font-family` attribute: a scene whose title or description contains the literal text `var(--mk-accent)` keeps it as written, where it used to be replaced by the token's colour (text naming an unknown token, which the resolver would have refused, is now kept as written too). `resolveTokens` itself is unchanged (its documentation now says it replaces the pattern anywhere in its input). **Consumer action:** if a title, description or root font family relied on the substitution, spell the colour out; otherwise none.

### Added

- A code block for custom scenes, in `kit`: `codeBlock` lays a snippet out in a monospace panel and refuses one that does not fit the format, with an error that names the line and the remedy; lines wrap, clip or are refused, by the `overflow` rule you choose. `drawCode` draws a translucent band with a solid marker over the active line range, with the lines under it at full ink and the rest dimmed, and moves it once per step, from range to range, on the style's movement curve (leading edge first, trailing edge a beat behind). Syntax roles come from you, and each maps to a style token (`CODE_ROLES`), so a tint is never a colour literal; there is no grammar. `codeEnd` gives the time the last move is over, so a scene keeps every step settled, and `codePairs` lists the token pairs the block draws for `scene.contrastPairs`. The code's text is available to the scene's description and each step's detail (`block.text`, `block.rangeText`). Nothing loops: a deck advances the band one range per click. **Consumer action:** none.
- A generic example, `examples/code-steps.scene.mjs`: a short retry loop whose band lands on one line range per step. It lasts 3.9 s and passes the gate in every format and in English and Dutch; in the phone column it wraps its longest line. The `animated-diagram` skill's custom-scenes, motion-vocabulary and targets references describe the parts, the timing rule and how a deck advances the band. **Consumer action:** none.

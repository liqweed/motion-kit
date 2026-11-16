# Quality control

Model screenshots are evidence, not approval. **A human signs off on the look.**
"Checks are green" says nothing about how it looks.

## Five stages

1. **Storyboard:** step contact sheet (`export --png --qc` → `index.html`).
   Does the sequence tell the story without narration? Approve before polishing.
2. **Timing:** QC frames 0.2 s before/after each step: overlapping text, abrupt
   jumps, elements vanishing, half-drawn lines, stray dots. Regular sampling
   misses broken transitions; look *around* the transitions.
3. **Phone size:** the 360 px row in the sheet (the scene's `tall` layout); the
   `9:16` layout; no text under 14 px at 1×.
4. **Brand and facts:** tokens only, approved style, approved copy, no invented
   numbers or superlatives, every locale checked.
5. **Final file:**
   - Live: real-time playback at desktop and phone width; reduced motion
     (`--force-prefers-reduced-motion`); dark mode; keyboard; screen reader
     reads the step list.
   - Video: `video --sheet` contact sheet; duration, aspect and size via the
     printed probe; watch it once at full size.

**Don't trust virtual time.** Headless `--virtual-time-budget` doesn't advance
the player's animation clock faithfully. Use `--timeout=<ms>` (real time) or a
DevTools/Playwright session, or force reduced motion to check the final frame.

## Review report (paste into the PR / task)

```markdown
### Diagram review: <scene id> (<formats>, <locales>, <style>)
- Gate: `motion-kit check` ✓ (n formats × m locales)
- Timestamps inspected: steps 1–N; before/after each transition; phone row
- Issues found:
  - …
- Fixes applied:
  - …
- Remaining concerns:
  - …
- Human approval: ☐ <name>, <date>
```

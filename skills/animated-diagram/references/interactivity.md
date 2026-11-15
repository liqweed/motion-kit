# Interactivity and accessibility

## The player (`runtime/player.mjs`, used by `build`, the Astro adapter, Craft Pages)

- Starts on the **final frame** (also the no-JS / server-rendered fallback).
- Replays once when ~40 % visible, then holds.
- Controls: play/pause (always present, WCAG 2.2.2), one button per step (jumps,
  no animation), optional scrubber, caption with the active step's `detail`.
- Keyboard on the diagram: ← / → step, Home / End, Space play/pause.
- `prefers-reduced-motion`: final frame, no autoplay, no play button.
- `prefers-color-scheme`: light/dark tokens switch live.
- Screen readers: `role="img"` + `<title>`/`<desc>`, a visually hidden ordered
  list of all steps with details; the visible caption is `aria-hidden`.
- Capture hook: `window.__motionKit[id].seek(t)` (for Playwright/HyperFrames-
  style renderers).

## Patterns worth adding per diagram (in the page around the player)

- **Hover/focus linking:** terms in the surrounding text highlight the matching
  part of the diagram (and back). Wrap the term in
  `<span data-mk-step="3">`; on hover, `controller.seekStep(3)`.
- **Scroll-driven steps:** for long-form explainers, map section visibility to
  steps (IntersectionObserver per text section → `seekStep(i)`). Don't scrub
  continuously on scroll; jump to settled steps.
- **Details on demand:** step buttons + caption first; tooltips only for
  secondary facts.
- **Explorables:** a parameter slider can change the *spec* (e.g. number of
  spokes, a rate), re-create the scene and seek to the same step. Keep the
  scene pure: the parameter is input, not state.

## Rules

- Never autoplay sound. Never loop an explainer.
- Every interactive control is a real `<button>`/`<input>` with a visible focus
  style and an accessible name.
- Don't hide information only in hover states; touch devices have no hover.
- Test: keyboard only, a screen reader pass (VoiceOver: the step list is read),
  phone width, reduced motion, dark mode.

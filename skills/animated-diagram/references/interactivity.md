# Interactivity and accessibility

## The player (`runtime/player.mjs`, used by `build`, the Astro adapter, Craft Pages)

- Starts on the **final frame**. A server render can emit the player's whole
  first state with `playerMarkup(scene, { id, … })`, `PLAYER_CSS` and
  `themeCss(selector, style, theme)`: the final frame, the step list and the
  colours without JavaScript, with the controls inert, and nothing moves when
  the player mounts. The Astro adapter and `build` do this.
- Replays once when ~40 % of the diagram, or 40 % of the viewport, shows, so a
  diagram taller than the screen starts too; then holds. While the diagram is
  out of view or not rendered (`display: none`), its clock waits and nothing
  is drawn; it resumes where it stopped.
- Controls: play/pause (always present, WCAG 2.2.2), one button per step (jumps
  by default), optional scrubber, caption with the active step's `detail`.
  Every control is at least 44 × 44 px. The caption and the play button keep
  the size of their longest text, so playback does not move the page.
- Keyboard on the diagram (a focusable group named by the title, described by
  a hint, `labels.keys`): ← / → step, Home / End, Space play/pause.
- `prefers-reduced-motion`: final frame, no autoplay, no play button.
- `prefers-color-scheme`: light/dark tokens switch live, unless `theme` is set.
  Tokens are set one property at a time, so CSS on the container stays.
- Screen readers: `role="img"` + `<title>`/`<desc>`, a visually hidden ordered
  list of all steps with details; the visible caption is `aria-hidden`.
- Ids: every player renders with its own id prefix (`options.id`, else the
  scene id plus a counter), so scenes that define ids can share a page.
- The stylesheet is added to the document whenever a player mounts and none is
  there, so a page swap (Astro view transitions) cannot leave players unstyled.
- Capture hook: `window.__motionKit[id].seek(t)` (for Playwright/HyperFrames-
  style renderers).

Steps are addressed by zero-based index or by step `id` (a spec node's or
spoke's `id`, or a custom scene's `steps[i].id`): ids survive steps being added
or reordered. `controller.seekStep(ref)` jumps; `controller.playToStep(ref)`
plays forward from the current time and stops at the step's exact settled time.
Backward and same-step calls jump, and reduced motion always jumps. A new call
replaces the previous target; `pause()` holds the current frame, `seek(t)`
cancels playback, and `play()` continues to the end. An invalid index or an
unknown id throws `RangeError`.

Pass `{ animateSteps: true }` to `mountPlayer(container, scene, options)` to
enable this behavior for the step buttons and arrow/Home/End keys. The default
keeps instant navigation. Call `controller.destroy()` before removing or
replacing a player: it cancels playback, visibility observation, theme listening
and its capture-hook entry.

Reaching a player from page scripts: `mountPlayer` returns the controller; the
`<motion-diagram>` element and the Astro adapter's root element expose it as
`.controller` and dispatch `motion-ready` (bubbling, `detail.controller`) once
it is mounted. The player may already be mounted when your script runs, so use
whichever comes first. Give an Astro diagram an `id` to find it:

```js
const el = document.getElementById("flow");
const go = (c) => c.playToStep("payment");
el.controller ? go(el.controller) : el.addEventListener("motion-ready", (e) => go(e.detail.controller), { once: true });
```

## Patterns worth adding per diagram (in the page around the player)

- **Hover/focus linking:** terms in the surrounding text highlight the matching
  part of the diagram (and back). Wrap the term in
  `<span data-mk-step="payment">`; on hover and on focus,
  `controller.seekStep("payment")`. Use step ids, not positions.
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

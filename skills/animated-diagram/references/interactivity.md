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
- Each frame updates the SVG in place (`patchMarkup`, `runtime/patch.mjs`):
  nodes that persist keep their identity and only changed attributes and text
  are written, so hover state survives playback. Page CSS must not put
  transitions or animations on the diagram's SVG: with persistent nodes they
  would run between frames, and exports would no longer match what plays.
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

## Linking the page to the diagram (`runtime/links.mjs`)

Two helpers bind a controller to the page around the player. Both are
dependency-free browser code (no DOM at import), take a step by `id` or index,
throw `RangeError` for an unknown id when they bind (not when the reader gets
there), never move focus or layout, and return a `dispose()` that removes
their listeners, observers and marks. Call it before removing the elements or
the player (Astro: on `astro:before-swap`).

- **Hover/focus linking:** `linkSteps(controller, rootOrElements, options)`.
  Every element with `data-mk-step` under the root (or the elements given)
  selects its step on hover (mouse and pen), keyboard focus (also focus inside
  it) and click; touch selects on tap, so nothing is hover-only. Make terms
  `<button type="button" data-mk-step="payment">` so the keyboard reaches
  them. A selection jumps to the settled step; `animate: true` plays forward
  to a later step, except under reduced motion. The step stays when the
  pointer or focus leaves; `restore: true` turns hover and focus into a
  preview: once neither is on a term, the diagram returns to the frame it
  showed before, and a click keeps its step. The terms of the selected step
  get `aria-current="step"` (`mark: false` to style them yourself);
  `onChange(step, element)` reports each selection (`-1, null` on restore).
  Terms are collected when binding; bind again for terms added later. When
  scroll sections carry `data-mk-step` as well, pass the terms themselves
  rather than a root that contains the sections.
- **Scroll-driven steps:** `scrollSteps(controller, sections, options)`.
  Each section names its step with `data-mk-step`, else by order (the third
  section shows step 2). The active section is the last one whose top has
  crossed a line across the viewport (`line`, a share of its height from the
  top, default 0.5; `root` for a scrolling container), found with an
  IntersectionObserver whose root ends at that line. It stays active through
  the gap after it, and the last section stays active below it. Moving one
  section forward plays to its step (`playToStep`); moving back, skipping
  sections, the first section and reduced motion jump (`seekStep`);
  `animate: false` always jumps. Above the first section the diagram keeps its
  frame. The active section gets `aria-current="step"` (style it without
  changing its size, e.g. opacity); `onChange(index, section)` reports each
  change (`-1, null` above the first). It never scrubs continuously: the
  diagram only ever rests on settled steps. Mount the player with
  `autoplay: "none"`, and leave room below the last section (e.g.
  `padding-bottom: 50vh`) so its top can reach the line. Without
  IntersectionObserver it does nothing and the text still reads.

Plain HTML (`motion-kit vendor … --adapter page`):

```html
<article id="story">
  <section data-mk-step="order"><h2>The order</h2><p>…</p></section>
  <section data-mk-step="payment"><h2>Payment</h2><p>The <button type="button" data-mk-step="payment">card check</button> …</p></section>
  <section data-mk-step="shipping"><h2>Shipping</h2><p>…</p></section>
</article>
<div id="flow"></div>
<script type="module">
  import { mountPlayer } from "./motion-kit/runtime/player.mjs";
  import { linkSteps, scrollSteps } from "./motion-kit/runtime/links.mjs";
  const player = mountPlayer(document.getElementById("flow"), scene, { autoplay: "none" });
  const story = document.getElementById("story");
  const stopScroll = scrollSteps(player, story.querySelectorAll("section"));
  // The sections carry data-mk-step too: pass the terms, not the article.
  const stopLinks = linkSteps(player, story.querySelectorAll("button[data-mk-step]"));
</script>
```

`<motion-diagram>` (`--adapter element`): wait for the controller.

```js
import { scrollSteps } from "./motion-kit/runtime/links.mjs";
const el = document.querySelector("motion-diagram");
const bind = (c) => scrollSteps(c, document.querySelectorAll("#story section"));
el.controller ? bind(el.controller) : el.addEventListener("motion-ready", (e) => bind(e.detail.controller), { once: true });
```

The element remounts when an attribute changes, which makes a new controller:
listen to every `motion-ready` (not `once`) and dispose the previous binding
first if the page changes attributes.

Astro (`--adapter astro`), with `id` on the diagram:

```astro
<AnimatedDiagram spec={spec} format="tall" id="flow" />
<script>
  import { linkSteps, scrollSteps } from "../motion-kit/runtime/links.mjs";
  const el = document.getElementById("flow");
  const bind = (c) => {
    const stops = [scrollSteps(c, document.querySelectorAll("#story section")), linkSteps(c, document.querySelectorAll("#story button[data-mk-step]"))];
    document.addEventListener("astro:before-swap", () => stops.forEach((stop) => stop()), { once: true });
  };
  el.controller ? bind(el.controller) : el.addEventListener("motion-ready", (e) => bind(e.detail.controller), { once: true });
</script>
```

Module scripts run once per load: with view transitions (`<ClientRouter />`),
run the binding code in an `astro:page-load` listener so each page binds its
own diagram; the `astro:before-swap` dispose releases the previous one.

A page from `motion-kit build` has them on the `MotionKitRuntime` global.

The step mapping is pure and exported for tests and custom bindings:
`stepRef(scene, ref)` (id first, then a whole-number index),
`sectionSteps(scene, refs)` (a section's reference, else its position),
`activeSection(tops, line)` and `scrollMove({ from, to, fromStep, toStep,
animate, reduced })` (`"play"`, `"seek"` or null).

## Patterns worth adding per diagram (in the page around the player)

- **Hover/focus linking:** terms in the surrounding text highlight the matching
  part of the diagram: `linkSteps` above. Use step ids, not positions.
- **Scroll-driven steps:** for long-form explainers, one text section per step:
  `scrollSteps` above. Don't scrub continuously on scroll; jump to settled
  steps.
- **Details on demand:** step buttons + caption first; tooltips only for
  secondary facts.
- **Explorables:** a parameter slider can change the *spec* (e.g. number of
  spokes, a rate), re-create the scene and seek to the same step. Keep the
  scene pure: the parameter is input, not state.

## Rules

- Never autoplay sound. Don't loop an explainer: the player never does, and a
  page that loops a diagram on its own owns that choice.
- Every interactive control is a real `<button>`/`<input>` with a visible focus
  style and an accessible name.
- Don't hide information only in hover states; touch devices have no hover.
- Test: keyboard only, a screen reader pass (VoiceOver: the step list is read),
  phone width, reduced motion, dark mode.

## Step notifications

`controller.onStep(index => { … })` calls immediately with the current settled
step index, then once whenever it changes through playback, seek, scrubber,
buttons or keyboard. The index is `-1` before the first step. It returns an
unsubscribe function; `destroy()` releases every subscription. `scrollSteps`
and `linkSteps` subscribe when available so marks also follow player controls.
No polling or extra animation loop is needed. Callbacks should observe state,
not seek the player recursively.

For outside drivers, use the returned controller or the adapter element's
`.controller` after `motion-ready`. `seek(t)` is public, requires a finite time,
clamps to the scene, pauses playback and cancels pending autoplay. Mount with
`autoplay: "none"`; honor reduced motion in the driver. Visibility pauses the
player's clock, not explicit seeks. Capture tools may use
`globalThis.__motionKit[options.id ?? scene.id]`; default scene ids contain the
format suffix, while Astro generates an instance key unless given `id`.

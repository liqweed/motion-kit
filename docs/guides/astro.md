---
title: Vendor motion-kit into an Astro site
status: draft
last_updated: 2026-11-18
---

# Vendor motion-kit into an Astro site

Keep scene specs, dictionaries and styles in your site; copy the runtime and
adapter into a directory you can replace on upgrade. Run from your site's root:

```sh
npx @liqweed/motion-kit vendor src/motion-kit --adapter astro
```

Commit that directory, including its licence and `MOTION_KIT_VERSION`. The
copied runtime has no dependency or build step. Put a spec at
`src/diagrams/flow.json`, for example:

```json
{
  "type": "sequence", "id": "flow",
  "title": { "en": "An order", "nl": "Een bestelling" },
  "description": { "en": "An order is paid and shipped.", "nl": "Een bestelling wordt betaald en verzonden." },
  "nodes": [
    { "id": "paid", "label": { "en": "Paid", "nl": "Betaald" } },
    { "id": "shipped", "label": { "en": "Shipped", "nl": "Verzonden" } }
  ]
}
```

Plain strings are shared across locales. Localized objects must supply the
requested language; missing translations fail rather than show another language.

## Render on the server, then enhance

In an Astro page:

```astro
---
import AnimatedDiagram from "../motion-kit/adapter/AnimatedDiagram.astro";
import spec from "../diagrams/flow.json";
const locale = "nl";
const labels = { nl: { play: "Afspelen", pause: "Pauze", replay: "Opnieuw", steps: "Stappen", scrubber: "Tijdlijn", keys: "Gebruik de pijltjestoetsen om van stap te wisselen." } };
---
<AnimatedDiagram spec={spec} locale={locale} format="tall" id="order" labels={labels} />
```

The server emits the final frame, colours, caption and accessible transcript.
Controls occupy their final space but stay inert until JavaScript mounts the
player. With JavaScript off, the diagram and transcript remain. Reduced motion
starts at the final frame without autoplay. The default theme follows the OS;
pass `theme="light"` or `theme="dark"` to pin it.

For responsive layouts, render `wide` and `tall` instances with distinct ids
and switch them using `display: none` at your breakpoint. Hidden players stop
their clocks and leave the accessibility tree. Avoid scaling labels below 14 px.

## Use the site's dictionary in a custom scene

A custom module under `src/` ends in `.scene.mjs` or `.scene.js`. It receives
`{ ...options, format, locale, kit }`. The site's dictionary can supply its copy:

```astro
<AnimatedDiagram module="/src/diagrams/flow.scene.mjs"
  options={{ labels: dictionary[locale].flow }} locale={locale}
  format="tall" id="custom-flow" />
```

`dictionary` above is your site's own imported dictionary. The module must
actually use `options.labels` in its factory and return the scene contract;
see the [custom-scene reference](../../skills/animated-diagram/references/custom-scenes.md).
Export `const locales = ["en", "nl"]` from the module for automatic gate coverage.
Props must be serializable; pass a module path, not a built scene or function.

A style object goes in `style={brand}`; CSS classes go in `class`. Styles can
set `font`, node `radius`, base `stroke`, and the eight colour tokens in `light`
and `dark`. Keep both theme maps and run contrast checks. Store the same object
in a JSON file so the CLI and the page use identical data.

## Link the surrounding page

Use stable step ids on focusable terms:

```html
<button type="button" data-mk-step="paid">Payment</button>
<button type="button" data-mk-step="shipped">Shipping</button>
```

In a page script, bind once the adapter is ready:

```js
import { linkSteps } from "../motion-kit/runtime/links.mjs";
const root = document.getElementById("order");
let dispose;
const bind = (controller) => {
  dispose?.();
  dispose = linkSteps(controller, document.querySelectorAll("[data-mk-step]"));
};
if (root.controller) bind(root.controller);
else root.addEventListener("motion-ready", (e) => bind(e.detail.controller), { once: true });
document.addEventListener("astro:before-swap", () => dispose?.(), { once: true });
```

Rebind after navigation when your site preserves its script scope. The adapter
owns player destruction; the page owns helper disposal. `scrollSteps(controller,
sections)` maps text sections to settled steps. `controller.onStep(callback)`
updates surrounding UI after any step change without polling and returns a
cleanup function. Access `.controller` instead of guessing a capture-hook key.

## Gate in CI and upgrade

The vendored gate uses the same implementation as the CLI:

```sh
node src/motion-kit/check.mjs src/diagrams/flow.json
node src/motion-kit/check.mjs src/diagrams/flow.scene.mjs \
  --options src/diagrams/options.mjs --style src/diagrams/brand.json
```

For a module whose copy comes from the site's dictionaries, `options.mjs`
exports `({ locale }) => ({ labels: dictionary[locale].flow })`. All formats
and declared locales are checked unless explicitly narrowed. Run the gate
before the Astro build, then inspect the page at desktop and phone sizes in
light/dark, with JavaScript off and with reduced motion.

For upgrades, `npx @liqweed/motion-kit outdated src/motion-kit` compares
`MOTION_KIT_VERSION` with the latest release (exit 1 when behind; a scheduled
CI job can run it). Read the release notes, choose the version to adopt, then run
`npx @liqweed/motion-kit@<version> vendor src/motion-kit --adapter astro`.
Review the vendor diff, rerun the gate and Astro build, and inspect your scenes.
Never keep custom edits inside `src/motion-kit`; re-vendoring overwrites them.

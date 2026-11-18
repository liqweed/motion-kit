# Custom element (unbuilt ES module)

```bash
node cli/motion-kit.mjs vendor public/motion-kit --adapter element
node cli/motion-kit.mjs export diagram.json -o public/frames -f wide
cp diagram.json public/diagram.json
```

Serve `public/` over HTTP. Copy the final exported SVG path into the fallback:

```html
<style>motion-diagram { display: block; }</style>
<motion-diagram src="./diagram.json" format="wide" locale="en" theme="light">
  <img src="./frames/06-final.svg" alt="The complete diagram and its explanation">
</motion-diagram>
<script type="module" src="./motion-kit/adapter/motion-diagram.mjs"></script>
```

Use the actual final SVG filename from the export manifest. The child markup
is the no-JavaScript fallback; it can also be a server-rendered final-frame SVG.
The adapter retains it while loading, restores it on errors and disconnection,
and hides it only after the live player mounts. Supply meaningful alternative
text and size the fallback to match the live diagram to avoid layout shifts.

Instead of `src`, supply JSON in a `spec` attribute or a child
`<script type="application/json">…</script>`. Precedence: `spec`, child JSON,
then `src`. Escape JSON for its HTML context (in a script, escape `<` as
`\u003c`). `src` resolves relative to the page, including its `<base>` URL.

Observed attributes are `spec`, `src`, `format` (default `16:9`), `locale`
(default `en`), `theme` (`light`/`dark`, absent follows the OS), and
`style-spec` (JSON visual-style tokens, default neutral), and `labels` (JSON UI strings: flat, or keyed by locale). The standard `style`
attribute remains CSS, for example `style="max-width: 960px"`. Attribute
changes rebuild the player. Inline script text changes require a remount
(remove and reinsert the element).

```js
const diagram = document.querySelector("motion-diagram");
diagram.addEventListener("motion-ready", ({ detail }) => detail.controller.play());
diagram.addEventListener("motion-error", ({ detail }) => console.error(detail.error));
// null until mounted; exposes seek, seekStep, playToStep, play, pause, destroy, time, scene.
diagram.controller?.seek(2);
```

To drive the diagram from the page (text sections that advance it on scroll,
terms marked `data-mk-step` that select a step on hover and focus), import
`scrollSteps` / `linkSteps` from the vendored `runtime/links.mjs` and bind them
to the controller; see `skills/animated-diagram/references/interactivity.md`.

The player follows its normal visible autoplay and reduced-motion rules.
Removing the element destroys its player, cancels pending loading and restores
the fallback; reconnecting mounts a fresh controller. Events are dispatched
on the element. Loading failures leave `controller` null. Scripts and JSON
must be served from origins allowed by the page's CSP and CORS policy.

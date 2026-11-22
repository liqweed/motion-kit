# Visual styles

**Neutral is the default.** Ask for a style during the brief; if none is given,
use neutral and say so.

## Tokens (scenes may use only these)

| Token | Role |
|---|---|
| `bg` | canvas (exports with `--background`, video) |
| `surface` | pending node fill |
| `ink` | primary text |
| `muted` | secondary text, pending labels |
| `line` | pending strokes and connectors |
| `accent` | active/reached fill and paths |
| `onAccent` | text/glyphs on accent |
| `emphasis` | the one emphasis element (ring, dot) |
| `caution` | a shared concern or a regression: a mark, stripe or fill that says "look at this" without saying "broken" |
| `onCaution` | text/glyphs on caution |
| `alert` | a warning, a failure or a struck-out idea |
| `onAlert` | text/glyphs on alert |

The last four are optional: a style that does not set them gets neutral's, in
light and dark, and nothing in a scene that does not draw them changes. A scene
type draws none of them; a custom scene does (`examples/release-check.scene.mjs`).

**Which accent to reach for.** `accent` is the subject, what is reached or
active. `emphasis` is the one marker that says "here" (a ring, a dot) and there
is only one at a time. `caution` and `alert` carry a state of what the diagram
shows, and any number of elements may carry them: caution for something to watch
(a latency regression, a shared dependency, a degraded path), alert for
something wrong (a failing check, a rejected idea). Do not borrow `emphasis` for
either, and do not use caution or alert as decoration: they should read as
"watch this" and "this is wrong" in every scene of a deck. Never tell them
apart by hue alone; give each its word or glyph, as the example's badges do.
Neutral keeps `caution` a yellow-gold and `alert` a red, both apart from the
amber of `emphasis`.

Scenes write `tok("accent")` → `var(--mk-accent)`. Live players set the custom
properties (light + dark); standalone exports resolve them to literals.

## Style file

```json
{
  "name": "acme",
  "font": "Inter, ui-sans-serif, system-ui, sans-serif",
  "mono": "\"JetBrains Mono\", ui-monospace, Menlo, Consolas, monospace",
  "radius": 10,
  "stroke": 2,
  "motion": { "enter": [0.16, 1, 0.3, 1], "move": [0.4, 0, 0.2, 1] },
  "light": { "accent": "#0a2a8a", "emphasis": "#05966a", "caution": "#8a5a00", "alert": "#b3261e" },
  "dark":  { "accent": "#2563eb", "emphasis": "#a7f3d0", "caution": "#ffd166", "alert": "#ff8a80", "onAlert": "#14090a" }
}
```

Missing tokens fall back to neutral within each theme. If the entire `dark`
object is absent, the light overrides are also applied over neutral dark;
provide both theme objects when they need different values. Colours must be
`#rrggbb`; unknown tokens throw.

`mono` is the monospace stack, for metrics, code and coordinates; it defaults to
neutral's (`ui-monospace`, `SF Mono`, Cascadia, Menlo, Consolas, DejaVu Sans
Mono). A scene reaches it through the style it is given, `frame(t, { style })`:
`text({ "font-family": style.mono, … }, "212 ms")`. A custom scene never writes a
font family of its own: the gate fails a `font-family` (attribute, `style`
attribute or `<style>` element) that is neither `style.font` nor `style.mono`,
and the `font` shorthand, which names a family too, as it fails a colour literal.

`radius` (0–24, default 10) sets built-in rectangular node corners; circles,
region borders and timeline pills retain their geometry. `stroke` (1–4,
default 2) sets the base line width, with accent lines at 1.5× and timeline
stems at 0.75×. These settings affect live, SVG, PNG, bake and video rendering.
Custom scenes receive the normalized style through `frame(t, { style })` and
may use it explicitly; their own geometry is not rewritten.

## Motion

`motion` names the two curves the scene types use, as the four numbers of a CSS
`cubic-bezier(x1, y1, x2, y2)`: `enter` for entrances and `move` for movement
between two visible states (fills, hops, draw-on). Both default to the curves in
`motion-vocabulary.md` (`0, 0, .2, 1` and `.4, 0, .2, 1`), so a style that sets
neither moves as before. Use it to match the page the diagram sits on: a site
that names `cubic-bezier(0.23, 1, 0.32, 1)` as its curve sets
`"move": [0.23, 1, 0.32, 1]`.

Every number is from 0 to 1, so no curve overshoots (no bounce); anything else
throws. Only the shape of a move changes: durations, delays and the times of the
steps do not, so step frames stay settled. A curve that ends flat, as the
defaults and most easing curves do, is used exactly. One that is still moving at
its end (a linear `[0, 0, 1, 1]`, an ease-in) would leave a step frame
unsettled, so it finishes in the first 95 % of each move and holds for the last
5 %. Custom scenes read `kit.easings(style.motion)` for the same two curves.

## Contrast

WCAG judges what a scene draws, not a palette: text needs 4.5:1 against what is
behind it (1.4.3), and the parts of a graphic that carry meaning need 3:1 against
the colours next to them (1.4.11). So `motion-kit check --style acme.json …`
**fails a scene only on the pairs it draws**, in both themes. The shared list
(`CONTRAST_PAIRS` in `runtime/style.mjs`) is every token pair the scene types
draw where the pair carries meaning in a step frame:

| Pair | Needs | Where it is drawn |
|---|---|---|
| ink on bg | 4.5 | labels of reached nodes, on the canvas |
| ink on surface | 4.5 | labels inside pending boxes |
| muted on bg | 4.5 | labels of pending nodes, on the canvas |
| muted on surface | 4.5 | glyphs and icons inside pending circles |
| onAccent on accent | 4.5 | labels, glyphs and icons inside reached nodes |
| line on bg | 3 | connectors, outlines of pending nodes |
| accent on bg | 3 | reached nodes, drawn connectors |
| emphasis on bg | 3 | the emphasis ring and dot on the canvas |
| emphasis on accent | 3 | the ring around the reached node it marks: "here" told from "reached" without relying on hue |

Four more pairs belong to the optional tokens. No scene type draws them, so they
are not in the set a scene that declares nothing is held to; a scene that draws
one declares it and is held to it:

| Pair | Needs | Where it is drawn |
|---|---|---|
| caution on bg | 3 | a caution stripe, mark or outline on the canvas |
| onCaution on caution | 4.5 | text and glyphs on a caution fill |
| alert on bg | 3 | an alert stripe, mark or outline on the canvas |
| onAlert on alert | 4.5 | text and glyphs on an alert fill |

A scene that uses `caution`, `onCaution`, `alert` or `onAlert` without declaring a
pair that names the token fails the gate (`draws caution but declares no contrast
pair for it`), so the style is never judged against less than the scene draws. A
style that sets one of these tokens is warned, once per run, when it misses its
pair; a style that leaves them at neutral's is not.

Exempt (`CONTRAST_EXEMPT`), each for a reason:

| Pair | Why it is not checked |
|---|---|
| line on surface | a pending node's outline is its edge, told from the canvas outside it (line on bg), not from its own fill |
| accent on surface | the reached layer covers the pending one only while a node fills; a scene that draws accent on surface (a bar on a track) declares the pair |
| emphasis on surface | the ring crosses pending nodes only mid-hop, never in a step frame |
| accent on line | the accent draw-on covers the pending line; they meet only at the moving tip |
| onAccent on emphasis | no scene type draws it; the motion-kit logo does, and logos are exempt from WCAG 1.4.11 |

Each scene type draws some of these, not all (`SCENE_TYPE_PAIRS`): a `hub-spoke`
draws no text on the canvas, and a `sequence` draws no ink on surface.
A style that misses a pair is reported once per run, as `⚠ style:` with the
scene types that draw it, and fails exactly those scenes; every other scene
passes, and `build`, `export` and the rest print `warning: contrast:` for the
shared pairs they do not draw. `build` alone also fails a style that misses a pair the page's player paints (ink/surface, onAccent/accent, muted/bg, emphasis/bg, line/bg, accent/bg, and ink/bg for the heading unless `--no-heading`), declared or not. `neutral` meets every pair, so it never warns.

Emphasis on accent is the pair most palettes miss: two saturated colours of
the same lightness (blue and orange, teal and rust) are about 1:1 apart once
hue is gone. On a white canvas it usually means a dark accent (neutral light
uses `#1d36a8`) with a mid-tone emphasis; on a dark canvas, a light emphasis
(neutral dark uses `#fbbf24`).

A custom scene says what it draws with `contrastPairs`: the gate holds the style
to those pairs and only warns about the shared ones it leaves out. Shared pairs
come by name from `kit.sharedPairs`; others are written out. A scene that
declares nothing is held to every shared pair, as before, so say what you draw:

```js
return { …, contrastPairs: [
	...kit.sharedPairs("ink/surface", "onAccent/accent", "line/bg", "accent/bg"),
	{ fg: "accent", bg: "surface", min: 3, use: "progress bar on its track" },
] };
```

A figure in ink on paper with a green accent that never draws `emphasis` lists
the pairs it does draw and passes with a palette whose `emphasis` cannot meet
both the canvas and the accent. Declare a pair only if it is drawn: a declared
pair is a failure, a threshold of 4.5 for text and 3 for graphics.

## Where style files live

In the **consuming repo**, next to its specs (e.g. `diagrams/style.json` in a
deck or website repo). motion-kit itself ships only neutral.

## "Describe one"

When the user describes a style ("calm, navy and teal, rounded"), write a style
file, run the contrast check, render one step frame in light and dark, and get a
yes before applying it everywhere.

## Fonts

Live: the page's font stack (`font`, and `mono` where a scene asks for it). Exports: the rasterizer uses system fonts (resvg
falls back to Helvetica on macOS, and to its own default where no `mono` family is
installed). For brand fonts in PNG/video, install the font on the rendering
machine, the monospace one included. Embedding fonts in SVG is out of scope.

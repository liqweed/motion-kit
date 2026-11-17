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

Scenes write `tok("accent")` → `var(--mk-accent)`. Live players set the custom
properties (light + dark); standalone exports resolve them to literals.

## Style file

```json
{
  "name": "acme",
  "font": "Inter, ui-sans-serif, system-ui, sans-serif",
  "radius": 10,
  "stroke": 2,
  "light": { "accent": "#0a2a8a", "emphasis": "#05966a" },
  "dark":  { "accent": "#2563eb", "emphasis": "#a7f3d0" }
}
```

Missing tokens fall back to neutral. Colours must be `#rrggbb`. Unknown tokens
throw.

## Contrast

`motion-kit check --style acme.json …` checks every token pair the scene types
draw where the pair carries meaning in a step frame (`CONTRAST_PAIRS` in
`runtime/style.mjs`), in both themes, at WCAG thresholds: 4.5:1 for text,
3:1 for shapes and strokes.

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

Exempt (`CONTRAST_EXEMPT`), each for a reason:

| Pair | Why it is not checked |
|---|---|
| line on surface | a pending node's outline is its edge, told from the canvas outside it (line on bg), not from its own fill |
| accent on surface | the reached layer covers the pending one only while a node fills; a scene that draws accent on surface (a bar on a track) declares the pair |
| emphasis on surface | the ring crosses pending nodes only mid-hop, never in a step frame |
| accent on line | the accent draw-on covers the pending line; they meet only at the moving tip |
| onAccent on emphasis | no scene type draws it; the motion-kit logo does, and logos are exempt from WCAG 1.4.11 |

Emphasis on accent is the pair most palettes miss: two saturated colours of
the same lightness (blue and orange, teal and rust) are about 1:1 apart once
hue is gone. On a white canvas it usually means a dark accent (neutral light
uses `#1d36a8`) with a mid-tone emphasis; on a dark canvas, a light emphasis
(neutral dark uses `#fbbf24`).

A custom scene that draws another pair declares it, and the gate checks the
style against it for that scene:

```js
return { …, contrastPairs: [{ fg: "accent", bg: "surface", min: 3, use: "progress bar on its track" }] };
```

## Where style files live

In the **consuming repo**, next to its specs (e.g. `diagrams/style.json` in a
deck or website repo). motion-kit itself ships only neutral.

## "Describe one"

When the user describes a style ("calm, navy and teal, rounded"), write a style
file, run the contrast check, render one step frame in light and dark, and get a
yes before applying it everywhere.

## Fonts

Live: the page's font stack. Exports: the rasterizer uses system fonts (resvg
falls back to Helvetica on macOS). For brand fonts in PNG/video, install the
font on the rendering machine. Embedding fonts in SVG is out of scope.

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
  "light": { "accent": "#0b5fff", "emphasis": "#00a37a" },
  "dark":  { "accent": "#3d7eff", "emphasis": "#2fd3a0" }
}
```

Missing tokens fall back to neutral. Colours must be `#rrggbb`. Unknown tokens
throw. `motion-kit check --style acme.json …` also checks contrast (WCAG):
text ≥ 4.5:1 (ink/muted on bg and surface, onAccent on accent), shapes ≥ 3:1
(line, accent, emphasis on bg), in both themes.

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

# Slides

| App | Use | Notes |
|---|---|---|
| **Slidev** | the Slidev adapter (live, one step per click) | `vendor <deck>/components/motion-kit --adapter slidev`; `<AnimatedDiagram :spec="spec" />` registers its own clicks; `slidev export --with-clicks` writes one settled frame per click (verified, Slidev 53) |
| **Marp** | `--png --scale 2` | `![bg contain](slides/03-step.png)`, one slide per step |
| **PowerPoint 365** | SVG (editable, sharp) or PNG | Same position and size on each slide; transition *Morph* or *None* |
| **Keynote** | SVG or PNG | Magic Move works when frames share a size and position |
| **Google Slides** | PNG only | No SVG support |

- Frames from one scene share a viewBox, so consecutive step slides register exactly.
- **Fonts:** standalone SVG uses the presenting machine's fonts. Send PNGs for
  decks that travel.
- **Background:** transparent by default (sits on the slide theme). Use
  `--background` for an opaque canvas in the style's `bg` colour.
- **Dark decks:** `--theme dark` resolves the dark tokens.
- Export at the deck's aspect (`-f 16:9` or `-f 4:3`); the layout is computed
  for it, not cropped.

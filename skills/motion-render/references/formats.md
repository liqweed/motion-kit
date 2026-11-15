# Formats

| Name | viewBox | Typical use | Layout behaviour |
|---|---|---|---|
| `16:9` | 960×540 | slides, YouTube, web hero | sequence row (or 2-row snake when crowded); hub-spoke radial |
| `4:3` | 960×720 | older decks, docs | snake grid; radial |
| `1:1` | 720×720 | LinkedIn/Instagram feed | snake grid; radial |
| `9:16` | 540×960 | Reels/Shorts/TikTok, phone | column with labels right; hub-spoke tree |
| `wide` | 960×auto | web strip inside a page | row; height computed |
| `tall` | 360×auto | phone column on a page | column / tree; height computed |

Fixed formats auto-fit text up to 22 px (sequence) / 20 px (hub-spoke) and
step down to 14 px; strips max 16 px. A spec that cannot fit fails `check`
with a reason. Fix it with shorter labels, fewer nodes, or another format.
Never by cropping.

Web pages: mount `wide` + `tall` and switch at the width where the wide
layout's text would fall below ~14 px on screen.

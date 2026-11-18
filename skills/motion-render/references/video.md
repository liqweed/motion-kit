# Video

## motion-kit's own pipeline (SVG scenes, silent)

```
frame f → t = f/fps − lead → renderSvg(standalone, opaque bg) → PNG (resvg) → ffmpeg stdin
```

- No browser, no per-frame files; repeated timestamps (lead and final hold) reuse their PNG.
- `--hold` (default 1.5 s) keeps the final frame readable; `lead` 0.25 s.
- Encoders: MP4 `libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart`
  (even dimensions padded); WebM `libvpx-vp9 -crf 32`; GIF two-pass palette,
  ≤ 20 fps, Bayer dither.
- Output summary prints probe data (size, duration, fps). `--sheet` writes a
  1 fps contact sheet (5 columns) for review.
- Determinism: same spec + style + settings → same frames. Encoder output is
  stable on one machine/ffmpeg version; don't byte-compare across machines.

## Sizes (scale 2)

| Format | Canvas | Video |
|---|---|---|
| 16:9 | 960×540 | 1920×1080 |
| 4:3 | 960×720 | 1920×1440 |
| 1:1 | 720×720 | 1440×1440 |
| 9:16 | 540×960 | 1080×1920 |

## Variant matrix

A shell loop over scene × format × locale (× style) writes
`<scene>-<format>-<locale>.mp4`. Keep the matrix explicit and small: render
what will actually be published.

```bash
for f in 16:9 1:1 9:16; do for l in en nl; do
  mk video spec.json -f "$f" -l "$l" -o "out/$(basename spec .json)-${f/:/x}-$l.mp4"
done; done
```

Marketing-style variants (hook A/B/C × CTA) are separate specs or spec fields.
Never generate claims for them.

## When to hand off to HyperFrames

Use HyperFrames (Apache-2.0, HeyGen) when the video needs screen recordings,
images or footage, audio or voice-over synced to beats, captions, or multi-scene
edits longer than ~30 s.

- Install its skills in that repo only: `npx skills add heygen-com/hyperframes`
  (or `claude plugin marketplace add heygen-com/hyperframes` →
  `claude plugin install hyperframes@hyperframes`). Requires Node 22+ and FFmpeg.
- Two ways to bring a motion-kit diagram in:
  1. **As a clip:** render `mk video … -o diagram.webm` (or a PNG sequence) and
     place it as a media element in the composition. Simplest and robust.
  2. **Live:** embed the `build` output and drive it through HyperFrames'
     custom-runtime adapter, calling `window.__motionKit[id].seek(t)` per frame.
     Verify the adapter API against the current HyperFrames docs first.
- Sync visual beats to audio by putting beat times in the spec and deriving the
  timeline from them.

Remotion is the alternative for React-heavy teams. Check its company licence first.

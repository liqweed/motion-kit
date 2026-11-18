# Motion vocabulary

## Easing (`runtime/motion.mjs`, exact cubic-bézier solve, no overshoot)

| Name | Curve | Use |
|---|---|---|
| `easeOut` | `cubic-bezier(0, 0, .2, 1)` | entrances, appearing |
| `easeStandard` | `cubic-bezier(.4, 0, .2, 1)` | movement between two visible states, fills, draw-on |
| `easeIn` | `cubic-bezier(.4, 0, 1, 1)` | exits (rare in explainers) |
| `linear` | — | only for things that should feel mechanical (progress bars) |

## Timing budget

| Event | Duration |
|---|---|
| One entrance | 300–600 ms |
| Sibling stagger | 80–150 ms, reading order |
| State fill (pending → active) | 200–300 ms |
| Travel between nodes | 350–500 ms |
| Pause between beats | ≥ 50 ms, so step frames settle |
| Whole explainer | aim for ≤ 8 s, then hold; gate limit 12 s |

## Springs, without breaking random access (derived)

Frame-by-frame spring simulation depends on earlier frames. Use the closed form.
A **critically damped** spring never overshoots:

```
s(τ) = 1 − (1 + ωτ)·e^(−ωτ)        τ > 0, else 0          (springStep)
```

ω ≈ 8–16 rad/s for UI-scale motion (settles in `9.24 / ω` s). The value snaps to
exactly 1 at ωτ ≥ 9.24 (error ≤ 0.1 %), so settled frames are byte-stable.

**Retargeting** (a value that changes target mid-flight) is exact superposition,
because the spring is linear and time-invariant:

```
value(t) = from + Σ (to_i − to_{i−1}) · s(t − at_i)        (springTo)
```

Continuous at every change, still random-access. Underdamped (bouncy) springs
are out of scope for explainers.

## Split edges (derived)

A moving shape's leading edge moves first and the trailing edge follows a
little later with the same curve: the shape stretches in flight and settles at
its own length. `splitEdge(t, start, dur, lag = 0.07)` → `{ lead, trail }`.
Use 50–100 ms lag. Draw the shape from `trail` to `lead`.

## Container and text timing

- The container (box, card) starts moving immediately; new text appears only
  once there is room for it; the old text is gone before the next transition.
- Labels never move while being read: animate the node, not its label.
- Cross-fade text colour (muted → ink) together with the node's fill.

## Banned in explainers

Bounce and elastic easing · parallax · looping or auto-advancing carousels ·
ambient motion · `transition: all` · anything whose only purpose is decoration.

## Sound (video only)

Attach visual events (a node lighting, a link completing) to beat or peak
times in the soundtrack: put the times in the spec and derive the timeline
from them. Use licensed or original audio only, and review audio like visuals.
motion-kit's own video path is silent. For audio-synced edits use HyperFrames
(see `ecosystem.md`).

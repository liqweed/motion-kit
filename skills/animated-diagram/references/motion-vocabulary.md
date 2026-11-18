# Motion vocabulary

## Easing (`runtime/motion.mjs`, exact cubic-bézier solve, no overshoot)

| Name | Curve | Use |
|---|---|---|
| `easeOut` | `cubic-bezier(0, 0, .2, 1)` | entrances, appearing |
| `easeStandard` | `cubic-bezier(.4, 0, .2, 1)` | movement between two visible states, fills, draw-on |
| `easeIn` | `cubic-bezier(.4, 0, 1, 1)` | exits (rare in explainers) |
| `linear` | — | only for things that should feel mechanical (progress bars) |

A style can replace `easeOut` and `easeStandard` for its diagrams (`motion` in
`styles.md`); scene types and custom scenes get them from `easings(style.motion)`,
so write `const { easeOut, easeStandard } = kit.easings(style.motion)` in a
custom scene's `frame` rather than importing the constants.

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

## Where this departs from interface-motion standards

Other design skills (Emil Kowalski's `choreograph`, `review-animations`,
`animate`; Impeccable's `animate`) set rules for interface feedback: a hover, a
menu, a toast. A diagram that explains is not that, and an agent that has those
skills installed will "fix" what follows unless it knows these are decided. The
rule is: **this file decides how a scene moves; those skills decide how the page
around it moves.** A finding from them against a scene type is an issue, not an
edit.

| Their rule | What a scene does | Why |
|---|---|---|
| Interface motion stays under 300 ms | Entrances run 300–600 ms, the whole scene up to 8 s | A viewer reads a diagram while it builds; feedback is felt, not read. Speed that suits a button hides which node came first |
| Stagger is non-uniform (`choreograph`: "Uniform stagger is forbidden") | `sequence` enters its nodes on a uniform `k * ENTER_GAP`, siblings 80–150 ms apart in reading order | The gap is the order. An uneven rhythm reads as emphasis the data does not have; a viewer counts nodes by the beat |
| Fade or scale in from a rest state, feel alive | Nothing moves at a step's `at`; step frames are settled | A step frame is exported as a slide, a still and a poster. It must be the picture, not a frame mid-move |
| Interrupt-friendly, spring-based motion | Closed-form critically damped springs and fixed timelines; a seek jumps, it does not retarget | Same `t`, same bytes: export, video and the gate depend on it |
| Keep animating on repeat, or ambient motion for delight | One build, then hold; no loops, no ambient motion | Looping decoration competes with the text beside the diagram |
| Skip animation on high-frequency surfaces | Every scene animates, but `prefers-reduced-motion` shows the final frame | A diagram is opened to be watched, once; reduced motion keeps the content and drops the travel |

What does carry over: no `transition: all`, animate `transform` and `opacity`
in the page around a diagram, honour reduced motion, and never overshoot. A
style's `motion` curves (`styles.md`) are how a diagram takes on the page's own
curve without changing any of the above.

## Banned in explainers

Bounce and elastic easing · parallax · looping or auto-advancing carousels ·
ambient motion · `transition: all` · anything whose only purpose is decoration.

## Sound (video only)

Attach visual events (a node lighting, a link completing) to beat or peak
times in the soundtrack: put the times in the spec and derive the timeline
from them. Use licensed or original audio only, and review audio like visuals.
motion-kit's own video path is silent. For audio-synced edits use HyperFrames
(see `ecosystem.md`).

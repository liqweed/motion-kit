---
title: motion-kit — roadmap
status: draft
last_updated: 2026-11-18
---

# motion-kit — roadmap

What is left to do. The tracker is the source of truth for status: each line
links its GitHub issue, and this page only says why the items exist, in what
order they should land, and how to tell they are done. Product intent is in
[`prd.md`](prd.md); the contract is in [`spec/technique.md`](spec/technique.md).
Shipped work is in [`CHANGELOG.md`](../CHANGELOG.md), not here.

## Next

| Issue | Remaining work | Done when |
|---|---|---|
| [#11] | Import Mermaid flowcharts as specs, with build-time layout. | Linear input becomes a valid sequence; branching input passes in every format; unsupported syntax is named in errors. |

## Later: the website

These serve motion-kit's own reach; the first consuming site needs none of
them (inference).

| Order | Issue | What and why | Done when | Priority |
|---|---|---|---|---|
| 1 | [#14] | Land the Claude Design bundle the site was built from ([#23] built the site, but the bundle was not committed and `design_brief.prototypes` is not set in `.config/jig.yaml`). Its "needs" list holds work with no issue yet (see [Suggestions](#suggestions-with-no-issue-yet)). | The bundle is committed and passes the design-brief landing check; every item on its "needs" list has an issue or is built. | high |
| 2 | [#2] | Finish the website epic: land the missing design bundle and reconcile its remaining needs. | Every sub-issue is closed. | high |

## Open questions

Decisions, not commitments. Each one is the maintainer's call.

### Continuous scroll-linked playback, or layered output for CSS 3D

motion-kit jumps between settled steps, and `scrollSteps` does
the same: scrolling one section forward plays to the next settled step. A
consumer is weighing a "map that tilts into layers" motion that follows the
scroll position. That needs one of two things motion-kit does not have:
continuous scroll-linked playback, or a scene output of separate layer groups
that CSS 3D transforms can move.

**Evidence: a consumer's prototype, measured 2026-11-16.** The prototype drew
flat layers and moved them with CSS 3D transforms; it did not use motion-kit.
Method: Playwright 1.62.1 driving headless Chrome 157 on a Linux workstation,
with GPU compositing and with software compositing; CPU slowdown through the
DevTools protocol; frame intervals from a Chrome trace; a 1280 × 800 laptop
viewport and a 390 × 844 phone viewport at 3x; two runs per row, median.

- **Played once,** all 22 animations per view touched only `transform` and
  `opacity`, and ran on the compositor. It needed 3.5 to 6 style
  recalculations in 3.6 s, kept a median frame interval of 16.7 ms at 1x, 4x
  and 6x slowdown, and missed at most 1.5% of frames.
- **Linked to the scroll position** (a CSS scroll timeline), it recalculated
  style on the main thread for every scroll frame (123 to 130
  recalculations), without layout or paint. It missed at most 0.4% of frames
  at 6x slowdown, but the test page did nothing else on the main thread.
  Whether it keeps up while the main thread is blocked could not be
  determined headless.
- **With reduced motion emulated,** it showed no animation and matched the
  final frame.
- **What it could not do that a motion-kit scene does:** building heights
  (every layer is a flat plane, a block would need five faces, and WebKit
  sorts such 3D planes differently); step-frame export (no function returns
  the picture at time t, so no slide frames and no video); the label-fit
  check, which became handwork.
- Safari and Firefox were not tested.

**Options.**

- **a. Keep the canon.** Scroll-linked effects stay outside motion-kit; the
  final frame and the settled steps stay the source of truth.
- **b. Add a layered output.** A scene emits separate layer groups with
  stable ids that page CSS can move in 3D, while `frame(t)` still serves
  export and the gate. This keeps export (inference), but splits the motion
  between the scene and the page's CSS, which the gate cannot see.
- **c. Allow scroll-linked playback** by calling `seek(t)` on every scroll
  frame. This breaks the settled-steps rule. The live player patches the
  SVG in place, which makes a frame on a 25 KB scene about a third as costly
  as before (`npm run bench:player`), so the cost is smaller than when this
  question was first asked.

### Performance of external playback drivers

`seek(t)` and the controller are public APIs, and their autoplay, visibility
and reduced-motion responsibilities are documented in the interaction reference.
The remaining question is the supported scene-size/frame-time budget for a
continuous outside driver. Measure on the consuming site, including a busy main
thread and reduced-motion behavior, before promising a threshold.

## Consumer validation

Measure a large live scene on docomply.eu against its Lighthouse performance
score target of 90. The player benchmark alone does not establish that result.

## Housekeeping

Tracker and registry tasks; no code.

- npm lists a `0.0.0-stage` version, published 2026-11-16 before 0.2.0.
  Deprecating it (`npm deprecate`, as a package owner) would keep it out of
  users' view (inference).

## Suggestions with no issue yet

Candidates only; none is filed.

| Candidate | Why |
|---|---|
| The Claude Design bundle's style skins and its three scene types with no issue: `before-after`, `comparison` and `funnel`. | The site shows them as "needs" cards. The skins (the node, connector and emphasis "draw" block) link to nothing; the types need their own tracker items. |
| An accessibility check (WCAG 2.1 AA) on a built player page, with JavaScript on and off, light and dark, and reduced motion. | The defects a consumer found in the player (step text, target size, stage semantics, duplicate ids) were fixed one by one; nothing keeps them fixed except unit tests. |
| A frame-time budget, checked in CI on the benchmark scene. | `npm run bench:player` measures the live player at 6x CPU slowdown but enforces nothing and needs a local Chromium. A budget would make "fast enough on a mid-range phone" a checked promise. The value is the maintainer's call. |
| A cross-browser smoke test of the player in Firefox and WebKit. | The visibility observer, the in-place updates and the scroll helper were checked only in Chromium. |
| A way for vendoring consumers to learn that a new version exists. | PRD §10 question 7. `MOTION_KIT_VERSION` records the vendored version, but nothing compares it with the latest release. |
| The site follow-ups [#23] left open: self-hosted fonts instead of Google Fonts, and a redirect from `www.motion-kit.dev`. | [#23] lists both as not done. |

## Not planned

The PRD's non-goals still hold: no general video editing (hand off to
HyperFrames or Remotion), no automatic layout of large graphs inside the
runtime, no bouncy, ambient or looping motion, no brand styles shipped in the
repository, no font embedding in SVG.

Scroll effects stay inside the motion vocabulary: scroll advances settled
steps, with no parallax and no continuous scroll-scrubbing of diagrams
([`interactivity.md`](../skills/animated-diagram/references/interactivity.md)),
unless the open question above decides otherwise.

[#2]: https://github.com/liqweed/motion-kit/issues/2
[#11]: https://github.com/liqweed/motion-kit/issues/11
[#14]: https://github.com/liqweed/motion-kit/issues/14
[#23]: https://github.com/liqweed/motion-kit/pull/23

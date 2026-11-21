---
title: motion-kit — roadmap
status: draft
last_updated: 2026-11-21
---

# motion-kit — roadmap

What is left to do. The tracker is the source of truth for status: each line
links its GitHub issue, and this page only says why the items exist, in what
order they should land, and how to tell they are done. Product intent is in
[`prd.md`](prd.md); the contract is in [`spec/technique.md`](spec/technique.md).
Shipped work is in [`CHANGELOG.md`](../CHANGELOG.md), not here.

## Next: the website

These serve motion-kit's own reach; the first consuming site needs none of
them (inference).

| Order | Issue | What and why | Done when | Priority |
|---|---|---|---|---|
| 1 | [#14] | Run the design round again from scratch ([#23] built the site from a bundle that was never committed): the Module design is picked, its bundle is in `design/prototypes/motion-kit-site/` and passes the landing check, and `website/DESIGN.md` pins the house values. Its "needs" items are [#73], [#74], [#75] and [#76]. | The pull request merges with the raw delivery commit kept in history, and the issue closes. | high |
| 2 | [#61] | Build the picked design: the site's pages, the docs on the site and the isometric showcase. | The site follows `website/DESIGN.md`, at phone width too. Built pages get the isometric helpers from [#64] since [#77] (fixes [#70]). The contrast gate fails only on pairs a scene draws once [#79] merges ([#72]); until then it also fails on shared pairs a scene never draws. | high |
| 3 | [#2] | Finish the website epic. | Every sub-issue is closed. | high |

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

### A product walkthrough scene type, or leave demos to React tools

docomply.eu's redesign brief says proof comes from "the product shown at
work". The closest tool to motion-kit is Stageshow (benjitaylor/skills, MIT).
It builds faux product UI as scripted beats on a virtual clock, rests on a
static poster frame under reduced motion, and films to video. It shares
motion-kit's idea of deterministic, clock-driven scenes, but it is a React kit
with lucide icons. It cannot reach Slidev decks or a site without React.
motion-kit already has its own versions of the beats (settled steps), the
poster (the final frame) and the pause control. Stageshow's 10–16 s loops are
excluded here (see [Not planned](#not-planned)).

**Options.**

- **a. Diagrams only.** Product demos are made in the host's own stack:
  Stageshow where the host renders React, video elsewhere.
- **b. A `walkthrough` scene type.** Panels, a cursor and a highlight, under
  the same `frame(t)` contract and gate. One scene would then serve the site,
  the decks and video. It moves motion-kit from explaining towards showing
  (inference).
- **c. A recipe, not a type.** A documented custom-scene pattern for a single
  walkthrough, with no gate support for its layout.

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
| An accessibility check (WCAG 2.1 AA) on a built player page, with JavaScript on and off, light and dark, and reduced motion. | The defects a consumer found in the player (step text, target size, stage semantics, duplicate ids) were fixed one by one; nothing keeps them fixed except unit tests. Impeccable's detector already covers the rendered half, contrast and text size (`npx impeccable detect <url>`), so the check can start from it (inference). |
| A frame-time budget, checked in CI on the benchmark scene. | `npm run bench:player` measures the live player at 6x CPU slowdown but enforces nothing and needs a local Chromium. A budget would make "fast enough on a mid-range phone" a checked promise. The value is the maintainer's call. |
| A cross-browser smoke test of the player in Firefox and WebKit. | The visibility observer, the in-place updates and the scroll helper were checked only in Chromium. |
| A redirect from `www.motion-kit.dev` to `motion-kit.dev`. | Left open by [#23]. It needs a DNS record and a redirect rule in the Cloudflare account, outside the repository; `www` answers with an error today. |
| Mermaid state diagrams as `state-machine` specs. | Out of scope for [#11]'s flowchart import. A state diagram names no path, so the import would need one from the user. |
| Larger imported flowcharts. | `motion-kit import` stops at 12 nodes and 20 links, the `flowchart` type's bounds; bigger charts must be split by hand. |

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
[#61]: https://github.com/liqweed/motion-kit/issues/61
[#64]: https://github.com/liqweed/motion-kit/pull/64
[#70]: https://github.com/liqweed/motion-kit/issues/70
[#72]: https://github.com/liqweed/motion-kit/issues/72
[#73]: https://github.com/liqweed/motion-kit/issues/73
[#74]: https://github.com/liqweed/motion-kit/issues/74
[#75]: https://github.com/liqweed/motion-kit/issues/75
[#76]: https://github.com/liqweed/motion-kit/issues/76
[#77]: https://github.com/liqweed/motion-kit/pull/77
[#79]: https://github.com/liqweed/motion-kit/pull/79

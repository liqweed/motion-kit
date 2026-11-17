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

This version was written on 2026-11-18, against `main` with the pull request
that carries it merged. A line that is a judgement, not a fact, says
"(inference)". Every issue's acceptance criteria also include "the
repository's gates pass (`npm run gate`)"; the tables leave that out.

## Where things stand

- **Published:** 0.4.0 is on npm through trusted publishing, with GitHub
  releases for 0.3.0 and 0.4.0.
- **Waiting to release:** the change notes of the pull request that carries
  this page (the skills' toolkit lookup, scroll and hover helpers, in-place
  live updates, the `timeline` and `stack` types, the stricter gate and
  contrast check, neutral's darker accent). Merging it opens the next release
  pull request.
- **The first consuming site** (docomply.eu, an Astro static site in Dutch and
  English) has what it listed as needs, except two: continuous scroll-linked
  or layered 3D motion (an [open question](#open-questions)), and a Lighthouse
  performance score of 90 or higher while a large scene plays, which the
  in-place updates should give but which nobody has measured on the site
  (inference).

## Now: settle the gate's promise

| Order | Issue | What and why | Done when | Priority |
|---|---|---|---|---|
| 1 | — | Confirm or revert neutral's new light accent (`#2563eb` → `#1d36a8`) and dark emphasis (`#f59e0b` → `#fbbf24`). The contrast check now requires emphasis on accent at 3:1, which a mid-tone accent on white cannot meet. The change also recolours the logo, and the website's own stylesheet still uses `#2563eb`. | The maintainer keeps the tokens and the site's `site.css` follows them, or lowers the rule (the pair or its threshold) and neutral goes back. | high |
| 2 | [#12] | Decide the gate's open questions (see [Open questions](#the-gates-open-questions-12)), then make the code, the docs and the spec agree. Users rely on the gate's promise, and its documented and enforced rules still differ. | Each question has a recorded answer; spec discrepancies D1 to D4 and D7 are gone; the README, AGENTS and the skills state the same rules the gate enforces. | medium |

## Next: more built scene types

| Order | Issue | What and why | Done when | Priority |
|---|---|---|---|---|
| 1 | [#18] | Promote `state-machine` from a storyboard in [`scene-types.md`](../skills/animated-diagram/references/scene-types.md) to a spec-driven type. Most diagrams that are not a sequence, a hub, a timeline or a stack still need a custom module. | An example spec passes `motion-kit check` in every format and in `en` and `nl`; the scene-types reference documents its fields; the website shows it live. | medium |
| 2 | [#19] | Promote `request-journey` the same way. With [#18], this closes the epic [#3]. | As for [#18]. | medium |
| 3 | [#11] | Import Mermaid flowcharts as specs, laid out once at build time (ELK or dagre). | A linear flowchart imports to a `sequence` spec that passes the gate; a branching one imports to a scene that passes in every format; unsupported syntax fails with an error that names it. | medium |

## Later: the website

These serve motion-kit's own reach; the first consuming site needs none of
them (inference).

| Order | Issue | What and why | Done when | Priority |
|---|---|---|---|---|
| 1 | [#14] | Land the Claude Design bundle the site was built from ([#23] built the site, but the bundle was not committed and `design_brief.prototypes` is not set in `.config/jig.yaml`). Its "needs" list holds work with no issue yet (see [Suggestions](#suggestions-with-no-issue-yet)). | The bundle is committed and passes the design-brief landing check; every item on its "needs" list has an issue or is built. | high |
| 2 | [#15] | Add a spec playground to the website. | A pasted spec renders and plays; a failing spec shows the gate's message; reloading a shared URL restores the spec. | low |
| 3 | [#2] | Finish the website epic: the "one scene, every medium" idea on the first screen, at least 12 live examples, reusable scroll and interaction patterns. | Every sub-issue is closed. | high |

## Open questions

Decisions, not commitments. Each one is the maintainer's call.

### The gate's open questions ([#12])

[PRD §10](prd.md#10-open-questions) questions 1 to 5, recorded as spec
discrepancies D1 to D4 and D7. Question 6 (vendored gate parity) is answered in
practice: `motion-kit check` and the vendored `check.mjs` run the same code
(`lib/gate.mjs`); [#12] should record that as the rule.

1. **Duration budget.** The gate fails only above 12 s; the README and AGENTS
   say about 8 to 10 s; the skill says about 8 s. Which number is the rule?
2. **`bake` and `video`.** `build` and `export` refuse a scene that fails the
   gate; `bake` and `video` do not. Should they?
3. **Locales for custom modules.** `check` tests a module only in `en` unless
   `--locale` is given. Should modules declare their locales?
4. **Missing translations.** `localize()` falls back silently. Should a missing
   locale fail the gate?
5. **Style `radius` and `stroke`.** Accepted and documented, never read. Wire
   them or drop them?

### Continuous scroll-linked playback, or layered output for CSS 3D

motion-kit jumps between settled steps, and the new `scrollSteps` helper does
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
  frame. This breaks the settled-steps rule. The live player now patches the
  SVG in place, which makes a frame on a 25 KB scene about a third as costly
  as before (`npm run bench:player`), so the cost is smaller than when this
  question was first asked.

### Should `seek(t)` be the documented hook for outside drivers?

The controller is `{seek, play, pause, seekStep, playToStep, destroy, time,
scene}`. The player puts it on `globalThis.__motionKit[id]` as a capture hook
for renderers (spec §10.2), and the element and the Astro adapter hand it out
as `.controller` after `motion-ready`. The ecosystem reference says HyperFrames
and paused GSAP timelines can drive `seek(t)`. But the hook's key is
format-suffixed, and generated in the Astro adapter (spec D10, PRD §10
question 8), and `seek(t)` cancels playback. To decide:

- Is `seek(t)` part of the stability promise ([`stability.md`](stability.md))?
- Do outside drivers use the hook key, or only the adapters' `.controller`?
- What does a driven player do with autoplay, the visibility observer and
  reduced motion?
- Up to what scene size is calling `seek(t)` at frame rate supported?

## Housekeeping

Tracker and registry tasks; no code.

- npm lists a `0.0.0-stage` version, published 2026-11-16 before 0.2.0.
  Deprecating it (`npm deprecate`, as a package owner) would keep it out of
  users' view (inference).
- PRD §10 question 6 can be marked answered once [#12] records parity as the
  rule.

## Suggestions with no issue yet

Candidates only; none is filed.

| Candidate | Why |
|---|---|
| A step-change event on the player (for example `motion-step` on the container, or an `onStep` option). | `scrollSteps` and `linkSteps` mark the active section or term only when they cause the change; when a reader uses the player's own buttons or keyboard, the marks do not follow. The website polls the controller to keep its marks right. |
| The Claude Design bundle's style skins and its three scene types with no issue: `before-after`, `comparison` and `funnel`. | The site shows them as "needs" cards. The skins (the node, connector and emphasis "draw" block) link to nothing; the types would join [#3]'s list. |
| A consumer guide for vendoring into an Astro site: dictionaries as scene options, theme and style, the server render, the vendored gate in CI, the page helpers, and re-vendoring on upgrade. | The README's Astro section shows the props; one worked guide would show the whole path. |
| An accessibility check (WCAG 2.1 AA) on a built player page, with JavaScript on and off, light and dark, and reduced motion. | The defects a consumer found in the player (step text, target size, stage semantics, duplicate ids) were fixed one by one; nothing keeps them fixed except unit tests. |
| A frame-time budget, checked in CI on the benchmark scene. | `npm run bench:player` measures the live player at 6x CPU slowdown but enforces nothing and needs a local Chromium. A budget would make "fast enough on a mid-range phone" a checked promise. The value is the maintainer's call. |
| A cross-browser smoke test of the player in Firefox and WebKit. | The visibility observer, the in-place updates and the scroll helper were checked only in Chromium. |
| One issue for the spec discrepancies that no issue covers: D5, D6, D8, D9, D10, D12, D13 and D14. | [#12] covers D1 to D4 and D7. D14 (the manifest's input hash ignores the runtime) sits next to the new `sourceDirty` flag. |
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
[#3]: https://github.com/liqweed/motion-kit/issues/3
[#11]: https://github.com/liqweed/motion-kit/issues/11
[#12]: https://github.com/liqweed/motion-kit/issues/12
[#14]: https://github.com/liqweed/motion-kit/issues/14
[#15]: https://github.com/liqweed/motion-kit/issues/15
[#18]: https://github.com/liqweed/motion-kit/issues/18
[#19]: https://github.com/liqweed/motion-kit/issues/19
[#23]: https://github.com/liqweed/motion-kit/pull/23

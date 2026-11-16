---
title: motion-kit — roadmap
status: draft
last_updated: 2026-11-16
---

# motion-kit — roadmap

What comes after 0.3.0. The tracker is the source of truth for status: each
line links its GitHub issue or pull request, and this page only says why the
items exist, in what order they should land, and how to tell they are done.
Product intent is in [`prd.md`](prd.md); the contract is in
[`spec/technique.md`](spec/technique.md).

This version was written on 2026-11-16. It reads `main` at `9473c4f`, the
issues and pull requests as GitHub showed them that day, and the needs of the
first consuming site, docomply.eu, an Astro static site in Dutch and English.
A line that is a judgement, not a fact, says "(inference)". Every issue's
acceptance criteria also include "the repository's gates pass
(`npm run gate`)"; the tables leave that out.

## Where things stand

- **0.3.0 is tagged but not published.** The tag `v0.3.0` points at
  `b39d016`. On 2026-11-16, `npm view @liqweed/motion-kit version` printed
  `0.2.0`, and the latest GitHub release was `v0.2.0`. The Release run for the
  tag passed the gate, then failed at `npm publish` with an OIDC 403
  ([#32]).
- **What 0.3.0 holds.** [#24] added `playToStep(i)` (closing [#8]) and the
  `<motion-diagram>` custom element with `vendor --adapter element` (closing
  [#10]), and fixed player teardown. The same range turned on CI ([#28]) and
  the change-note changelog ([#26], [#27]); [#29] cut the release.
- **What [#31] brings (open).** Label dictionaries keyed by locale for the
  player's controls; keyboard step changes announced through a polite live
  region; the Astro adapter tearing down and remounting its players across
  view transitions; one player per container. Its checks pass. One review
  thread (the Slidev announcement after a scene swap) is unresolved, and its
  manual view-transition check is unticked. Its change note says
  `release: minor`, so merging it makes the next release 0.4.0 (inference).
- **`main` since the tag** has one commit, [#30], which moved the workflows'
  actions off Node 20. It ships nothing.

## Now: release, and what a consuming Astro site needs

A site that vendors motion-kit needs a published version, an adapter that
mounts its own scenes with its own text and colours, a gate that runs in its
CI, and a player that meets WCAG 2.1 AA without shifting the layout. The order
is what blocks such a site first.

This tier also finishes the release hygiene: outside users and contributors
arrive with the public release, and [#32] and [#7] make the repository easy to
install and safe to contribute to.

| Order | Issue | What and why | Done when | Priority |
|---|---|---|---|---|
| 1 | [#32] | Publish 0.3.0 through trusted publishing. Sites install from npm, and trusted publishing has never published this package. | `npm view @liqweed/motion-kit@0.3.0 version` prints 0.3.0; a `v0.3.0` GitHub release exists; the publish step used OIDC and npm shows provenance; if the fix was an npmjs.com setting, `release.yml`'s header names the Trusted Publisher values. | high |
| 2 | [#33] | Let the Astro adapter mount custom scene modules, and pass caller options (such as `labels` or `view`) to a module's factory, also through `loadScene`, `check`, `export` and `build`. Custom modules are the documented way to draw what the types cannot, and a bilingual site keeps its copy in dictionaries. | A test module with a `labels` option renders the same final frame from the adapter's server render and from the live player, in `en` and `nl`; a test shows `loadScene` passing options through; `check`, `export` and `build` each pass the caller's options (such as `labels`) to the module factory. | high |
| 3 | [#34] | Add `theme` and `style` props to the Astro adapter. Today an Astro page always gets the neutral style and follows the system colour scheme. | With `theme="light"`, the diagram stays light under an emulated dark scheme; with a custom `style`, the server frame and the player both use its token values. | high |
| 4 | [#31] (PR) | Locale label dictionaries, keyboard step announcements, Astro teardown and remount. Bilingual sites need translated controls, screen-reader users need step changes announced, and view transitions leaked players. | The gate passes and unit tests cover the live region and `resolveLabels` (both done); the manual check across a view transition passes; the open review thread is settled. | — |
| 5 | [#35] with [#12] | Make the vendored gate load custom modules, take locales and a style, and run the contrast check. A consuming site runs this gate in its CI, and today it crashes on an `.mjs` scene. [#12] holds the parity decision (see [Open questions](#open-questions)). | In a vendored copy, a custom module passes in every format, in `en` and `nl`, with a custom style and its contrast check; a failing style exits non-zero; an unloadable file fails on its own and later files are still checked; a test runs `vendor`, then the gate. | high |
| 6 | [#36] | Server-render the step list and the token values, and reserve the controls' space. Without JavaScript the steps are missing and nodes render black; mounting moves the content below (measured in [#36]: the box grows from 206 to 342 px at a 390 px viewport). | With JavaScript off, the style's colours show and the accessibility tree has an ordered step list; a `layout-shift` observer records nothing for the diagram at 390 and 1440 px; the box height is the same before and after mount. | high |
| 7 | [#37] | Give every control a 44 × 44 px target, and the focusable stage a role and a name. Buttons measured 30 px tall ([#37]). | Every control's hit area is at least 44 × 44 px at 390 and 1440 px; the stage has a role and an accessible name, and so does every element with `tabindex="0"`; player tests cover it. | high |
| 8 | [#38] | Re-inject the player stylesheet after an Astro view-transition swap. The once-per-document guard leaves remounted players unstyled, and [#31] keeps that guard. | A test removes the injected style, mounts again and finds exactly one player stylesheet; on a page reached by client-side navigation, the controls are styled. | medium |
| 9 | [#39] | Give scenes an instance prefix for their `<defs>` ids. Two instances on one page, such as the wide and tall pair the Astro adapter recommends, share ids, so the second clips with the first one's definition. | Two players side by side each clip with their own definition, and the page has no duplicate ids; the adapter's wide and tall server renders share no ids; a test asserts it. | medium |
| 10 | [#40] | Show the scene's tall layout in the contact sheet's phone row. That row is the wide export shrunk to 360 px, which is not what a phone shows. | Exporting `examples/order-flow.json` at 16:9 gives a phone row with the `tall` format's viewBox (width 360); a test covers it. | medium |
| 11 | [#7] | Add CONTRIBUTING and a stability promise for the runtime exports. The CHANGELOG part is done ([#26]). Vendoring consumers need to know what semver covers. | CONTRIBUTING, CHANGELOG and an API stability section exist and are linked from the README. | high |

## Next: embedding in pages

Once a site can vendor motion-kit, its pages want to drive diagrams from their
own copy, and keep them cheap while they play.

| Order | Issue | What and why | Done when | Priority |
|---|---|---|---|---|
| 1 | [#41] | Let a step carry a stable `id`, accepted by `seekStep` and `playToStep`, and give page scripts a supported handle on the Astro adapter's players. A link from page copy to a step index breaks silently when steps move, and page scripts cannot reach the adapter's controllers. | A page script calls `playToStep` with a step id on an Astro-mounted diagram, and the player plays to that step; `seekStep("unknown")` throws `RangeError`; tests cover the player and one scene type; spec §10.2 documents both. | medium |
| 2 | [#9] | Ship the scroll-step and hover-link helpers. The interactivity reference describes both patterns but ships no code. Its blocker [#8] is closed; stable targets come from [#41] (inference). | Scrolling advances one settled step per section, down and up; keyboard focus on a linked term selects the same step as hover; unit tests cover the mapping; the skill reference shows usage. | medium |
| 3 | [#42] | Keep observing visibility while a diagram plays. A diagram taller than 2.5 viewports never autoplays, and a hidden one keeps drawing ([#42]: 60 stage rewrites in the second after `display: none`). | A diagram three viewports tall autoplays; `display: none` stops the frame loop, and removing it resumes playback; tests use a stubbed `IntersectionObserver`. | medium |
| 4 | [#43] | Update the live SVG in place instead of replacing it every frame. The cost grows with scene size: [#43] measured a 4.5 ms median for a 4 KB frame and 16 ms for 23 KB at 6x CPU slowdown, against 16.7 ms per frame at 60 Hz. | On a benchmark scene of about 25 KB per frame, the median frame cost at 6x slowdown is at most half of today's; a test asserts that the live DOM equals a fresh render at sampled times. | medium |

## Later

| Order | Issue | What and why | Done when | Priority |
|---|---|---|---|---|
| 1 | [#6] | Let the skills find motion-kit through an environment variable, then `npx`, then the plugin copy. Three skill files still hard-code the maintainer's clone path at `9473c4f`. Its blocker [#5] is done; the `npx` route also needs [#32] for a current version (inference). | With only the plugin installed, `animated-diagram` runs `check` and `build`; with the npm package, `motion-render` produces PNGs; no skill mentions `~/workspace/motion-kit`. | high |
| 2 | [#44] | Close five exporter and gate gaps: stale files after a re-export, no dirty-tree flag, named colours pass, clock reads inside helpers pass, and the settled check looks back only 1 ms. Each lets a wrong frame through; none breaks the bundled examples. | One probe per case fails the gate or the export test; a re-export test finds no files outside the manifest; the examples still pass. | low |
| 3 | [#45] | Check contrast for every token pair that scenes draw. The check misses emphasis on accent and others, and the neutral style fails some ([#45]: emphasis on accent at 1.62:1 light and 2.41:1 dark). | A style whose emphasis is 1.13:1 on accent fails; tests cover each pair and each exemption; the neutral style passes. | low |
| 4 | [#13] | Add PNG snapshot tests for step frames. Its blocker [#4] is met by CI. | Changing a colour token fails with an image-diff artifact; regenerating snapshots is one documented command. | medium |
| 5 | [#4] (Node 22) | Run the gate on Node 22 as well. CI runs only the `.nvmrc` version (26); [#4] asked for 26 and for 22, the `engines` floor. | The CI gate runs and passes on Node 22 and on Node 26. | high |
| 6 | [#3] with [#16]–[#19] | Promote `timeline`, `stack`, `state-machine` and `request-journey` from storyboards in [`scene-types.md`](../skills/animated-diagram/references/scene-types.md) to spec-driven types, which the gallery and the agent skills both need. Most diagrams need a custom module today, and the site shows these as "needs" cards. | Each type has an example spec that passes `motion-kit check` across formats and locales, and the scene-types reference documents its fields. | medium |
| 7 | [#11] | Import Mermaid flowcharts as specs, laid out once at build time (ELK/dagre). | A linear flowchart imports to a `sequence` spec that passes the gate; a branching one imports to a scene that passes in every format; unsupported syntax fails with an error that names it. | medium |
| 8 | [#15] | Add a spec playground to the website. | A pasted spec renders and plays; a failing spec shows the gate's message; reloading a shared URL restores the spec. | low |
| 9 | [#2] with [#14] | Finish the website epic: the public site at motion-kit.dev, with the "one scene, every medium" idea on the first screen, at least 12 live examples, and scroll and interaction patterns visitors can reuse. Its design runs through Claude Design ([#14]). motion-kit.dev went live with [#23]; [#14]'s bundle and its "needs" list remain, and that list may add items (see [Housekeeping](#housekeeping)). | Every sub-issue is closed. | high |

**No consumer need yet (inference).** The first consuming site needs none of
[#2], [#3], [#11], [#14], [#15] or [#16]–[#19]. Its diagrams are custom
modules, and it does not use the website. These items serve motion-kit's own
reach, not a consumer, and nothing waits on them.

## Open questions

Decisions, not commitments. Each one is the maintainer's call.

### The gate's open questions ([#12])

Settling them makes the gate's promise exact. They are
[PRD §10](prd.md#10-open-questions) questions 1 to 6, recorded as spec
discrepancies D1 to D4, D7 and D11:

1. **Duration budget.** The gate fails only above 12 s
   (`lib/check.mjs:70`); the README and AGENTS say about 8 to 10 s; the skill
   says about 8 s. Which number is the rule?
2. **`bake` and `video`.** `build` and `export` refuse a scene that fails the
   gate; `bake` and `video` do not. Should they?
3. **Locales for custom modules.** `check` tests a module only in `en` unless
   `--locale` is given. Should modules declare their locales?
4. **Missing translations.** `localize()` falls back silently. Should a missing
   locale fail the gate?
5. **Style `radius` and `stroke`.** Accepted and documented, never read. Wire
   them or drop them?
6. **Vendored gate parity.** Must the vendored `check.mjs` match
   `motion-kit check`, or document where it differs?

[#35] gives a consuming site what it needs from questions 3 and 6 without
deciding them. Deciding 3, 4 and 6 first would let [#35] land in its final
shape (inference).

### Continuous scroll-linked playback, or layered output for CSS 3D

Today motion-kit jumps between settled steps. [#9] puts continuous
scroll-scrubbing out of scope, and the interactivity reference says "Don't
scrub continuously on scroll; jump to settled steps." A consumer is weighing a
"map that tilts into layers" motion that follows the scroll position. That
needs one of two things motion-kit does not have: continuous scroll-linked
playback, or a scene output of separate layer groups that CSS 3D transforms
can move.

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
- **What it could not do that a motion-kit scene does:**
  - building heights: every layer is a flat plane, a block would need five
    faces, and WebKit sorts such 3D planes differently;
  - step-frame export: no function returns the picture at time t, so there
    are no slide frames and no video, only screen recordings;
  - the label-fit check, which became handwork.
- Safari and Firefox were not tested.

**Options.**

- **a. Keep the canon.** Scroll-linked effects stay outside motion-kit; the
  final frame and the settled steps stay the source of truth.
- **b. Add a layered output.** A scene emits separate layer groups with
  stable ids that page CSS can move in 3D, while `frame(t)` still serves
  export and the gate. This keeps export (inference), but splits the motion
  between the scene and the page's CSS, which the gate cannot see.
- **c. Allow scroll-linked playback** by calling `seek(t)` on every scroll
  frame. This breaks the settled-steps rule, and until [#43] lands each call
  re-renders the whole SVG (inference).

### Should `seek(t)` be the documented hook for outside drivers?

The controller is `{seek, play, pause, seekStep, playToStep, destroy, time,
scene}`, and the player also puts it on `globalThis.__motionKit[id]` as a
capture hook for renderers (spec §10.2). The ecosystem reference already says
HyperFrames and paused GSAP timelines can drive `seek(t)`. But the hook's key
is format-suffixed, and random in the Astro adapter (spec D10, PRD §10
question 8), and `seek(t)` cancels playback. To decide:

- Is `seek(t)` part of the stability promise ([#7])?
- Do outside drivers (scroll helpers, CSS, another animation library) use the
  hook key, or a per-adapter handle like the one [#41] proposes for Astro and
  the element already has (`.controller` after `motion-ready`)?
- What does a driven player do with autoplay, the visibility observer
  ([#42]) and reduced motion?
- Is calling `seek(t)` at frame rate supported, and up to what scene size
  ([#43])?

## Housekeeping

Tracker and docs updates; no code.

- **Close [#5].** [#25] published `@liqweed/motion-kit` (0.2.0 is on npm),
  added the `npx` line to the README, and set the `files` list.
- **Close [#4], or narrow it to Node 22.** [#28] added `ci.yml`, which runs
  `npm run gate` on every pull request and every push to `main`, with
  `contents: read` and actions pinned by SHA ([#30]). It runs only the
  `.nvmrc` version (26), not Node 22.
- **Narrow [#7].** `CHANGELOG.md` exists with a 0.2.0 entry ([#26]).
  CONTRIBUTING (no such file at `9473c4f`) and the stability section remain.
- **Update [#14].** [#23] built the site from the Claude Design bundle, but
  the bundle itself was not committed, and `design_brief.prototypes` is not
  set in `.config/jig.yaml`. The design's needs for style skins and three
  scene types have no issues (see [Suggestions](#suggestions-with-no-issue-yet)).
- **Link issues from pull requests.** [#25], [#26] and [#28] did not link
  their issues. "Closes #5" fits [#25] and "Closes #4" fits [#28]. [#26] did
  only part of [#7], so "Refs #7" fits it better than "Closes".
- **Trusted publishing has never published.** 0.2.0 went up by hand
  (`release.yml` says the first version of a package is published by hand),
  and the `v0.2.0` Release run skipped its publish step because that version
  was already on npm. [#32] is the first real test.
- (Own suggestion) Closed [#8] and [#10] still carry the `In Progress` label.
- (Own suggestion) npm lists a `0.0.0-stage` version, published 2026-11-16
  before 0.2.0 (`npm view @liqweed/motion-kit versions`, read 2026-11-16).
  Deprecating it would keep it out of users' view (inference).
- (Own suggestion) PRD §10 is behind. Question 11 still says `package.json`
  stays `private`; questions 6, 7 and 8 now have issues ([#35] and [#12],
  [#7], [#41]).
- (Own suggestion) Before merging [#31], settle the open Slidev thread and
  run the manual view-transition check.
- (Own suggestion) [#6] is still marked blocked by [#5], and [#13] by [#4];
  both blockers are done in substance.
- (Own suggestion) Every issue body opens with "**Category**: unknown", a
  template leftover.

## Suggestions with no issue yet

Candidates only; none is filed. Rows marked "own" are this page's additions.

| Candidate | Why |
|---|---|
| A stability promise that names the public exports: the scene API (scene contract, `createScene`, `renderSvg`, type factories, motion helpers, `tok`), the player API (`mountPlayer` options and the controller), and adapter props and attributes (Astro props, `<motion-diagram>` attributes and `motion-ready`, Slidev props), plus the vendored gate's options. | [#7] asks for it, bundled with CONTRIBUTING. [#33], [#39] and [#41] each add public API, so the list should exist before they land. |
| A consumer guide for vendoring into an Astro site: dictionaries as scene options, theme and style, the server render, the vendored gate in CI, and re-vendoring on upgrade. | The README's vendor section is a few lines. [#33], [#34] and [#35] change what a site does; one worked guide shows the whole path. |
| An accessibility check (WCAG 2.1 AA) in the gate or the release, run on a built player page with JavaScript on and off, light and dark, and reduced motion. | [#36], [#37], [#39] and [#45] are accessibility defects that a consumer found and the gate did not. |
| A frame-time budget at 4x and 6x CPU slowdown, checked on a reference scene. | [#43] measures frame cost once. A budget keeps the gain and makes "fast enough on a mid-range phone" a checked promise. The budget value is the maintainer's call. |
| The Claude Design bundle's style skins and its three scene types with no issue: `before-after`, `comparison` and `funnel`. | The site shows them as "needs" cards. The three types link to [#3], whose sub-issues are only [#16]–[#19]; the skins (the node, connector and emphasis "draw" block) link to nothing. |
| A Node version matrix: the `engines` floor (22) and the development version (26), in CI and in the release workflow. | The typecheck uses `@types/node` 22, but no test runs on Node 22. This also covers the rest of [#4]. |
| (Own) A cross-browser smoke test of the player in Firefox and WebKit. | [#42]'s start condition was checked only in Chrome, and the prototype above found that WebKit sorts 3D planes differently. |
| (Own) One issue for the spec discrepancies that no issue covers: D5, D8, D9, D12, D13 and D14. | [#12] and [#44] cover the rest. D14 (the manifest's input hash ignores the runtime) sits next to [#44]'s provenance fix. |
| (Own) A way for vendoring consumers to learn that a new version exists. | PRD §10 question 7 asks it. `MOTION_KIT_VERSION` records the vendored version, but nothing compares it with the latest release. |
| (Own) The site follow-ups [#23] left open: self-hosted fonts instead of Google Fonts, and a redirect from `www.motion-kit.dev`. | [#23] lists both as not done; neither has an issue. |

## Done in 0.3.0

- `playToStep(i)` plays forward to a settled step and holds there; backward
  and reduced-motion calls jump ([#8], through [#24]).
- `<motion-diagram>` embeds a diagram in plain HTML or any framework, from an
  inline or URL spec, with `theme` and `style-spec` attributes, fallback
  content until it renders, and `.controller` after `motion-ready`.
  `vendor --adapter element` copies it ([#10], through [#24]).
- Destroying a player, or interrupting its playback, cleans up its timers and
  listeners ([#24]).
- Release mechanics: change notes and a release pull request ([#26], [#27]);
  the gate in CI on pull requests and `main`, which also gates tagging
  ([#28]); the release commit ([#29]).

0.2.0, the release before, shipped the npm package and the tag-driven release
workflow ([#25]), and the motion-kit.dev site ([#23]).

## Not planned

The PRD's non-goals still hold: no general video editing (hand off to
HyperFrames or Remotion), no automatic layout of large graphs inside the
runtime, no bouncy, ambient or looping motion, no brand styles shipped in the
repository, no font embedding in SVG.

Scroll effects stay inside the motion vocabulary: scroll advances settled
steps, with no parallax and no continuous scroll-scrubbing of diagrams
([`interactivity.md`](../skills/animated-diagram/references/interactivity.md)),
unless the open question above decides otherwise.

## Appendix A: what the first consuming site needs

docomply.eu listed 16 needs before it vendors motion-kit as its one diagram
runtime. State at `9473c4f` and [#31] `099199c`, read 2026-11-16.

| Need | State | Tracked in |
|---|---|---|
| A vendorable, versioned release with a stable export surface | 0.3.0 tagged, not published; `vendor` writes `MOTION_KIT_VERSION`; no stability promise | [#32], [#7] |
| The Astro adapter mounts the site's own scene modules | Not met: the adapter calls `createScene(spec)` only | [#33] |
| Scene text and control labels come from the site's dictionaries, in Dutch and English | Control labels in [#31]; scene text not met (a module receives only format, locale and the kit) | [#31], [#33] |
| The site's own style and a fixed theme | Met by the player and the element; not by the Astro adapter | [#34], [#36] |
| Without JavaScript, the final frame with every label | Met for built-in specs; custom modules wait on [#33]; colours are missing until mount | [#33], [#36] |
| Reduced motion keeps the complete still | Met | — |
| Autoplay once in view, also for diagrams taller than the viewport | Partly: tall diagrams never start | [#42] |
| Step navigation driven from outside the player (scroll, focus) | `seekStep` and `playToStep` exist; no helpers; no handle on the Astro adapter's players | [#9], [#41] |
| Navigating to a named step on a click | Not met: steps are reached by index only | [#41] |
| Step text without JavaScript, announced keyboard stepping, 44 px targets, stage semantics | Announcements in [#31]; the rest open | [#31], [#36], [#37], [#39] |
| Teardown, remount on navigation, hidden instances stop, no layout shift, styles survive a page swap | Teardown met ([#24]); remount in [#31]; the rest open | [#31], [#36], [#38], [#42] |
| A Lighthouse performance score of 90 or higher while a large scene plays | Not met for large scenes (inference from [#43]) | [#43], [#42] |
| The vendored gate passes custom scenes in every format and both languages; phone-size review | Not met: the gate crashes on `.mjs`; the phone row is the wide export scaled down | [#35], [#40], [#12] |
| Slide frames, Slidev and video from the same scene | Met: `export` and `video` accept modules; the Slidev adapter takes `scene` | — |
| (Conditional) Scroll-linked motion, or layered output for CSS 3D | No issue | [Open questions](#open-questions) |
| Agents use the skills without the maintainer's clone path | Not met | [#6] |

## Appendix B: review findings and the issues that cover them

A private code review of the first consuming site's earlier diagram code (a
live player and a frame exporter, closely modelled on motion-kit's;
inference) raised 24 findings on 2026-11-15. Each was checked against
motion-kit at `53a1c8f` and again at `9473c4f` on 2026-11-16, and the open
ones were filed as [#32]–[#45]. Here "fixed" means the defect does not occur
in motion-kit at `9473c4f`; "site-specific" means it lies in the site's own
code or docs.

| # | Defect | Covered by |
|---|---|---|
| 1 | Diagram text ignored the content variant the page had selected | site-specific |
| 2 | Step text hidden without JavaScript | [#36] |
| 3 | Autoplay could start before 40% of the diagram was visible | [#42] (not reproduced in Chrome; other engines unchecked) |
| 4 | Control buttons under 44 px | [#37] |
| 5 | A position marker under 3:1 against the canvas, in the site's brand colour | site-specific; the general check is [#45] |
| 6 | Contact sheet wrote labels and file names into HTML unescaped | fixed: labels and titles are escaped and file names are slugs (`lib/export.mjs:96-104`) |
| 7 | Token resolver could not parse nested `var()` fallbacks | site-specific: motion-kit's `resolveTokens` replaces only `var(--mk-name)` (`runtime/style.mjs:93-100`) |
| 8 | Stale files survive a re-export | [#44] |
| 9 | Manifest records the commit with no dirty-tree flag | [#44] (an input hash exists) |
| 10 | Colour check passes named colours such as `red` | [#44]; every sampled frame is already checked (`lib/check.mjs:41-51`) |
| 11 | No real check against clock and randomness reads | [#44] (the check scans only the frame function's own source) |
| 12 | Settled check looks back only 1 ms | [#44] |
| 13 | A hidden instance keeps animating | [#42] |
| 14 | A skill said an export folder was git-ignored when it was not | site-specific |
| 15 | Docs said Remotion cannot play live in a page | fixed: motion-kit's ecosystem reference makes no such claim |
| 16 | Diagrams taller than 2.5 viewports never autoplay | [#42] |
| 17 | Token substitution rejected ordinary text such as `var(x)` in labels | fixed as reported: the resolver matches only `var(--mk-name)`; a label containing that exact form would still be rewritten (inference) |
| 18 | Colour check missed single-quoted attributes | fixed: the check scans the whole frame text (`lib/check.mjs:50`) |
| 19 | No test for re-export cleanup | [#44] (its acceptance includes a re-export test) |
| 20 | Layout shift when the player mounts | [#36] (measured there) |
| 21 | Colour check missed whitespace around `=` | fixed: same reason as 18 |
| 22 | Layout shift came back with a collapsing fallback list | [#36] |
| 23 | Colour check missed values that span line breaks | fixed: same reason as 18 |
| 24 | Token resolver split quoted strings inside `var()` | site-specific: motion-kit's resolver does not parse CSS strings |

[#2]: https://github.com/liqweed/motion-kit/issues/2
[#3]: https://github.com/liqweed/motion-kit/issues/3
[#4]: https://github.com/liqweed/motion-kit/issues/4
[#5]: https://github.com/liqweed/motion-kit/issues/5
[#6]: https://github.com/liqweed/motion-kit/issues/6
[#7]: https://github.com/liqweed/motion-kit/issues/7
[#8]: https://github.com/liqweed/motion-kit/issues/8
[#9]: https://github.com/liqweed/motion-kit/issues/9
[#10]: https://github.com/liqweed/motion-kit/issues/10
[#11]: https://github.com/liqweed/motion-kit/issues/11
[#12]: https://github.com/liqweed/motion-kit/issues/12
[#13]: https://github.com/liqweed/motion-kit/issues/13
[#14]: https://github.com/liqweed/motion-kit/issues/14
[#15]: https://github.com/liqweed/motion-kit/issues/15
[#16]: https://github.com/liqweed/motion-kit/issues/16
[#17]: https://github.com/liqweed/motion-kit/issues/17
[#18]: https://github.com/liqweed/motion-kit/issues/18
[#19]: https://github.com/liqweed/motion-kit/issues/19
[#23]: https://github.com/liqweed/motion-kit/pull/23
[#24]: https://github.com/liqweed/motion-kit/pull/24
[#25]: https://github.com/liqweed/motion-kit/pull/25
[#26]: https://github.com/liqweed/motion-kit/pull/26
[#27]: https://github.com/liqweed/motion-kit/pull/27
[#28]: https://github.com/liqweed/motion-kit/pull/28
[#29]: https://github.com/liqweed/motion-kit/pull/29
[#30]: https://github.com/liqweed/motion-kit/pull/30
[#31]: https://github.com/liqweed/motion-kit/pull/31
[#32]: https://github.com/liqweed/motion-kit/issues/32
[#33]: https://github.com/liqweed/motion-kit/issues/33
[#34]: https://github.com/liqweed/motion-kit/issues/34
[#35]: https://github.com/liqweed/motion-kit/issues/35
[#36]: https://github.com/liqweed/motion-kit/issues/36
[#37]: https://github.com/liqweed/motion-kit/issues/37
[#38]: https://github.com/liqweed/motion-kit/issues/38
[#39]: https://github.com/liqweed/motion-kit/issues/39
[#40]: https://github.com/liqweed/motion-kit/issues/40
[#41]: https://github.com/liqweed/motion-kit/issues/41
[#42]: https://github.com/liqweed/motion-kit/issues/42
[#43]: https://github.com/liqweed/motion-kit/issues/43
[#44]: https://github.com/liqweed/motion-kit/issues/44
[#45]: https://github.com/liqweed/motion-kit/issues/45

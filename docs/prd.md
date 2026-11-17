---
title: motion-kit — product requirements
status: draft
last_updated: 2026-11-17
---

# motion-kit — product requirements

The normative contract lives in [`spec/technique.md`](spec/technique.md). This
document says what the product is for and how to tell whether it is working.
Anything not derivable from the repository is marked as an open question (§10).

## 1. Problem

Explanatory diagrams (a process, an integration map, a build-up) have to show
up in many places at once: a website, a Craft Page, a Slidev deck, a
PowerPoint/Keynote/Google Slides deck, a README, a social video. Hand-made
animations are authored per medium, drift apart, cannot be re-rendered after a
copy change, and are hard to review: a slide shows a half-drawn frame, a
Dutch label spills out of its box, a GIF and the live page disagree.

motion-kit removes the per-medium authoring: a scene is a **pure function of
time**, `frame(t) → SVG`, so one source renders every output and the same `t`
always gives the same bytes (`README.md:5-12`, `runtime/scene.mjs:1-18`).

## 2. Users

| User | What they do | Notes |
|---|---|---|
| **Authors** (the maintainer and anyone adopting the open-source release) | Brief diagrams, approve the story and the look, ship them in their own projects (decks, websites, Craft Pages, READMEs, social video) | MIT-licensed (`LICENSE`); the maintainer, Ophir, is the first user |
| **Coding agents acting for an author** (Claude Code, Craft Agent, Codex) | Write specs or custom scenes, run the gate, render deliverables, vendor the runtime into consumer repos, maintain motion-kit itself | Reached through the plugin skills `animated-diagram` and `motion-render` (`skills/*/SKILL.md`) and `AGENTS.md` |
| **Viewers** (indirect) | Watch, step through, or read the diagram | Includes keyboard, screen-reader, reduced-motion and phone users |

Agents are first-class users: CLI output, error messages and the gate are
designed to be read by an agent that then fixes the scene (layout errors name
the cause and the remedy, e.g. `runtime/types/hub-spoke.mjs:119`).

## 3. Jobs to be done

1. *When I need to explain a flow or architecture*, turn a short brief into an
   animated diagram whose story I approve before anyone polishes it
   (`skills/animated-diagram/SKILL.md:21-45`).
2. *When the diagram must appear in several media*, render all of them from one
   spec without re-authoring, and have them agree frame for frame.
3. *When copy, language or format changes*, edit data and re-render; never
   re-animate by hand.
4. *When presenting*, advance one settled build step per click or slide.
5. *When the destination runs no JavaScript* (README, chat preview, email),
   still deliver motion — or a correct still.
6. *When an agent produces a diagram*, get a mechanical pass/fail on the
   things a machine can check, and a review sheet for the things only a human
   can judge.
7. *When a project needs a mark*, produce a logo/avatar the same way (see §5,
   project logo).

## 4. Goals and non-goals

### Goals

- **One source, many outputs**: live player, Slidev, step frames (SVG/PNG),
  zero-JS baked SVG, self-contained HTML, MP4/WebM/GIF.
- **Determinism**: same inputs ⇒ byte-identical frames and reproducible
  manifests.
- **Data over code**: common diagram shapes are spec-driven scene types
  (`sequence`, `hub-spoke`, `timeline`, `stack`); custom modules are the
  escape hatch.
- **Fail loudly, never ship broken pictures**: layouts that don't fit, unknown
  tokens/types/formats and gate violations throw.
- **Accessible by default**: pause control, reduced motion, screen-reader step
  list, WCAG contrast for styles.
- **Portable runtime**: dependency-free ESM that runs unbuilt in browsers and
  Node and can be copied into any repo.

### Non-goals

- A general animation or video-editing tool (footage, audio, voice-over,
  multi-scene edits): hand off to HyperFrames/Remotion
  (`skills/motion-render/references/video.md:43-61`).
- Automatic layout of large graphs inside motion-kit (ELK/dagre run outside,
  coordinates go in the spec — `skills/animated-diagram/references/scene-types.md:56-59`).
- Bouncy/elastic/ambient/decorative motion, loops, parallax
  (`skills/animated-diagram/references/motion-vocabulary.md:59-62`).
- Shipping brand styles or icon sets: motion-kit ships only `neutral`; brands
  live in consumer repos (`README.md:70`, `runtime/parts.mjs:14-18`).
- Font embedding in SVG (`skills/animated-diagram/references/styles.md:51-55`).

## 5. Output targets and their requirements

| Target | Command / entry | JS at view time | Requirements |
|---|---|---|---|
| Live player (website, Astro island) | `runtime/player.mjs`, `adapters/astro` | yes | Final frame server-rendered as fallback; plays once at ~40 % visibility then holds; pause/play, step buttons, optional scrubber, caption; keyboard; reduced motion ⇒ final frame, no autoplay; light/dark follows the OS; capture hook for renderers |
| Self-contained HTML (Craft Pages, file://) | `motion-kit build` | yes, inline only | One document, runtime inlined, **no network requests** (Craft `connect-src 'none'`), final frame pre-rendered |
| Slidev | `vendor --adapter slidev` | yes | One build step per click, self-registered clicks; print/export/overview/reduced motion show settled step frames |
| Slide frames (PowerPoint, Keynote, Marp, Google Slides) | `motion-kit export [--png]` | no | One standalone frame per step, tokens resolved, shared viewBox so slides register; optional opaque background, dark theme, contact sheet with QC frames, reproducible `manifest.json` |
| Baked SVG (README, Obsidian, chat preview, email-ish) | `motion-kit bake` | no | Zero JS; plays once, holds the final frame; reduced motion ⇒ final frame; size proportional to fps × duration |
| Video (social, demos, talks) | `motion-kit video` | n/a | MP4/WebM/GIF at 16:9, 4:3, 1:1, 9:16; opaque background; lead-in and final hold; probe summary and contact sheet for review; silent |
| Vendored copy (consumer repos) | `motion-kit vendor` | — | Copies `runtime/` + one adapter + the gate, writes `MOTION_KIT_VERSION`; consumer CI needs no access to this repo |
| Project logo / avatar | `brand/logo.scene.mjs`; `motion-kit icon` and the `project-logo` skill (in progress) | per output | A logo is an ordinary scene whose final frame is the static mark: it must pass the gate and render as static SVG/PNG and as a baked animated SVG. Command-line details are out of scope here |

## 6. Quality bar

**What the gate enforces** (`lib/check.mjs`, via `motion-kit check` and
`npm run gate`) — details and rationale in
[`spec/technique.md` §11](spec/technique.md#11-the-gate):

- Deterministic bytes at 121 sampled times; well-formed markup.
- No numbers with ≥ 5 decimals; no colour literals (named colours included); no `NaN`/`undefined`/`Infinity`.
- Settled step frames: at rest 1 ms before `at`, unchanged for 45 ms after it.
- Something animates; the final frame holds after `duration`.
- Duration ≤ 12 s (the docs say ≤ ~8–10 s; see Discrepancies in the spec).
- Every step label visible in the final frame, unless the scene opts out.
- Ids come from the instance prefix: two renders with different prefixes share none.
- No clock or randomness in `frame()` or the helpers it calls (rendered under stubbed clocks).
- Style contrast (WCAG 4.5:1 text, 3:1 shapes, both themes) for the style in use.
- Layout/label fit per format × locale, through scene construction.

**What a human approves**: the story (storyboard contact sheet), the look
(before/after frames, phone size, dark mode, real-time playback), the copy and
claims. Green checks are not approval
(`skills/animated-diagram/references/qc.md:1-4`).

**Repo bar**: `npm run gate` (unit tests + scene gate over `examples/` and
`brand/`, every format × locale) passes before every push (`AGENTS.md:18`).

## 7. Constraints

| Constraint | Source |
|---|---|
| **No build step**: plain `.mjs`, no transpiler or bundler; JSDoc for types | `AGENTS.md:25,57-58` |
| **Runtime runs in browser and Node**: `runtime/` has no `node:` imports, no DOM at import time, no dependencies | `AGENTS.md:31` |
| **Vendoring**: consumers copy `runtime/` verbatim and must not edit it; changes go upstream and are re-vendored | `README.md:84-92` |
| **Inline-able runtime**: modules must use the single-line relative import subset the HTML inliner supports | `lib/bundle.mjs:8-11` |
| **Public, MIT-licensed** (`liqweed/motion-kit`); vendored files keep their SPDX header | `LICENSE`, `package.json` |
| **Node ≥ 22** | `package.json:8-10` |
| **Optional native/external tools**: `@resvg/resvg-js` (or Chrome) for PNG/video, `ffmpeg` for video; Node-side code must degrade with a clear message when absent | `package.json:20-22`, `AGENTS.md:32`, `lib/raster.mjs:51`, `lib/video.mjs:31` |
| **Skills move with the code**: a CLI flag or behaviour change updates the matching skill files in the same commit | `AGENTS.md:34` |
| **Generated media are never hand-edited** (`npm run media`) | `AGENTS.md:36` |

## 8. Success measures

Measurable from the repo today:

- `npm run gate` green on `main`; every example × format × locale passes
  (2 specs × 6 formats × 2 locales asserted in `test/cli.test.mjs:16-19`).
- Re-rendering unchanged inputs produces no diff: `npm run media` leaves
  `docs/media/` and `brand/` byte-identical; two exports yield equal manifests
  (`test/cli.test.mjs:20-30`).
- Browser bundle and Node render identical bytes (`test/runtime.test.mjs:150+`).
- Zero network requests in `build` output; zero `<script>` in baked SVG
  (`test/cli.test.mjs:31-42`).

Proposed (not yet tracked — see open questions):

- Time from brief to approved storyboard, and number of review rounds.
- Count of consumer repos on a current vendored version.
- Share of delivered diagrams that needed a custom module vs. a scene type
  (signal for promoting a new type, per `scene-types.md:43-44`).

## 9. Assumptions

- The skills find the CLI through `MOTION_KIT_HOME`, then the npm package via
  `npx`, then the plugin copy, which has no `node_modules` and so renders no
  PNG or video (README, "Install the skills").
- Early consumers are the maintainer's own repos (decks, websites); Craft is
  a primary destination (`skills/animated-diagram/references/targets.md`).

## 10. Open questions

1. **Duration budget.** Gate fails at > 12 s; README/AGENTS say ≤ ~8–10 s;
   the skill says ≤ ~8 s. Which number is the requirement?
2. **Gate coverage of `bake` and `video`.** `build` and `export` refuse a
   failing scene; `bake` and `video` don't. Intentional?
3. **Locales for custom modules.** `check` tests `.mjs` scenes only in `en`.
   Should modules declare their locales?
4. **Missing translations.** `localize()` silently falls back to another
   language. Should a missing locale fail the gate?
5. **Style `radius` / `stroke`.** Accepted and documented, unused by the scene
   types. Wire them up or drop them?
6. **Vendored gate parity.** The vendored `check.mjs` now runs the same code
   as `motion-kit check` (`lib/gate.mjs`): modules, `--locale`, `--style` with
   the contrast check, `--options` (#35). Is parity the rule from now on?
7. **Versioning and re-vendoring.** How do consumers learn a new version
   exists? The compatibility promise is drafted in
   [`stability.md`](stability.md) (#7).
8. **Capture hook id.** Should the hook key be stable and documented? It is
   format-suffixed (`options.id ?? scene.id`); the Astro adapter uses its `id`
   prop or a per-page `mk-<scene.id>-<n>`, and page scripts reach its players
   through the root element's `controller` (#41).
9. **Logo capability scope.** Which outputs (favicon sizes, social avatars,
   monochrome) must `motion-kit icon` guarantee, and does the logo get its own
   gate rules?
10. **Success measures.** Which of §8's proposed measures are worth tracking,
    and where?
11. **Public release (decided: MIT, open source).** Settled: the package is
    `@liqweed/motion-kit` on npm, the skills no longer assume a clone path,
    and motion-kit.dev is live. The website epic is tracked in
    [`roadmap.md`](roadmap.md) (#2).

---
title: motion-kit — roadmap
status: draft
last_updated: 2026-11-15
---

# motion-kit — roadmap

What comes after the open-source release (0.2.0, MIT). The tracker is the
source of truth for status: each line links its GitHub issue, and this page
only says why the items exist and in what order they should land. Product
intent is in [`prd.md`](prd.md); the contract is in
[`spec/technique.md`](spec/technique.md).

## Now: release hygiene

Outside users and contributors arrive with the public release. These make
the repository safe to contribute to and easy to install.

| Issue | What | Priority |
|---|---|---|
| [#4](https://github.com/liqweed/motion-kit/issues/4) | Run the gate in CI on every pull request | high |
| [#5](https://github.com/liqweed/motion-kit/issues/5) | Choose the npm package name and publish (`motion-kit` is taken) | high |
| [#6](https://github.com/liqweed/motion-kit/issues/6) | Skills find motion-kit without the maintainer's clone path (after #5) | high |
| [#7](https://github.com/liqweed/motion-kit/issues/7) | CONTRIBUTING, CHANGELOG, stability promise for runtime exports | high |

## Next: the website and what it needs

[#2](https://github.com/liqweed/motion-kit/issues/2) (epic) is the public
site at motion-kit.dev: the "one scene, every medium" idea on the first
screen, at least 12 live examples, and scroll and interaction patterns
visitors can reuse. Its design runs through Claude Design
([#14](https://github.com/liqweed/motion-kit/issues/14)); the design's
"needs" list may add items below.

| Issue | What | Priority |
|---|---|---|
| [#14](https://github.com/liqweed/motion-kit/issues/14) | Claude Design round; land the design bundle (landed in `site/`: live scenes only, unbuilt types are "needs" cards) | high |
| [#8](https://github.com/liqweed/motion-kit/issues/8) | Player call that animates to a step instead of jumping | high |
| [#9](https://github.com/liqweed/motion-kit/issues/9) | Scroll-step and hover-link helpers (after #8) | medium |
| [#10](https://github.com/liqweed/motion-kit/issues/10) | `<motion-diagram>` custom element adapter | medium |
| [#15](https://github.com/liqweed/motion-kit/issues/15) | Spec playground on the site | low |

Scroll effects stay inside the motion vocabulary: scroll advances settled
steps; no parallax and no continuous scroll-scrubbing of diagrams
([`interactivity.md`](../skills/animated-diagram/references/interactivity.md)).

## Then: range and reach

[#3](https://github.com/liqweed/motion-kit/issues/3) (epic) promotes four
storyboards from [`scene-types.md`](../skills/animated-diagram/references/scene-types.md)
to spec-driven types, which the gallery and the agent skills both need.

| Issue | What | Priority |
|---|---|---|
| [#16](https://github.com/liqweed/motion-kit/issues/16) | `timeline` scene type | medium |
| [#17](https://github.com/liqweed/motion-kit/issues/17) | `stack` scene type | medium |
| [#18](https://github.com/liqweed/motion-kit/issues/18) | `state-machine` scene type | medium |
| [#19](https://github.com/liqweed/motion-kit/issues/19) | `request-journey` scene type | medium |
| [#11](https://github.com/liqweed/motion-kit/issues/11) | Import Mermaid flowcharts as specs (ELK/dagre layout at build time) | medium |

## Trust: make the gate's promise exact

| Issue | What | Priority |
|---|---|---|
| [#12](https://github.com/liqweed/motion-kit/issues/12) | Settle the gate's open questions ([PRD §10](prd.md#10-open-questions) 1–6) | medium |
| [#13](https://github.com/liqweed/motion-kit/issues/13) | PNG snapshot tests for step frames (after #4) | medium |

## Not planned

The PRD's non-goals still hold: no general video editing (hand off to
HyperFrames or Remotion), no automatic layout of large graphs inside the
runtime, no bouncy, ambient or looping motion, no brand styles shipped in
the repository, no font embedding in SVG.

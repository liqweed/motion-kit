# AGENTS.md

Instructions for coding agents (Claude Code, Codex, others) working in this
repository. `CLAUDE.md` imports this file; edit here, not there.

## What this is

motion-kit renders deterministic animated diagrams. A scene is a pure
function of time, `frame(t) → SVG markup`, and one scene feeds a live player,
Slidev, step frames (SVG/PNG), a zero-JS baked SVG and video. The repo is
also a Claude Code plugin: `skills/` holds the `animated-diagram`,
`motion-render` and `project-logo` skills that other repositories use.

Product intent: `docs/prd.md`. The normative contract (scene, time model,
targets, gate): `docs/spec/technique.md`; update it when you change one of
those, and fix its *Discrepancies* list rather than adding to it.

## Commands

```bash
npm install            # optional dep @resvg/resvg-js (PNG + video); ffmpeg for video
npm run gate           # typecheck + versions + tests + scene gate + media freshness
npm run typecheck      # tsc --checkJs over JSDoc types (strict, noImplicitAny off); no emit
npm test               # node:test, test/*.test.mjs
npm run check          # the scene gate over examples/ and brand/, every format × locale
npm run site:dev       # Astro dev server for the website (npm run site builds; site:deploy ships to Cloudflare)
npm run media          # regenerate docs/media/*.svg, assets/icon*, .idea/icon*; commit the result
node cli/motion-kit.mjs --help
```

Node ≥ 22 for users; develop on Node 26, the current LTS (`.nvmrc`), and keep
the code to what Node 22 supports (`@types/node` stays on 22). No build step, no transpiler, no bundler: TypeScript is only a
checker over JSDoc. Git hooks (lefthook, installed by `npm install`):
pre-commit runs typecheck / scene gate / media freshness / version sync on
matching staged files, commit-msg enforces Conventional Commits, pre-push
runs `npm run gate`. Don't bypass them with `--no-verify`; fix the cause.

## Layout and boundaries

| Path | Runs in | Rule |
|------|---------|------|
| `runtime/` | browser **and** Node | Dependency-free ES modules. No `node:` imports, no DOM at import time (`player.mjs` touches the DOM only when mounted). Consumers vendor these files verbatim, so they must work unbuilt. |
| `lib/`, `cli/` | Node only | May use `node:*` and optional deps; must degrade with a clear message when `@resvg/resvg-js` or `ffmpeg` is missing. |
| `adapters/` | consumer repos | Copied by `motion-kit vendor`. Keep them thin wrappers over `runtime/`. |
| `skills/` | agents in other repos | Plugin skills. A CLI flag or behaviour change must update the matching `SKILL.md`/`references/*.md` in the same commit. |
| `website/` | browser + Node (build) | The motion-kit.dev site: Astro (static output) + Vite, deployed to Cloudflare as static assets with the `cf` CLI (`website/cloudflare.config.ts`; `npm run site:deploy`, which needs `cf auth login` or `CLOUDFLARE_API_TOKEN`; no Wrangler; `.github/workflows/deploy-site.yml` deploys on merge to main). An npm workspace, so the root `npm install` covers it. Pages are `.astro` and prerendered; interactivity is plain ES modules in `src/scripts/` importing `runtime/`, `examples/` and `brand/` from the repo root (Vite globs, no copies). `src/scripts/catalog.mjs` is DOM-free data checked by `test/site.test.mjs`. Show only built scenes live; unbuilt scene types stay "needs" cards. |
| `examples/`, `brand/` | gate + docs | Every scene here must pass `npm run check`. `brand/logo.scene.mjs` is the logo source and the project-logo skill's template; it takes the runtime from `kit` instead of importing it. |
| `docs/media/`, `assets/icon*`, `.idea/icon*.svg` | generated | Never hand-edit; run `npm run media`. `assets/icon.png` is what Conductor shows; `.idea/icon*.svg` is the JetBrains project icon. |

## Scene rules (the gate enforces them)

`lib/check.mjs` fails a scene that breaks any of these:

- `frame(t)` reads only `t` and constants: no `Date`, `Math.random`,
  `performance.now`, or state carried between frames.
- Same `t` ⇒ byte-identical output. Round every number through `num()`.
- Colours come from tokens (`tok("accent")`), never literals.
- Nothing moves at a step's `at`: step frames are settled.
- After `duration` the frame holds; total ≤ ~8–10 s.
- Labels are escaped (`text()`/`esc()`) and fit their wrap budget in every
  locale and format.

Design and motion guidance lives in `skills/animated-diagram/references/`
(`technique.md`, `motion-vocabulary.md`, `qc.md`). Read the relevant one
before adding a scene type or changing motion helpers.

## Conventions

- Plain ESM `.mjs`, tabs, double quotes. Add JSDoc types (`@param`,
  `@returns`, `@typedef`) on new exported functions; `npm run typecheck`
  must stay clean. Prefer narrowing (`e instanceof Error`) over casts.
- Tests use `node:test` + `node:assert/strict`; put them in `test/`. A new
  helper in `runtime/` gets a unit test; a new scene type gets a gate run
  across formats and locales.
- Determinism is a feature: when you change rendering, rerun
  `npm run media` and commit the diff so reviewers see the visual change.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`), scope
  optional (`feat(slidev): …`).
- Bump `version` in `package.json` and both `.claude-plugin/*.json`
  together (`npm run versions` checks).

## Verifying visual changes

The gate checks structure, not looks. After touching layout or motion:

```bash
node cli/motion-kit.mjs export examples/smart-home.json -o out/review --png --qc
```

and look at the PNGs and the QC contact sheet (`out/` is git-ignored).
Agents that can read images should open them before claiming a visual
change is done.

## Shared skills (Jig)

`/jig:*` skills (do-item, drive-pr, review, resolve-review-comments, …) come
from the `jig` plugin, installed once per machine
(https://github.com/jig-harness/jig). This repository's values are in
`.config/jig.yaml`; its gate is `npm run gate`. The tracker is GitHub Issues
on `liqweed/motion-kit`: type in GitHub's issue types (Bug, Feature, Task),
priority and size as labels, areas as `area:*` labels, all listed in
`.config/label-taxonomy.yaml`. File issues with `/jig:file-issue`. `.claude/settings.json`
offers the plugin to Claude Code users who trust this folder. If the skills
are not listed, install the plugin and start a new session.

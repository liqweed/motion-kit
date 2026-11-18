# Contributing to motion-kit

Thank you for helping. This page covers setup, the checks every change must
pass, and how a change reaches a release. `AGENTS.md` holds the same rules in
the form coding agents read, and `docs/spec/technique.md` is the normative
contract for scenes, render targets and the gate.

## Setup

- Node ≥ 22 for users; develop on the version in `.nvmrc` (26) and keep the
  code to what Node 22 supports (`@types/node` stays on 22).
- `npm install` installs the dev tools, the website workspace and the git
  hooks (lefthook). The optional dependency `@resvg/resvg-js` renders PNGs;
  `ffmpeg` on your `PATH` renders video. Tests that need either skip without it.
- There is no build step: the runtime is plain ES modules, and TypeScript only
  checks the JSDoc types.

## The gate

```bash
npm run gate   # typecheck, version sync, tests, scene gate, media freshness, website build
```

A pull request merges only when `npm run gate` passes; CI runs it on every pull
request and on `main`. The hooks run parts of it for you:

- pre-commit: typecheck, the scene gate, media freshness and version sync, for
  the files you staged;
- commit-msg: Conventional Commits;
- pre-push: the whole gate.

Don't skip them with `--no-verify`; fix the cause.

The gate checks structure, not looks. After changing layout or motion, export
the frames and look at them:

```bash
node cli/motion-kit.mjs export examples/smart-home.json -o out/review --png --qc
```

Then run `npm run media` and commit the regenerated `docs/media/`, `assets/icon*`
and `.idea/icon*.svg`, so reviewers see the visual change. Never edit those
files by hand.

## Where code goes

| Path | Rule |
|---|---|
| `runtime/` | Runs in browsers and Node, unbuilt: no `node:` imports, no DOM at import time. Consumers copy these files verbatim. |
| `lib/`, `cli/` | Node only. Optional dependencies degrade with a clear message. |
| `adapters/` | Thin wrappers over `runtime/`, copied into consumer repositories by `motion-kit vendor`. |
| `skills/` | The Claude Code plugin's skills. A CLI flag or behaviour change updates the matching `SKILL.md` or reference in the same commit. |
| `examples/`, `brand/` | Every scene here passes `npm run check`. |
| `website/` | motion-kit.dev (Astro). |

## Conventions

- Plain ESM `.mjs`, tabs, double quotes. New exported functions get JSDoc types
  (`@param`, `@returns`, `@typedef`); `npm run typecheck` stays clean.
- Tests use `node:test` and `node:assert/strict` and live in `test/`. A new
  runtime helper gets a unit test; a new scene type gets a gate run across
  formats and locales.
- Scenes are pure functions of time: no clock, no randomness, no state between
  frames, colours from tokens, numbers through `num()`, settled step frames,
  ids from the instance prefix. The gate enforces these
  (`docs/spec/technique.md` §11).

## Commits, change notes and releases

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`, `test:`, `build:`,
  `ci:`, `style:` or `revert:`, with an optional scope (`feat(slidev): …`).
- A pull request that changes what ships (`cli/`, `lib/`, `runtime/`,
  `adapters/`, `styles/`, `skills/`, `examples/`, `brand/`, `.claude-plugin/`)
  adds a change note: `changes/<branch-name>.md`, with `release: patch`,
  `minor` or `major` in its front matter and [Keep a Changelog](https://keepachangelog.com/)
  sections (`### Added`, `### Changed`, `### Fixed`, `### Removed`) written for
  someone who uses motion-kit. See `changes/README.md`.
- Don't edit `CHANGELOG.md` or the version by hand. Merging a pull request whose
  change note has a `release` level releases it, with no second merge: CI writes
  the waiting notes into the changelog and moves the version in one commit on
  `main`, tags `vX.Y.Z` once that commit passes the gate, and the tag publishes
  `@liqweed/motion-kit` to npm and creates the GitHub release. So the `release:`
  line is the decision to publish. A note without a `release` level adds no
  commit and waits for the next release. There is no release pull request.
- If a release does not go out, find where it stopped:
  - No `chore(release): X.Y.Z` commit on `main`: open the `changelog` workflow
    run for the merge. If its `push` job was refused by `main`'s rules, nothing
    was released and the notes are still waiting. The rules must let the release
    App push, so no required pull request, status check or signed commit unless
    the App is a bypass actor. Fix the rule, then run the workflow again from the
    Actions tab.
  - The commit is there but there is no tag: its `gate` check failed or is still
    running. The `tag-plan` job of the `changelog` workflow names it. If the check
    is still running, the tag follows once it passes. If the check failed and a
    later release commit was tagged first, the tag does not follow automatically,
    since only versions newer than the newest release tag are tagged: tag the
    commit by hand.
  - The tag is there but the version is not on npm: the Release run failed, see
    the next point.
- Publishing uses npm trusted publishing, with no token. The header of
  `.github/workflows/release.yml` lists the Trusted Publisher values the package
  needs on npmjs.com. If a Release run fails at `npm publish` with an OIDC 403,
  check those, then re-run the failed runs from the Actions tab, oldest tag
  first.
- A change to the public API (`docs/stability.md`) also updates that page and
  the spec, and its change note says what users must change.

## Adding a scene type

1. Write `runtime/types/<name>.mjs` exporting `(spec, { format, locale }) → scene`.
   Lay out per format; throw when labels do not fit or shapes would overlap.
   Pass each spec item's `id` to its step (`withId`).
2. Register it in `runtime/types/index.mjs`.
3. Add an example spec in `examples/` and to the `check` script in
   `package.json`, so the gate runs it in every format and locale.
4. Add tests to `test/runtime.test.mjs`.
5. Document the spec in `skills/animated-diagram/references/scene-types.md`
   and in `docs/spec/technique.md` §9; add it to the website catalog if the site
   shows it.

## Pull requests

- One topic per pull request. Link the issue it settles (`Closes #12`), or
  `Refs #12` when it does part of it.
- Describe what changed for users and how you verified it, including what you
  checked by eye.
- Report bugs and propose features in [GitHub Issues](https://github.com/liqweed/motion-kit/issues).

By contributing, you agree that your contribution is licensed under the
project's [MIT licence](LICENSE).

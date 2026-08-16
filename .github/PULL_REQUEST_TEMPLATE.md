# What this changes

<!-- One or two sentences. What is different after this merges, and why. -->

Fixes #

## How to see it work

<!-- The steps a reviewer follows. A screen name and a click path, or a curl command. -->

## What I verified

<!--
Be specific and be honest. "Tested on macOS arm64, did not try Windows" is a useful sentence.
A claim you did not test is worse than a gap you admitted.
-->

- [ ] `uv run --project sidecar pytest sidecar/tests/ -q`
- [ ] `uv run --project sidecar ruff check sidecar/bandready sidecar/tests`
- [ ] `cd app && pnpm exec tsc --noEmit -p tsconfig.json`
- [ ] `cd app && pnpm test`
- [ ] `cd app && pnpm build`
- [ ] Playwright (`node scripts/dev.mjs --browser`, then `cd app && pnpm test:e2e`)
- [ ] `uv run --project sidecar python -m tools.content.validate content/core-en` (if content changed)

Ran on: <!-- e.g. macOS 15, Apple Silicon -->
Did not check: <!-- e.g. Windows, Linux, the packaged app -->

## House rules

- [ ] I did not edit `sidecar/bandready/server/app.py` to register a route. A new route is a new
      module under `server/routes/` exposing `router`.
- [ ] I did not edit `app/src/App.tsx` or `Sidebar.tsx` to register a screen. A new screen is a
      new `features/<name>/route.tsx` that default-exports `defineFeatureRoute`.
- [ ] I did not hand-edit `content/core-en/data/*.jsonl`. Content changes went through
      `tools/content/merge_*.py`, then `build.py`, then `validate.py`.
- [ ] No `.dev-data/`, `.env`, model weights, recordings or API keys are in this diff.
- [ ] New screens handle loading, empty, error and success, and work in both themes.
- [ ] I updated the docs this touches (`18-api-contract.md`, `IMPLEMENTATION-STATUS.md`,
      `CHANGELOG.md` under Unreleased).

## Anything else

<!-- Trade-offs you made, things you are unsure about, or what you would like the reviewer to
     look at hardest. Saying "I am not sure about the approach in X" is welcome. -->

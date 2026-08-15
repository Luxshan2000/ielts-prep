# Repository layout, and what is tracked

Measured on **2026-08-15** against the working tree. This document answers three questions a
new contributor asks in their first hour: where does a given kind of file live, what is
generated versus authored, and why is 4 GB of this checkout not in git.

For the *code* map — which module owns which concern, and the two auto-discovery seams — read
[`CONTRIBUTING.md` §2](../CONTRIBUTING.md#2-repository-map). This document covers the tree
around the code.

---

## 1. Top level

| Path | What it is | Tracked |
|---|---|---|
| `app/` | Electron shell + React renderer. pnpm workspace `bandready-app`. | yes |
| `sidecar/` | Python 3.11 FastAPI sidecar. The whole backend. | yes |
| `content/core-en/` | The shipped content pack: `manifest.json`, `data/*.jsonl`, `media/`. | yes |
| `content/core-en/staging*/` | Authoring trees. Merged into `data/` by `tools/content/merge_*.py`. | **mixed — see §3** |
| `tools/content/` | The pack pipeline CLIs. Run from the repository root. | yes |
| `scripts/` | Three Node scripts: dev orchestrator, Electron bundler, sidecar stager. | yes |
| `e2e/` | Playwright specs. Drive the app in browser mode against a real sidecar. | yes |
| `docs/` | This directory. See §5 for which parts to trust. | yes |
| `.github/workflows/` | `ci.yml` (per-half tests), `e2e.yml`, `release.yml` (unsigned pre-release). | yes |
| `build/` | Packaging staging output from `scripts/stage-sidecar.mjs`. | no |
| `dist-electron/` | Installers from electron-builder. Note: *not* `app/dist-electron/`. | no |
| `.dev-data/` | The dev-mode data directory — database, models, audio, recordings. | no |

Two directory names collide and the collision is load-bearing:

- **`build/`** at the repository root is packaging output (ignored). **`app/build/`** is
  electron-builder's `buildResources` directory (tracked) and holds `entitlements.mac.plist`
  and, when someone adds it, the app icon. This is why `.gitignore` anchors the rule as
  `/build/`. Unanchoring it makes `app/build/icon.icns` silently unstageable — you `git add`
  the icon, see nothing happen, and ship an icon-less DMG.
- **`dist-electron/`** at the repository root holds installers. **`app/dist-electron/`** holds
  the compiled main and preload bundles. `app/electron-builder.yml:16` calls this out.

## 2. What is on disk but not in git

About 4.3 GB, all of it regenerable:

```
1.0G  .dev-data/        828M  sidecar/.venv/     785M  node_modules/
595M  dist-electron/    169M  build/              11M  app/dist/
```

`.dev-data/` is the one to understand. `scripts/dev.mjs` points `BANDREADY_DATA_DIR` at it, so
it holds the learner's entire runtime: downloaded model weights (hundreds of MB, and never ours
to redistribute — that is the whole reason `stage-sidecar.mjs` does not bundle them),
synthesised listening audio, the SQLite database, the sidecar's auth secret, and recordings of
the user's own voice. One Kokoro weight file is 461 MB, over GitHub's hard per-file limit, so a
push carrying `.dev-data/` is rejected outright rather than merely regretted.

Deleting `.dev-data/` resets dev-mode state completely.
[`DEVELOPMENT.md` §5](DEVELOPMENT.md) has the safe reset procedure.

### A live secret sits in the working tree

`/.env` holds a real `OPENROUTER_API_KEY` — the credential behind the writing and speaking
verification runs. It is correctly gitignored and has never been committed. It is still one
`git add -f`, one `zip -r`, or one screen-share away from a leak. No repository change is
needed; know that it is there.

## 3. Content staging is tracked inconsistently — an open decision

`.gitignore` points here. This is the decision it is waiting on.

Every content module is authored into a staging tree and merged into `content/core-en/data/*.jsonl`
by the matching `tools/content/merge_*.py`. The stated policy, repeated four times in `.gitignore`'s
own comments, is that **only the authoring contract is tracked** — `DESIGN.md`, `TEMPLATE.json`
and `research/` — because that is what a second author needs in order to write more. The bulk
merge input is not tracked, because its merged output already is.

The policy is applied to four of the seven trees:

| Module | Bulk directory | Tracked? | Tree size |
|---|---|---|---|
| speaking | `staging/sets/` | ignored | 6.0 MB |
| writing | `staging-writing/prompts/` | ignored | 3.2 MB |
| reading | `staging-reading/tests/` | ignored | 2.5 MB |
| listening | `staging-listening/tests/` | ignored | 2.2 MB |
| **grammar** | `staging-grammar/content/` | **tracked** | **7.2 MB** |
| **theory** | `staging-theory/content/` | **tracked** | **2.6 MB** |
| **oxford** | `staging-oxford/content/`, `worklists/` | **tracked** | **3.8 MB** |

So roughly 13 MB of intermediate JSON is committed, and its merged output is committed again
(`data/grammar.jsonl` 3.0 MB, `data/vocab.jsonl` 2.2 MB, `data/theory.jsonl` 1.0 MB).
`staging-grammar/content/vocabulary-expansion.json` alone is 2.4 MB.

Two further wrinkles make this more than a size argument:

- `staging-theory/` names its contract files `DESIGN-THEORY.md` and `TEMPLATE-THEORY.json`,
  not `DESIGN.md` and `TEMPLATE.json`. Any ignore rule written by pattern rather than by hand
  will miss them and ignore the contract instead of the bulk.
- `staging-oxford/` has **no** `DESIGN.md` at all, so under the stated policy it currently
  contributes no authoring contract and 3.8 MB of bulk.

**This spreads rather than sits still.** `staging-oxford/` did not exist a fortnight ago. It
matches no `.gitignore` rule, so it defaulted to tracked — nobody chose that. Every new content
module inherits whichever behaviour nobody decided.

**It cannot stay both ways.** Pick one:

- *Uniformly ignored* (matches the written policy). Add the three bulk directories to
  `.gitignore` **and** untrack what is already committed, in the same commit — a half-applied
  rule is worse than either answer, because the files stay in the index and every future edit
  to them is invisible:
  ```bash
  git rm -r --cached content/core-en/staging-grammar/content \
                      content/core-en/staging-theory/content \
                      content/core-en/staging-oxford
  ```
  Cost: a content author cloning the repo can no longer re-run a merge without re-authoring.
- *Uniformly tracked*. Delete the four existing ignore rules and `git add` the four bulk
  directories. Cost: about 12 MB more in the repository, and every merge run produces a diff.

Whoever decides, record it in this section and make `.gitignore` say the same thing.

### Stale ignore rules

`coverage/` (no coverage reporter is configured in `vitest.config.ts`) and `release/`
(electron-builder outputs to `../dist-electron`, never `release/`) describe a toolchain this
repository does not have. Harmless, and they cost a reader a minute each.

## 4. `tools/content/` — the pack pipeline

Every module here is a CLI run from the repository root, never imported by the app or the
sidecar:

```bash
uv run --project sidecar python -m tools.content.<name> content/core-en
```

| Module | Job |
|---|---|
| `merge_speaking.py`, `merge_writing.py`, `merge_reading.py`, `merge_listening.py`, `merge_grammar.py`, `merge_theory.py` | Fold one staging tree into `data/*.jsonl`. All take `--check`. |
| `reseq_grammar.py` | Re-seat every grammar point into a contiguous `1..N`. Covered by `sidecar/tests/test_reseq_grammar.py`. |
| `verify_listening.py` | Cross-check listening scripts against their questions. |
| `validate.py` | Readable wrapper around the pack validator. `--no-checksums`, `--json`. |
| `build.py` | Recompute manifest counts and checksums in place. **Run last**, after any merge. |

The order matters: merge → `validate` → `build`. `build.py` is what makes the manifest
checksums match, and an import of a pack whose checksums do not match is refused.

### Removed: `_author_final_seven.py`

Deleted 2026-08-15. It was a 794-line one-shot generator for seven grammar points, with no
caller, no test, no workflow entry and no documentation — the only references to it anywhere
were inside itself. Its output, `staging-grammar/content/final-seven.json`, is committed and is
what `merge_grammar.py` actually reads, so the generator sat outside the pipeline entirely.

It was removed rather than kept as provenance because it overwrote that output file
unconditionally on run: any hand-edit made to those seven points since — a typo fix, a
rewritten `feed_forward` — would be destroyed by the next person who ran the file to find out
what it did. The reasoning it carried is preserved verbatim in
[`GRAMMAR-VOCAB.md` §6](GRAMMAR-VOCAB.md); git history holds the code.

## 5. The `docs/` tree, and how much to trust each part

Three tiers with three different levels of trust. Check which tier you are in before believing
a number.

**Current — measured against the shipped code and re-stated when it changes.**

| Doc | Covers |
|---|---|
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | The two auto-discovery seams, house style, real commands. The one document to point people at. |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Dev-mode architecture, where the app writes, how to get out of a bad state. |
| [`REPOSITORY.md`](REPOSITORY.md) | This file. |
| [`IMPLEMENTATION-STATUS.md`](IMPLEMENTATION-STATUS.md) | What is built and what is not, with the evidence. |
| [`READING-CONTENT.md`](READING-CONTENT.md), [`LISTENING-CONTENT.md`](LISTENING-CONTENT.md), [`SPEAKING-CONTENT.md`](SPEAKING-CONTENT.md), [`GRAMMAR-VOCAB.md`](GRAMMAR-VOCAB.md), [`THEORY-CONTENT.md`](THEORY-CONTENT.md) | One per content bank: what ships, the schema, how to author more. |
| [`research/pronunciation/`](research/pronunciation/) | The evidence behind the accent rule. Research, not status — ages gracefully. |

**Design intent — `docs/plan/00` through `18`.** Twenty-two files, ~11,000 lines, all written
before implementation started. Every one now carries a banner saying so. They are not stale in
the sense of being wrong to keep: `09 §0` (the accent rule) and the `R2-*` rulings in
`_context/decisions.md` are load-bearing and cited from code comments. They *are* wrong to read
as a description of what exists. Where the plan and the code disagree, the code is right and the
plan is a record of what was intended.

`18-api-contract.md` is the sharpest instance: it calls itself the single authoritative route
inventory and predates the grammar, theory, coach, drills and mock route families.
`sidecar/bandready/server/routes/` now holds 33 modules. Read the routes.

**Missing.** `docs/WRITING-CONTENT.md` does not exist, though writing has a staging tree with a
`DESIGN.md`, four research files, 102 prompt rows and chart specs. Listening, reading, speaking,
grammar and theory each have a content-bank document; writing is the only bank an author has to
reverse-engineer.

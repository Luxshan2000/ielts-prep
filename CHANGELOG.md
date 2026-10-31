# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches 1.0.

**No version has been released.** There is no git tag and no published installer. Everything
below describes work on `main`, grouped by the date it landed rather than by a release. The
dates come from the commit history, not from a release plan.

Until 1.0 there is no compatibility promise: the on-disk SQLite schema, the content pack format
and the HTTP API can all change without a migration path.

## [Unreleased]

### Added

- MIT `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), this changelog,
  GitHub issue templates and a pull request template.
- Speaking practice inside the Grammar and Vocabulary modules, reusing the promoted recorder
  component.
- A dedicated pronunciation screen, and vocabulary sentences chosen to be worth saying out loud.
- A preferences screen, and a spoken placement test.
- The Oxford 3000 and the Oxford Phrase List, taking the vocabulary bank from 1,246 to 4,995
  entries.
- All twelve tenses across both the grammar syllabus and the theory reference.
- A shared attempt-history contract used by every skill, plus a written authoring contract for
  practice content.
- Windows support in the packaging path: an MSI target alongside NSIS, and a cross-platform
  release workflow that builds unsigned pre-release installers on Windows and macOS runners.

### Changed

- Relicensed from Apache-2.0 to MIT. Both `package.json` files, `sidecar/pyproject.toml`, the
  electron-builder copyright string and every document that stated a licence now agree.
- Provider choice narrowed to OpenRouter or a local Ollama, with `Custom OpenAI-compatible` as
  the point-at-anything option. The branded alternatives bought a longer list and one more
  decision for someone who came here to practise English.
- Model fields are closed dropdowns wherever the endpoint can be asked what it serves, so a
  learner cannot pick a model that will 404 three screens later.
- OpenRouter now covers speech-to-text and text-to-speech as well as chat, from the same key.
- The question number comes first everywhere in the question palettes and review screens.
- Grammar teaching order is computed from the content rather than requested from authors.
- `sidecar/.python-version` pins 3.11, so `uv sync` no longer builds the sidecar on whatever
  newer Python the machine has. The sidecar's pytest config dumps every thread's stack for a
  test still running after 120 seconds, so a hang names itself in CI.
- `README.md` and `CONTRIBUTING.md` rewritten for a public launch, including the two
  auto-discovery seams and the content pipeline.

### Fixed

- Pronunciation no longer publishes an ASR confidence as if it were a pronunciation score. Two
  separate leaks of that number were closed, and the model decision behind it is recorded.
- The theory reference rendered `[object Object]` instead of article text.
- A check that failed silently now reports its failure.
- `.dev-data/` is gitignored, so the dev database, the auth secret and voice recordings can no
  longer be committed.
- The listening mock froze for about five seconds per part each time its audio finished
  rendering. A status read wrote a `media_files` row on a second SQLite connection while the
  request held the write lock, and waited out `busy_timeout` per part. This was also what hung
  the sidecar suite in CI past its 15-minute limit.
- Speaking offered its scored modes and the full mock on a fresh install with no model running.
  The sidecar's check only asked whether a model was named, and the shipped default names an
  Ollama model. Speaking now asks the same reachability probe Writing uses (`lib/markingStatus`).
- A listening mock that was still rendering came back after a reload as an open sitting whose
  "clock has been running", with no render progress. A render lost to an app restart is now
  queued again rather than leaving the paper stuck at `preparing`.
- Band estimates did not move after a scored attempt until the recompute button was pressed.
- Listening mocks never appeared in Progress → Mock history.
- 296 of the 496 speaking cue cards could not be reached: the cards route capped at 200.
- The Intel macOS DMG bundled an Apple Silicon Python and could not start its sidecar. The
  release workflow now builds arm64 only on its Apple Silicon runner.
- The onboarding wizard, the Listening page and Settings claimed Listening needs no setup, that
  downloads are checksum-verified, and that nothing ever leaves the machine. None was true.
- First-run copy: step 4 no longer tells someone who chose nothing that "the model you chose"
  is down, instructions name the "Check" button that exists rather than "Verify", the
  missing-voice-files error names the real Settings section instead of filenames and a path,
  and the global provider banner hides hosts, ports and exception text.
- Settings checks each provider job on opening instead of showing three unexplained warnings.
- Rename leftovers from `bandready` to `ielts-prep`: the README clone step, the Help menu's
  GitHub link (a 404), the updater's publish target and the sidecar's project URLs.
- Smaller: "Back in in 4 days" in grammar, "14 %" spacing, raw slugs as reading drill titles.
- The E2E suite had not run past onboarding since the wizard's steps were renamed; eight specs
  had drifted from the UI and are updated.

### Removed

- The root `lint` script. It delegated to an `app` script that does not exist, and there is no
  ESLint configuration anywhere in the repository. Python linting through `ruff check` is real
  and unaffected.

### Security

- A Fernet encryption key (`.dev-data/secret.key`) is present in git history from commit
  `5d9eaf5`, removed in `f4ce0a3`. No ciphertext was committed alongside it. See
  [SECURITY.md](SECURITY.md).

## 2026-08-01 to 2026-08-16

- **Grammar and Usage shipped as a module**, growing from the first two salvaged units to 87
  points, then 120, then all seventeen units at 147 points and 2,037 practice items, and finally
  a closed syllabus of 154 points with no dangling prerequisites.
- **Theory shipped**: a reference tab with 91 articles that are readable before any practice is
  attempted.
- **A Providers settings tab a learner can actually read.**
- **Build fixes for Windows**, none of which have been exercised on a Windows machine:
  `stage-sidecar.mjs` assumed a Unix Python layout, the packaged app failed with `spawn EINVAL`,
  and the staged venv symlinks were absolute rather than relative. The sidecar is now verified
  the same way the app starts it.
- UI fixes: the settings form appearing twice, the sidebar rail overflowing, the test navigator
  having two homes, and a duplicated QuickCheck panel.

## 2026-07-27 to 2026-07-31

Content and module work, one skill at a time.

- **Speaking**: 56 new topic sets, then 108 card sets with a band 5 to 9 ladder and a real mock
  exam. The drills UI was built for a backend that had been orphaned. A dead model now reports
  itself as a dead model instead of looking like a flaky connection.
- **Writing**: 102 prompts with a teaching payload and band ladders, a writing coach, and a
  60-minute mock.
- **Reading**: 12 tests including General Training, with worked solutions, a coach and a mock.
  Diagram-labelling questions became answerable.
- **Listening**: 43 scripts across UK, US and AU voices, with a coach, drills and a timed mock.
  Review no longer showed the whole form beside every answer.
- **Content install**: an app update now reaches an install that has already been used, instead
  of skipping the pack refresh.

## 2026-07-25 to 2026-07-26

The first working version.

- The Python FastAPI sidecar, the React foundation and the Electron shell.
- Reuse of model weights already on the machine: candidate artifacts are found in the usual
  caches and hard-linked rather than downloaded again.
- The complete app: the shipped `core-en` content pack, every UI feature, the E2E suite, and a
  hardening pass.
- A real installer, plus the two bugs that building one exposed.
- `${VAR}` provider key references reach the sidecar, and a `.env` file is loaded so one can
  resolve in a desktop launch.
- Live WebRTC voice and real-model scoring recorded as verified in
  [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md).
- The design document set, written before implementation began.

[Unreleased]: https://github.com/Luxshan2000/ielts-prep/commits/main

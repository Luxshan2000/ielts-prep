# 13 — Packaging & distribution

> **Design intent as of 2026-07-25 — not a description of what exists.** This is a planning document, written before implementation began. Much of it shipped differently. For what actually ships, read [`.github/workflows/release.yml`](../../.github/workflows/release.yml) and `app/electron-builder.yml`. Where this doc and the code disagree, the code is right.
>
> Kept because the reasoning behind each decision is not recorded anywhere else, and the `R2-*` rulings in [_context/decisions.md](_context/decisions.md) are cited from code comments.
>
> **This doc contradicts the shipped workflow.** It describes Developer-ID signing and notarization as part of the flow. `release.yml` explicitly disables notarization and marks every build a pre-release, because no Developer ID exists for this project. The workflow is right; this doc records what a real release would need.

_Status: draft v2 (2026-07-25)_

BandReady ships as a double-click installer per OS: macOS arm64 (primary), macOS x64 (best-effort), Windows x64 (primary), Linux AppImage/deb (bonus). The app is built with **electron-builder**; the Python sidecar (01-architecture.md, ADR-002) is bundled as a **python-build-standalone interpreter + a uv-built wheel-only venv** inside `resources/` — chosen over PyInstaller because our dependency set (onnxruntime, CTranslate2, av/ffmpeg, optional MLX/torch) is exactly the kind of native-lib zoo PyInstaller's import-graph freezing breaks on, and a plain venv stays pip-debuggable in the field. Model weights are never shipped in the bundle; a model-download step inside 10-curriculum-progress.md's onboarding wizard fetches them (resumable, sha256-verified) into the data dir. Updates go through electron-updater against GitHub Releases, full-app in v1. macOS builds are Developer-ID signed + notarized with a mic entitlement; Windows ships unsigned in v1 (SmartScreen warning acknowledged). No telemetry — local logs only.

## 1. Targets and deliverables

| Platform | Priority | Artifact(s) | Built on |
|---|---|---|---|
| macOS arm64 | **Primary** | `BandReady-<v>-arm64.dmg` + `.zip` (zip required by electron-updater on mac) | `macos-14` (arm64) runner |
| macOS x64 | Best-effort | `BandReady-<v>-x64.dmg` + `.zip` | `macos-13` (Intel) runner |
| Windows x64 | **Primary** | `BandReady-Setup-<v>.exe` (NSIS, per-user install) | `windows-latest` |
| Linux x64 | Bonus | `BandReady-<v>.AppImage`, `bandready_<v>_amd64.deb` | `ubuntu-22.04` (old glibc = wide compat) |

Non-goals for v1: Mac App Store / Microsoft Store (sandboxing fights the sidecar + localhost server model), winget/homebrew casks (nice follow-up once releases are stable — 16-roadmap.md), Windows arm64.

## 2. DECISION — Electron tooling: electron-builder (not Forge)

| | electron-builder | Electron Forge |
|---|---|---|
| Config | One declarative `electron-builder.yml` for all targets | Plugin/maker per target, JS config |
| Auto-update | First-class pair with **electron-updater** + GitHub Releases provider (mac zip + `latest-mac.yml`, NSIS + blockmap) | Squirrel-centric; GitHub-release update flow is DIY-ish |
| Big `extraResources` payloads (our ~600 MB venv) | Proven; `extraResources` copied outside asar, signed correctly on mac | Works, but less battle-tested with huge nested-binary trees |
| mac signing/notarization | Built-in deep-sign of nested Mach-Os + `notarytool` integration | Via `@electron/osx-sign` plugin, more assembly required |
| Official-ness | Community (de-facto standard: VS Code-alikes, Obsidian ecosystem) | Official Electron project |

**Decision: electron-builder.** The deciding factors are electron-updater (section 9) and mature deep-signing of a resources tree full of `.so`/`.dylib` files. Forge's advantages (official templates) don't help us — `electron-vite` already owns the dev/build story for main/preload (01-architecture.md §10).

## 3. DECISION — Python sidecar bundling

### 3.1 The two candidates, honestly

**(a) PyInstaller onedir build of the sidecar.**
- \+ Single self-contained artifact; smallest surface; familiar tooling; no interpreter-layout questions.
- − Freezing works by static import analysis, and our stack is its worst case: `onnxruntime` (provider shared libs discovered at runtime), `ctranslate2`, `av` (bundled ffmpeg dylibs), `aiortc` native crypto, Silero ONNX assets in package data, `mlx`/`mlx_whisper` (Metal shader libs), pipecat's dynamic service imports. Each needs hidden-import/`collect_all` hooks that silently rot on dependency upgrades — failures appear only at runtime on user machines.
- − Un-debuggable in the field: you cannot `pip list`, patch a file, or drop into the interpreter inside a frozen bundle.
- − Every dependency bump risks re-breaking the freeze; CI can't fully prove it (import-time vs call-time loading).

**(b) python-build-standalone interpreter + uv-built venv shipped in resources.**
- \+ **Robust**: packages sit on disk exactly as pip laid them out — no freezing, no hooks, native libs load the same way they did in dev. If it passed CI's real import-and-run test, it works.
- \+ **Debuggable**: a support instruction can be "run `<resources>/python/bin/python3.11 -m pip list`" or hot-patch one file.
- \+ python-build-standalone (now maintained by Astral) is explicitly built to be **relocatable**, and `uv` provisions it natively.
- − Bigger (interpreter ~70 MB + full site-packages; mitigations in section 6).
- − Thousands of files → slower mac codesign/notarize (~+3–6 min CI) and slower NSIS compression.

**Decision: (b) python-build-standalone + uv venv.** Reliability of the voice stack's native libs beats bundle size; size is mitigated separately (section 6). This resolves the open item left by 01-architecture.md §3.

### 3.2 Packaged layout (macOS shown; Windows/Linux analogous)

```
BandReady.app/Contents/
├── MacOS/BandReady                      # Electron binary
├── Info.plist                           # NSMicrophoneUsageDescription etc. (section 10)
└── Resources/
    ├── app.asar                         # main + preload + renderer dist (SPA)
    ├── icon.icns
    ├── python/                          # python-build-standalone, extracted "install_only_stripped"
    │   ├── bin/python3.11
    │   └── lib/python3.11/...           # stdlib
    ├── sidecar-venv/                    # uv-built venv (section 3.3)
    │   ├── pyvenv.cfg                   # present but UNUSED at runtime (see 3.4)
    │   ├── bin/                         # console scripts — dev/debug convenience only
    │   └── lib/python3.11/site-packages/
    │       ├── bandready/               # our sidecar wheel, installed like any other package
    │       ├── pipecat/ ... onnxruntime/ ... av/ ...
    └── content/                         # shipped original practice-content pack (15-content-authoring-licensing.md)
```

Windows: `resources\python\python.exe`, `resources\sidecar-venv\Lib\site-packages\`. Linux (AppImage): same POSIX layout under `resources/`. Electron main resolves everything from `process.resourcesPath`.

### 3.3 Build-time venv construction (per platform, in CI)

```bash
# scripts/build-venv.sh <target-triple>   (run on the matching runner OS/arch)
uv python install --install-dir build/pbs 3.11          # fetches python-build-standalone
uv venv build/sidecar-venv --python build/pbs/cpython-3.11*/bin/python3.11 --relocatable
uv pip sync --python build/sidecar-venv/bin/python \
    --only-binary :all: requirements/<target-triple>.txt # wheels ONLY — never compile on CI or user machines
uv pip install --python build/sidecar-venv/bin/python \
    --only-binary :all: dist/bandready_sidecar-*.whl     # our own code, built by hatchling
# prune: __pycache__, *.dist-info/RECORD stays (needed for pip debugging), tests/ dirs of big deps
python scripts/prune_venv.py build/sidecar-venv
```

`--only-binary :all:` is a hard rule: a source-dist fallback compiling on a runner would produce artifacts we can't reproduce and might not have signed toolchains for. If a dep has no wheel for a target, that's a release blocker to solve explicitly, not silently.

### 3.4 Runtime launch — bundled interpreter + `PYTHONPATH`, not `pyvenv.cfg`

`pyvenv.cfg` stores an **absolute** `home =` path to the base interpreter. Rewriting it post-install would modify a file inside the sealed, signed mac bundle (invalidating the signature), and baking in `/Applications/...` breaks users who run from elsewhere. So the venv's activation machinery is **not used at runtime**. Electron main launches the base interpreter directly and points it at the venv's site-packages:

```ts
// app/electron/sidecar.ts — packaged-mode spawn (extends 01-architecture.md §4.1)
function sidecarCommand(): { bin: string; args: string[]; env: Record<string,string> } {
  const R = process.resourcesPath;
  const py = process.platform === "win32"
    ? join(R, "python", "python.exe")
    : join(R, "python", "bin", "python3.11");
  const site = process.platform === "win32"
    ? join(R, "sidecar-venv", "Lib", "site-packages")
    : join(R, "sidecar-venv", "lib", "python3.11", "site-packages");
  return {
    bin: py,
    args: ["-s", "-m", "bandready.cli", "serve"],   // -s: no user site-packages leakage
    env: { PYTHONPATH: site, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" },
  };
}
```

- `PYTHONPATH` entries precede stdlib on `sys.path`; none of our packages shadow stdlib names (CI asserts this: `scripts/check_stdlib_shadowing.py` compares top-level site-packages names against `sys.stdlib_module_names`).
- `PYTHONDONTWRITEBYTECODE=1` — the resources tree must stay read-only (mac signature seal; Windows Program Files ACLs if machine-install is ever chosen). `.pyc` for site-packages are pre-compiled at build time (`python -m compileall -j0`, before signing) so startup doesn't pay the parse cost.
- Debugging in the field: `<resources>/python/bin/python3.11 -s -m pip list` with the same `PYTHONPATH` — documented in a `docs/support.md` snippet.
- Dev mode never uses this path — it runs `uv run uvicorn ... --reload` (section 12).

### 3.5 Per-platform dependency resolution — separate pinned requirement sets

One `sidecar/pyproject.toml` with environment markers; per-target fully-pinned exports generated by uv's cross-platform resolver (the `--python-platform` flag lives on `uv pip compile`):

```
requirements/
├── aarch64-apple-darwin.txt
├── x86_64-apple-darwin.txt
├── x86_64-pc-windows-msvc.txt
└── x86_64-unknown-linux-gnu.txt
```

```bash
# scripts/lock.sh — run on any machine, commits all four
for t in aarch64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-msvc x86_64-unknown-linux-gnu; do
  uv pip compile sidecar/pyproject.toml \
     --python-version 3.11 --python-platform "$t" \
     --extra voice $( [ "$t" = aarch64-apple-darwin ] && echo --extra mlx ) \
     -o "requirements/$t.txt"
done
```

Native-heavy deps, per platform:

| Dep | Why it's in | Handling |
|---|---|---|
| **torch** | Only transitively via `pipecat-ai[whisper]` (openai-whisper). | **Excluded from the default bundle** — we do not install the `whisper` extra; STT is faster-whisper (CTranslate2) / mlx_whisper (03-providers-and-settings.md). This is the single biggest size win (~1 GB installed). If a future dep reintroduces torch: pin the CPU index on Win/Linux via `[tool.uv.sources] torch = { index = "pytorch-cpu" }` + `[[tool.uv.index]] url = "https://download.pytorch.org/whl/cpu"`; mac default wheels are already CPU/MPS. Never ship CUDA wheels. |
| **mlx / mlx-whisper** | mac-arm64 in-proc STT | `mlx` extra with marker `sys_platform == 'darwin' and platform_machine == 'arm64'`; only resolved into `aarch64-apple-darwin.txt`. (mlx-lm is an *external* uv tool, not bundled — 03 §engine setup.) |
| **onnxruntime** | Silero VAD + kokoro-onnx | Plain CPU package everywhere (~50–100 MB). No `onnxruntime-gpu`, no CoreML/DirectML variants in v1. |
| **av / aiortc** | WebRTC media (pipecat SmallWebRTCTransport) | `av` wheels bundle ffmpeg libs (~40–70 MB) — exactly why `--only-binary :all:` matters; a source build would need system ffmpeg. |
| **ctranslate2 / faster-whisper** | default STT engine | manylinux/mac/win wheels, int8 CPU (03). |
| **kokoro-onnx** | default TTS | pure-python + onnxruntime; model weights downloaded at first run (section 7), never bundled. |

Renovate/dependabot rule: any PR touching `sidecar/pyproject.toml` must regenerate all four lockfiles in the same commit (CI check diffs them).

## 4. electron-builder configuration (skeleton)

```yaml
# app/electron-builder.yml
appId: dev.bandready.app
productName: BandReady
directories: { output: ../dist-electron, buildResources: build }
files: ["dist/**"]                  # main+preload+renderer output (asar)
asar: true
extraResources:
  - { from: ../build/python,       to: python }        # per-platform tree staged by CI
  - { from: ../build/sidecar-venv, to: sidecar-venv }
  - { from: ../content/pack,       to: content }
mac:
  target: [{ target: dmg, arch: [arm64, x64] }, { target: zip, arch: [arm64, x64] }]
  category: public.app-category.education
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize: true                     # uses APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID env (notarytool)
  extendInfo:
    NSMicrophoneUsageDescription: >-
      BandReady uses your microphone for speaking practice and pronunciation
      feedback. Audio is processed on this device or by the AI provider you
      configured, and is never sent to BandReady servers.
win:
  target: [{ target: nsis, arch: [x64] }]
  # no certificate config in v1 — ships unsigned (section 8.2)
nsis:
  oneClick: false
  perMachine: false                  # per-user install: no UAC, and %APPDATA% data dir matches 01 §8
  allowToChangeInstallationDirectory: true
linux:
  target: [AppImage, deb]
  category: Education
publish: { provider: github, owner: bandready, repo: bandready }
```

Notes:
- **arch-specific resources**: CI stages the right `build/python` + `build/sidecar-venv` per matrix job before invoking electron-builder — builder itself is arch-agnostic about `extraResources`. One runner builds exactly one target arch (no universal/fat mac build: it would double the venv).
- The venv lives in `extraResources` (never inside asar): native libs must be real files on disk for `dlopen`, and mac signing needs to reach every Mach-O.
- NSIS handles our ~800 MB payload fine (well under its 2 GB ceiling); if we ever cross ~1.5 GB, switch `target: nsis-web`.

## 5. macOS signing — what actually gets signed

electron-builder deep-signs every nested Mach-O (`python3.11`, every `.so`/`.dylib` in site-packages — thousands of files, budget ~3–6 min). Requirements that bit others and are law here:

1. Hardened runtime ON (notarization requires it) + the entitlements below.
2. All binaries signed with the same Developer ID Application cert → library validation stays intact; we still set `disable-library-validation` defensively because pip-installed wheels occasionally contain ad-hoc-signed stray dylibs.
3. Nothing in the bundle may be modified post-signing — hence section 3.4 (no `pyvenv.cfg` rewrite), `PYTHONDONTWRITEBYTECODE`, and models/content downloads going to the data dir only.

```xml
<!-- app/build/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>                       <!-- V8 -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/> <!-- Electron/WebRTC -->
  <key>com.apple.security.cs.disable-library-validation</key><true/>      <!-- python native ext defensive -->
  <key>com.apple.security.device.audio-input</key><true/>                 <!-- mic: WebRTC capture -->
</dict>
</plist>
```

Notarization: electron-builder's `notarize: true` submits via `notarytool` and staples the ticket. CI provides `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and the cert via `CSC_LINK` (base64 .p12) + `CSC_KEY_PASSWORD`. Cost reality: Apple Developer Program $99/yr — required before the first public mac release.

## 6. Install-size budget

Estimates (installed on disk; download ≈ 40–55% of installed thanks to dmg/NSIS compression). Defaults flagged; re-measure in CI (section 11 uploads a size report per build, failing if a component exceeds budget by >15%).

| Component | mac arm64 | mac x64 | win x64 | linux x64 |
|---|---|---|---|---|
| Electron + app.asar (SPA) | ~250 MB | ~260 MB | ~220 MB | ~240 MB |
| python-build-standalone (stripped) | ~70 MB | ~75 MB | ~80 MB | ~75 MB |
| sidecar-venv — **naive** (with pipecat `whisper` extra → torch) | ~1.5 GB | ~1.7 GB | ~1.8–2 GB | ~1.8 GB |
| sidecar-venv — **shipped** (no torch; fw/CT2 + onnxruntime + av + mlx on mac-arm64) | ~550 MB | ~500 MB | ~520 MB | ~530 MB |
| Shipped content pack | ~30 MB | ~30 MB | ~30 MB | ~30 MB |
| **Total installed (shipped config)** | **~0.9 GB** | **~0.9 GB** | **~0.85 GB** | **~0.9 GB** |
| Installer download (est.) | ~420 MB | ~420 MB | ~400 MB | ~430 MB |
| Model weights (data dir, on demand — not in bundle) | +0.35–1.2 GB | same | same | same |

Mitigations (all applied):
1. **No torch**: drop `pipecat-ai[whisper]`; STT is faster-whisper/mlx_whisper (section 3.5). −~1 GB.
2. **MLX only on mac-arm64** via marker'd extra; other platforms never carry it.
3. **Whisper/Kokoro weights downloaded on demand** (section 7): kokoro ~340 MB, whisper small ~484 MB, whisper large-v3-turbo (MLX) ~1.6 GB — user chooses, data dir holds them, uninstall/update never re-downloads.
4. venv pruning: dependency `tests/`, `*.dist-info/RECORD` kept but docs/examples stripped (`prune_venv.py`), `python -m compileall` then drop nothing (pyc alongside py — keep py for debuggability; the ~8% size cost is accepted as a default).

## 7. Model-weights download manager

Weights live in `<datadir>/models/` (11-data-model.md §9's canonical data-dir tree per R2-18; 01-architecture.md §8 conforms to it) — **never** in the app bundle: bundling would break the mac signature seal on update, bloat every release, and force re-download on every app update.

### 7.1 First-run download step (a step inside 10's onboarding wizard — R2-14)

10-curriculum-progress.md owns the onboarding wizard end-to-end (R2-14); this doc no longer specs onboarding — it specs only the model-download **step** that wizard embeds (after provider preset choice, 03-providers-and-settings.md). The step shows the artifacts the chosen presets need, with sizes, a disk-space check, and a combined progress view. Speaking modules are locked until their weights are present; Reading/Writing work immediately (LLM-only).

### 7.2 Artifact manifest (shipped in the app, versioned)

```json
// resources/content/model-manifest.json (excerpt)
{
  "manifest_version": 1,
  "artifacts": [
    {
      "id": "kokoro-v1.0",
      "kind": "tts",
      "dest": "kokoro/",
      "files": [
        { "name": "kokoro-v1.0.onnx",  "size": 325532160, "sha256": "…64hex…",
          "url": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx" },
        { "name": "voices-v1.0.bin",   "size": 28303104,  "sha256": "…64hex…",
          "url": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin" }
      ]
    },
    {
      "id": "faster-whisper-small",
      "kind": "stt",
      "dest": "whisper/small/",
      "hf_repo": "Systran/faster-whisper-small",
      "files": [
        { "name": "model.bin", "size": 483546902, "sha256": "…", 
          "url": "https://huggingface.co/Systran/faster-whisper-small/resolve/main/model.bin" },
        { "name": "config.json", "size": 2263, "sha256": "…", "url": "…" },
        { "name": "tokenizer.json", "size": 2200000, "sha256": "…", "url": "…" },
        { "name": "vocabulary.txt", "size": 460000, "sha256": "…", "url": "…" }
      ]
    }
  ]
}
```

Default hashes are pinned at release time by `scripts/pin_model_hashes.py` (fetches + hashes + rewrites the manifest); a release cannot ship placeholder hashes (CI check).

### 7.3 Sidecar API + download semantics

Routes are owned by 18-api-contract.md (§4.15 models, §4.5 jobs). Downloads follow the standard one-shot job convention (R2-3, 18 §3) — the earlier `GET /api/v1/models/downloads` list + per-download cancel routes are superseded:

```
POST /api/v1/models/download        {"artifact_id": "kokoro-v1.0"}   → 202 {"job_id": "…"}   # job kind: model_download
GET  /api/v1/jobs/{id}              → {"state":"queued|running|done|error|cancelled",
                                       "progress_pct", "detail", "result", "error"}          # 18 §3 job object
GET  /api/v1/jobs?kind=model_download → in-flight/recent downloads (Models settings page list)
POST /api/v1/jobs/{id}/cancel       # best-effort cancel (18 §4.5)
POST /api/v1/models/import          {"artifact_id":"…","source_path":"/Volumes/USB/kokoro-v1.0.onnx"}  # offline import
GET  /api/v1/models/installed       → [{"artifact_id","path","verified_at"}]
```

Byte-level progress maps into the generic job object: `progress_pct = received_bytes / total_bytes`, and `detail` carries the human substage ("412 MB / 484 MB", "verifying checksum…") — checksum verification is a `detail` substage of `running`, not a distinct job state.

Rules (all defaults, all firm):
- Downloads via `httpx` streaming into `<dest>/<name>.part`; **resume** with `Range: bytes=<len(.part)>-` when the server advertises `Accept-Ranges` (HF and GitHub releases both do); otherwise restart.
- On completion: sha256 the whole file (streamed, incremental during download so verify is nearly free), compare, then atomic `os.replace` `.part` → final name. Mismatch ⇒ delete `.part`, state `error:"checksum"`, one automatic retry.
- 3 retries with exponential backoff (2/8/30 s) on network errors; renderer polls `GET /api/v1/jobs/{id}` at 500 ms (no SSE — the job convention per R2-3 / 18 §3).
- One download at a time (models are GB-scale; parallelism just fragments bandwidth). Queue in the sidecar, survives renderer reloads, cancelled cleanly on app quit (`.part` kept for resume next launch).
- **Offline import**: user picks a file/folder via native dialog (preload `showOpenDialog` bridge); sidecar verifies sha256 against the manifest, then copies into place. Serves air-gapped users and the "I already have whisper models" crowd. A `--models-from <dir>` import-all is a stretch goal.
- MLX whisper snapshots (multi-file HF repos) use the same per-file mechanism with `hf_repo` listing expanded at pin time.

## 8. Code signing per OS

### 8.1 macOS — signed + notarized from the first public release
Covered in section 5. Unsigned mac builds are effectively undistributable (Gatekeeper "damaged/unidentified developer" on downloaded apps), so this is not optional.

### 8.2 Windows — v1 reality: unsigned, SmartScreen warning
Stating it plainly: v1 Windows builds are **unsigned**. Users will see "Windows protected your PC" (SmartScreen) and must click *More info → Run anyway*. The download page and README must show a screenshot of this flow and explain why (open-source project, cert cost). This decision stood in round-2 reconciliation (R2-12): 16-roadmap.md's v1.0 exit gate now matches — "signed + notarized macOS, documented unsigned-Windows flow". Options ranked for later:
1. **Azure Trusted Signing** (~$10/mo, needs a 3-year-old org or individual validation) — cheapest legitimate path, integrates with electron-builder `azureSignOptions`; adopt when eligible (16-roadmap.md).
2. OV Authenticode cert (~$100–400/yr, HSM/token requirement since 2023 makes CI signing awkward — cloud HSM services solve it at cost).
3. EV cert: instant SmartScreen reputation but priciest.
SmartScreen reputation also accrues organically per-file-hash — but every release resets it, which is why signing matters long-term. electron-updater works with unsigned builds (it verifies the GitHub-release sha512 from `latest.yml` instead).

### 8.3 Linux — no signing; publish sha256sums
`SHA256SUMS.txt` attached to every GitHub release (all platforms), generated in CI.

## 9. DECISION — Auto-update: electron-updater + GitHub Releases

- **Provider**: GitHub Releases (`publish.provider: github`). Free, matches OSS distribution, no infra to run.
- **Scope**: the sidecar venv + python runtime update **as part of the app bundle** — one version number, one artifact, zero skew between SPA/main/sidecar/venv. Full-app updates only in v1.
- Mac: electron-updater requires the zip target + a signed app (both in place, section 4/5). Windows: NSIS + blockmap. electron-updater's blockmap **differential downloads** on NSIS/mac-zip come free and will shrink most updates substantially (Chromium + venv rarely both change) — treat as opportunistic, never guaranteed; correctness path is always the full download. True delta strategy (splitting the venv into a separately-versioned artifact) is explicitly deferred (16-roadmap.md).
- Flow: main checks on launch + every 6 h (`autoUpdater.checkForUpdates()`), downloads in background, then shows a renderer banner "Restart to update" — **never** auto-restarts (a live speaking session must not be killed; 04-speaking-module.md). `autoUpdater.quitAndInstall()` only on user click, and main runs the graceful sidecar shutdown first (01 §4 shutdown ladder).
- Channel: `latest` only in v1. Prereleases marked on GitHub are ignored by default (`allowPrerelease: false`); a hidden setting flips it for beta testers.
- Linux AppImage: electron-updater supports it; deb users update manually (documented).

## 10. Microphone & privacy permissions per OS

| OS | Mechanism | BandReady behavior |
|---|---|---|
| macOS | TCC prompt on first mic access; text from `NSMicrophoneUsageDescription` (set in section 4's `extendInfo` — exact copy there). Hardened-runtime entitlement `com.apple.security.device.audio-input` required or capture silently fails. | Main calls `systemPreferences.askForMediaAccess('microphone')` when the user *enters the first speaking/pronunciation session* — not at app launch (asking at launch tanks grant rates). If denied: renderer shows a card with a deep link `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`. |
| Windows | No prompt for desktop (win32) apps by default, but the global *Settings → Privacy → Microphone → "Let desktop apps access your microphone"* toggle can block capture — `getUserMedia` then rejects. | Map `NotAllowedError`/`NotFoundError` via `describeError()` (`app/src/features/speaking/components/phases.ts`) to a card deep-linking `ms-settings:privacy-microphone`. |
| Linux | No OS prompt (PulseAudio/PipeWire); portal prompts only under Flatpak (not v1). | Same `describeError()` card; docs mention `pavucontrol` for device debugging. |

Renderer-side, Electron main auto-approves Chromium's `media` permission request for our own origin only (`session.setPermissionRequestHandler` allowlists `app://` + the dev Vite origin, denies everything else). The gotcha-#3 `initDevices()`-before-`connect()` rule (law) is what actually surfaces these prompts at the right moment — 02-voice-pipeline.md.

## 11. CI release matrix (GitHub Actions)

```yaml
# .github/workflows/release.yml (skeleton)
name: release
on:
  push: { tags: ["v*"] }
jobs:
  webui:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -C app build:renderer && pnpm -C app build:main   # electron-vite → app/dist
      - uses: actions/upload-artifact@v4
        with: { name: app-dist, path: app/dist }

  package:
    needs: webui
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: macos-14,     triple: aarch64-apple-darwin,      eb_args: "--mac --arm64" }
          - { os: macos-13,     triple: x86_64-apple-darwin,       eb_args: "--mac --x64" }     # best-effort
          - { os: windows-latest, triple: x86_64-pc-windows-msvc,  eb_args: "--win --x64" }
          - { os: ubuntu-22.04, triple: x86_64-unknown-linux-gnu,  eb_args: "--linux" }         # bonus
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: actions/download-artifact@v4
        with: { name: app-dist, path: app/dist }
      - run: pnpm install --frozen-lockfile
      - run: uv build sidecar --wheel -o dist/                       # bandready_sidecar-*.whl
      - run: bash scripts/build-venv.sh ${{ matrix.triple }}          # section 3.3 → build/python, build/sidecar-venv
      - run: bash scripts/smoke_venv.sh                               # import pipecat/onnxruntime/av/ctranslate2;
                                                                      # boot sidecar, GET /health, kill  (14-testing-strategy.md)
      - run: pnpm -C app exec electron-builder ${{ matrix.eb_args }} --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ secrets.MAC_CERT_P12 }}          # mac jobs only
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASS }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_PASS }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      - run: python scripts/size_report.py dist-electron >> "$GITHUB_STEP_SUMMARY"

  checksums:
    needs: package
    runs-on: ubuntu-latest
    steps:
      - run: gh release download "$GITHUB_REF_NAME" -D rel && (cd rel && sha256sum * > SHA256SUMS.txt)
             && gh release upload "$GITHUB_REF_NAME" rel/SHA256SUMS.txt
        env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
```

Key properties:
- **venv is built on the runner matching the target OS/arch** — no cross-installing wheels (mac x64 gets a real Intel runner while GitHub still offers `macos-13`; fallback plan: `uv pip sync --python-platform x86_64-apple-darwin` cross-resolve on arm64 + Rosetta smoke test).
- `smoke_venv.sh` is the anti-PyInstaller-regression insurance we keep even without PyInstaller: it proves every native lib actually loads *in the exact tree we ship*, and that the sidecar boots to `/health` OK, before we spend minutes signing.
- Release drafting: `--publish always` uploads to the draft release created by the tag; a human publishes the release (which is what makes electron-updater's `latest*.yml` live) after checking the size report + installing one artifact per primary platform manually (14-testing-strategy.md release checklist).
- PR CI runs the same `package` job weekly + on `packaging/**` changes with `--publish never` to catch bit-rot early.

## 12. Dev-mode workflow (recap — 01-architecture.md §10 is canonical)

`pnpm dev` → `scripts/dev.mjs` starts: Vite (`localhost:5173`, HMR), sidecar via `uv run uvicorn bandready.server.app:app --reload --host 127.0.0.1 --port 8710` (fixed dev port/token, `./.dev-data` data dir), and Electron pointed at the Vite URL. None of this doc's machinery (pbs interpreter, bundled venv, PYTHONPATH launch) is involved in dev — `uv sync` manages a normal local venv from the same `pyproject.toml`. The packaged spawn path is exercised by `pnpm dev --spawn-sidecar` (against a locally built `build/` tree via `pnpm package:local`, which runs sections 3.3 + 4 unsigned) — do this before touching `sidecar.ts` or `build-venv.sh`.

## 13. Crash reporting & telemetry policy

- **No telemetry, no crash uploads, by default — and there is no server to receive them.** This is a product commitment (decisions.md: all data stays on device), stated in the README and the privacy note in onboarding.
- Local diagnostics only: `logs/sidecar.log` + `logs/main.log` (rotating 5×5 MB, 01 §8); uncaught main-process exceptions and sidecar crash exits append structured entries. A "Report a problem" screen zips redacted logs (a scrubber strips anything matching `sk-…`/bearer tokens/paths under home) for the *user* to attach to a GitHub issue manually.
- Electron's built-in `crashReporter` stays **disabled** (it wants an upload endpoint); local Chromium crash dumps are still written by the OS and referenced in the troubleshooting doc.
- An **opt-in anonymous usage-stats flag** (counts of sessions per module, versions, OS — never content/audio) is deliberately *not* in v1; whether to ever add it is an open question below.

## 14. Cross-references

- 01-architecture.md — sidecar spawn/env contract this doc's launch code extends; dev mode.
- 11-data-model.md §9 — canonical data-dir tree (R2-18) the download manager writes into.
- 18-api-contract.md — canonical route inventory (§4.15 models, §4.5 jobs) and the job convention section 7.3 follows.
- 10-curriculum-progress.md — owns the onboarding wizard that embeds section 7.1's model-download step (R2-14).
- 02-voice-pipeline.md — the five Pipecat gotchas; why `initDevices()` timing drives the mic prompts.
- 03-providers-and-settings.md — engine presets whose weights section 7 downloads; external-engine (Ollama/mlx-lm) install flows that are *not* part of our bundle.
- 09-pronunciation-assessment.md — recordings dir the uninstaller must leave untouched.
- 14-testing-strategy.md — `smoke_venv.sh`, release checklist, packaged-app E2E.
- 15-content-authoring-licensing.md — shipped content pack in `resources/content/`.
- 16-roadmap.md — Windows signing adoption, delta updates, store/package-manager distribution.

## Open questions

1. **macOS x64 longevity** — GitHub is sunsetting Intel runners; when `macos-13` disappears, do we keep x64 alive via cross-resolved wheels + Rosetta CI, or drop the target?
2. **Opt-in anonymous usage stats** — ever add the flag (and stand up an endpoint), or keep the "no telemetry, period" story as a differentiator? Leaning: keep zero-telemetry through v1.x.
3. **Data-dir handling on uninstall** — Windows NSIS can offer "also delete my data" (models can be >1 GB); mac has no uninstall hook at all. Do we add an in-app "Delete all data…" action to compensate on mac?
4. **HF download reliability in CN/IR regions** — do we mirror weights on GitHub Releases ourselves (license-permitting per artifact) or document proxy setup? Affects manifest URL scheme (multiple mirrors per file?).

(The former "Windows signing timing" question is answered by R2-12: v1 ships unsigned with the documented SmartScreen flow; Azure Trusted Signing is adopted post-v1.0 when eligible — section 8.2 / 16-roadmap.md.)

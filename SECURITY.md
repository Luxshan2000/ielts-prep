# Security policy

BandReady runs on a learner's own machine and handles two things worth protecting: recordings
of their voice, and API keys for whatever provider they configured. This document says how that
is defended, where the boundaries are, and how to tell us when we got it wrong.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting:

> **<https://github.com/Luxshan2000/bandready/security/advisories/new>**

That form is private between you and the maintainer. If it is unavailable, open a normal issue
that says only "security report, please make contact" and gives no detail, and you will be
contacted for the rest.

Please include: what you found, the file or endpoint involved, the steps to reproduce it, and
what an attacker gets out of it. A proof of concept helps. So does telling us which version or
commit you looked at.

This is a single-maintainer project with no paid security programme, so set your expectations
accordingly:

- Acknowledgement inside 7 days.
- An assessment, or a request for more detail, inside 30 days.
- A fix on the maintainer's own timeline, published as a GitHub security advisory with credit
  to you unless you prefer otherwise.

There is no bug bounty. There is no supported release to backport to.

## Supported versions

None, yet. There is no tagged release. Everything here describes `main`, and the only advice
that can be given today is to build from a recent commit. When the first release is tagged, this
section will name it.

## Scope

**In scope**

- The Python sidecar under `sidecar/bandready/`: the auth middleware, the ticket scheme, route
  authorisation, the settings store, and secret handling.
- The Electron main process under `app/electron/`: sidecar spawn, token handling, IPC surface,
  preload isolation.
- The content pack import path, including checksum verification and anything a malicious
  `.brpack` could do.
- Handling of provider credentials anywhere in the codebase.
- The renderer, for anything that would let untrusted content (a content pack, a model
  response) execute script or read data it should not.

**Out of scope**

- Third-party model providers. If OpenRouter or Ollama leaks your data, that is their issue.
- The models themselves: prompt injection through a practice answer, or a model that returns a
  wrong band. Wrong scores are a quality bug, not a security one.
- Unsigned builds triggering Gatekeeper or SmartScreen. That is known, documented and expected
  until there are certificates.
- Anything that requires an attacker to already have local user-level access to the machine.
  The sidecar's threat model assumes the local user is the owner.
- Denial of service against a loopback server the user started themselves.
- The content of the practice material. A wrong answer key belongs in the issue tracker.

## The security model

Every claim below is stated with the file and line that implements it, so you can check rather
than trust.

### The sidecar is loopback-only

The default host is `127.0.0.1` (`sidecar/bandready/config.py:116`), and the Electron main
process pins it explicitly when it spawns the process (`app/electron/sidecar.ts:349`) on a
random free port it picked itself (`app/electron/sidecar.ts:266`).

That is the binding. The middleware then enforces the same thing at the request level. Every
request must carry a `Host` header naming a loopback address
(`sidecar/bandready/server/auth.py:118`, using the check at `auth.py:59` against the set at
`auth.py:31`), which is what stops DNS rebinding: a rebound page arrives with
`Host: evil.example` and is refused with a 403. When an `Origin` header is present it must be
an allowed app, dev or loopback origin (`auth.py:122`, checked at `auth.py:70`).

### Every route requires a bearer token

Electron generates a fresh token on each launch and passes it to the child process in the
environment (`app/electron/sidecar.ts:334` and `:351`). The middleware compares it in constant
time (`auth.py:130`, comparison at `auth.py:82` using `hmac.compare_digest` at `auth.py:87`) and
returns 401 otherwise (`auth.py:143`). Routes also re-check through the `require_auth`
dependency (`sidecar/bandready/server/deps.py:26`, raising at `deps.py:40`), so a route stays
safe even if it is ever mounted without the middleware.

**The only exempt path in the entire application is `GET /health`**
(`auth.py:30`).

Two things cannot send an `Authorization` header: an `<audio>` element and a browser
`WebSocket`. Those use short-lived signed tickets instead
(`sidecar/bandready/server/tickets.py`): the ticket is an HMAC-SHA256 over
`audience|resource|expiry`, keyed by the same per-launch bearer token, with no server-side
state. The middleware verifies the signature (`auth.py:138`) and the route then verifies the
audience and the exact resource. Ticket values are redacted from the access log
(`auth.py:156`).

One deliberate trade-off is written into the code: the `media-read` audience has a 12 hour
lifetime rather than 60 seconds (`tickets.py:42-45`), because an `<audio>` element re-presents
one URL on every `Range` request for the whole life of the element. The reasoning is in the
comment above it.

**Known weakness.** `auth.py` line 10 describes the token as 256-bit. It is not: Electron uses
`randomUUID()` (`app/electron/sidecar.ts:334`), which is a v4 UUID carrying 122 bits of
entropy. That is still far beyond brute force over loopback, but the docstring and the code
disagree and the docstring is the one that is wrong.

**Dev mode is different, on purpose.** `node scripts/dev.mjs --browser` runs with the fixed
token `dev-token`, and an empty token disables bearer auth entirely with a loud warning
(`auth.py:84` and `auth.py:108`). Do not run a dev sidecar on a machine you share.

### Provider API keys are encrypted at rest

A key you type into Settings is encrypted before it is written anywhere
(`sidecar/bandready/security/secrets.py:106`), stored in the form `enc:v1:<fernet-token>`
(`secrets.py:27`), and decrypted only in-process (`secrets.py:120`).

The Fernet key is generated per install on first use into `<data dir>/secret.key`
(`sidecar/bandready/config.py:148`, written at `secrets.py:60`) with mode `0600`, created
atomically through `mkstemp` and `os.replace` (`secrets.py:69-83`). There is no shared fallback
key baked into the source, and the module docstring says why (`secrets.py:5-7`).

`GET /api/v1/settings` never returns a plaintext key. It returns a mask (`secrets.py:139`).
Logs are filtered through a redactor that strips `enc:v1:` blobs, `sk-` style keys, `ticket=`
query parameters and `Bearer` headers (`secrets.py:148`, installed as a logging filter at
`secrets.py:157` and `secrets.py:172`).

If you would rather not store the key at all, set the field to a literal `${VAR}` reference.
Those are recognised (`secrets.py:50`), deliberately stored unencrypted because they are not
secret, passed through untouched by `encrypt` (`secrets.py:114`), and resolved from the
environment at request time.

### Model weights are never committed and never bundled

Nothing in `content/` or anywhere else in the repository is a model weight. The packaging
script says so and stages only a CPython tree and the sidecar venv
(`scripts/stage-sidecar.mjs:22`), and `app/electron-builder.yml:30-36` lists exactly three
`extraResources`: `build/python`, `build/sidecar-venv` and `content/core-en`.

Weights are downloaded on first run into `<data dir>/models/`
(`sidecar/bandready/config.py:156`). Files already on the machine are hard-linked rather than
re-downloaded, from a fixed list of cache locations, at startup
(`sidecar/bandready/server/app.py:126`). That behaviour is switchable off with
`BANDREADY_ADOPT_LOCAL_MODELS=0` (`app.py:116`).

The practical consequence: cloning this repository never gives you a multi-hundred-megabyte
binary of unknown provenance, and installing the app never redistributes someone else's model
licence.

### What is in your data directory

| Path | What it is |
|---|---|
| `bandready.db` | the SQLite database: attempts, transcripts, scores, vocabulary, plan (`config.py:144`) |
| `secret.key` | the Fernet key that encrypts your provider credentials, mode 0600 (`config.py:148`) |
| `settings.json` | the settings document, including encrypted keys (`config.py:152`) |
| `media/speaking/<session id>/` | per-turn WAV recordings of your voice (`sidecar/bandready/voice/recorder.py:76`) |
| `models/` | downloaded or hard-linked model weights (`config.py:156`) |
| `logs/`, `packs/`, `exports/` | sidecar logs, installed content packs, data exports |

The directory is `~/Library/Application Support/BandReady` on macOS, `%APPDATA%\BandReady` on
Windows, and `$XDG_DATA_HOME/BandReady` on Linux (`config.py:89`). Deleting it resets the app.

Note what that table implies. `secret.key` sits next to `settings.json`, so anyone who can read
your home directory can read your provider keys. That is the standard desktop-app trade-off and
it is stated here rather than hidden. If it matters to you, use a `${VAR}` reference and keep
the value in your shell or in a file only you can read.

### What leaves the machine, and when

By default, nothing. Local engine detection probes loopback only, and the module says so
(`sidecar/bandready/providers/detect.py:3-5`). The app has no analytics, no crash reporting and
no account.

Four things can cross the boundary, and every one of them is a choice you made:

1. **Model downloads on first run.** Kokoro weights from GitHub Releases, Whisper weights from
   Hugging Face, WordNet. You see them listed before they are fetched.
2. **A cloud LLM you configured.** Writing and speaking marking are chat-completion calls
   (`sidecar/bandready/providers/llm.py`), which carry **text only**: your essay, or the
   transcript of what you said, plus the rubric prompt. No audio is ever sent to the LLM.
3. **A cloud speech-to-text provider, if you pick one.** This is the important one.
   `build_stt_service` (`sidecar/bandready/voice/pipeline.py:188`) constructs an
   `OpenAISTTService` when the configured engine is an OpenAI-compatible remote one
   (`pipeline.py:193-199`), and that means **your live speaking audio is uploaded to that
   provider**. Choose local Whisper (the `faster_whisper` or `mlx_whisper` preset,
   `pipeline.py:200-206`) and no audio leaves the machine at all. Pronunciation feedback
   requires local Whisper anyway, because a remote transcript carries no per-word confidence.
4. **The update check in a packaged build.** `app/electron/update.ts` asks GitHub Releases every
   six hours whether a newer version exists. It sends nothing about you, is notify-only, and is
   disabled in dev (`update.ts:41`).

### Content packs are checksum-verified

A pack manifest carries a sha256 for every file under `data/`, and a mismatch rejects the pack
whole at import rather than partially loading it. That is the same validator the authoring CLI
runs (`sidecar/bandready/content/validate.py`, wrapped by `tools/content/validate.py`). It is a
consistency guarantee, not a signature: an attacker who can hand you a `.brpack` can also
recompute its checksums. Treat a third-party pack as untrusted content and read it before you
import it.

## Known security-relevant issues

Listed here because a public repository should not make you find these yourself.

- **A Fernet key is present in git history.** `.dev-data/secret.key` was committed in
  `5d9eaf5` and removed in `f4ce0a3`. It is the per-install encryption key from a developer
  machine. No ciphertext was ever committed alongside it, so on its own it decrypts nothing,
  but it is a real key in a public history and it should be treated as burned.
- **The token entropy docstring is wrong**, as described above.
- **Dev mode ships a fixed token** (`dev-token`) and a fixed port. Intended, and dangerous on a
  shared machine.
- **Nothing is code-signed or notarized.** You cannot verify that a build you downloaded came
  from this repository. Until that changes, build from source if it matters to you.
- **Neither CI workflow has ever run on GitHub Actions**, so no automated check has verified
  any of the above on a clean machine.

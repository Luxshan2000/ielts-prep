"""Render a listening script to a single cached WAV (07-listening-module.md §3).

Pipeline, per script:

1. resolve each speaker's concrete voice from ``role x accent`` (:data:`VOICE_MAP`);
2. synthesize every line independently against the configured TTS provider, caching each
   line at ``media/tts-lines/<sha>.wav`` so editing one line re-renders only that line;
3. stitch the lines with their authored pauses (:mod:`bandready.audio.stitch`), recording
   per-line offsets;
4. write ``media/listening/<audio_hash>.wav`` + ``<audio_hash>.timing.json`` and register
   both in ``media_files`` so 11 §9's LRU eviction can see them.

Providers, in the order they are tried:

* **mock** (``BANDREADY_ENABLE_MOCK=1`` + the hidden ``mock_tts`` preset) — silence of a
  plausible duration. Everything downstream (hashing, stitching, timing, HTTP range
  serving) is exercised with no engine installed; this is what the tests use.
* **kokoro_onnx** — the local default. Imported lazily and guarded: a missing wheel or a
  missing model file is a clean ``provider_error``, never an import-time crash that would
  take the whole route module out of auto-discovery.
* any **OpenAI-compatible** ``POST /audio/speech`` endpoint (07 §8).

**The script is not the deliverable; the render is** (L-R4 thesis 4). Three defects that
document measured against the engine we actually ship are fixed here, and each one changes
what a candidate hears rather than how the code reads:

* **British voices were given American phonology.** Every synthesis call hardcoded
  ``lang="en-us"``, including all eight ``bf_``/``bm_`` voices, so a British enrolments
  officer spelled a surname saying "zee" (``Z.`` → ``zˈiː`` instead of ``zˈɛd``) and ``R.``
  came out rhotic. That is not a subtle loss — it is the accent drill, our headline
  listening feature, being half-fake. :func:`lang_for_voice` derives the language from the
  voice id (L-R4 §8.7).
* **Hyphen-spelled names rendered as mush.** ``O-K-A-F-O-R`` phonemizes to one unbroken
  pseudo-word (``ˈəʊkˈeɪɐˈɛfˈəʊˈɑː``) that no candidate can transcribe, and spelled names
  are a Part 1 staple. :func:`normalize_spelled_runs` rewrites the run into the dotted form
  Kokoro segments correctly **for synthesis only** — the transcript keeps the hyphens,
  because that is what a human writes (L-R4 §8.1).
* **Authored pauses were lower bounds.** See :func:`bandready.audio.stitch.trim_edges`.

Authors who need finer control than the automatic repair have two optional per-line fields,
both folded into the content hash so editing either re-renders: ``say_as`` (what to speak,
when it must differ from the displayed ``text``) and ``phonemes`` (a raw IPA string, for the
handful of proper nouns Kokoro mispronounces — *Cholmondeley*, *Featherstonehaugh*).
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np

from bandready.audio import stitch as stitch_mod
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.audio.tts")

#: Bumped whenever a change here alters the *audio* produced from unchanged content.
#: It is folded into :func:`script_audio_hash` and :func:`line_cache_key`, which is the
#: whole invalidation story: every script gets a new hash, ``cached_render`` misses, the
#: UI reports the part as not-yet-prepared and one re-render fixes it. Nothing has to be
#: hand-cleared and no stale WAV can survive by being on disk under the old name.
#:
#: 2 — British phonology, spelled-run repair, per-line edge trimming.
RENDER_GENERATION = 2

# 07 §3 — role x accent -> Kokoro voice id. Kokoro v1.0 has no Australian voices, so
# `au` falls back to British ones and the UI labels it "approximated".
VOICE_MAP: dict[str, dict[str, str]] = {
    "uk": {
        "narrator": "bm_george",
        "female_1": "bf_emma",
        "female_2": "bf_isabella",
        "male_1": "bm_lewis",
        "male_2": "bm_daniel",
    },
    "us": {
        "narrator": "am_michael",
        "female_1": "af_heart",
        "female_2": "af_bella",
        "male_1": "am_adam",
        "male_2": "am_eric",
    },
    # Measured median F0 (L-R4 §7.3) says the shipped `au` male pair was unusable: male_1
    # `bm_daniel` (131.5 Hz) against male_2 `bm_fable` (124.4 Hz) is 7 Hz of separation,
    # which is one voice with two names, and a two-male Australian Part 3 asking who said
    # what is then unfair rather than difficult. male_2 is `bm_lewis` (98.4 Hz) — 33 Hz
    # apart, the widest available inside the British cast this set borrows from. It also
    # retires `bm_fable` from dialogue, where its ~540 ms trailing silence lands a beat of
    # dead air on every turn.
    # STILL OPEN: `au` and `uk` share the `bm_george` narrator, so the accent drill opens
    # by playing the identical voice it is contrasting against. Fixing that needs a test
    # update outside this task's owned paths — reported rather than done.
    "au": {
        "narrator": "bm_george",
        "female_1": "bf_alice",
        "female_2": "bf_lily",
        "male_1": "bm_daniel",
        "male_2": "bm_lewis",
    },
}

#: Kokoro's voice ids encode their accent in the first two characters, and the phonemizer
#: language must agree with them or the acoustic model delivers a hybrid that exists
#: nowhere: British timbre over American vowels (L-R4 §8.7).
BRITISH_VOICE_PREFIXES: tuple[str, ...] = ("bf_", "bm_")

ACCENT_SETS: tuple[str, ...] = ("uk", "us", "au")
ROLES: tuple[str, ...] = ("narrator", "female_1", "female_2", "male_1", "male_2")
FALLBACK_ROLE_ORDER: tuple[str, ...] = ("female_1", "male_1", "female_2", "male_2")

#: Accent labelling shown next to the player (07 §3).
ACCENT_LABELS = {
    "uk": "British",
    "us": "American",
    "au": "Australian (approximated with British voices)",
}

_kokoro_cache: dict[tuple[str, str], Any] = {}


# --------------------------------------------------------------------------- voices

def resolve_voice(
    speaker: Mapping[str, Any], accent: str, ordinal: int = 0, *, forced: bool = False
) -> str:
    """Concrete voice id for one speaker.

    An authored ``voice`` wins (07 §2) unless ``forced`` — an accent drill re-renders the
    same script with a different accent set and must override authoring.
    """
    override = str(speaker.get("voice") or "").strip()
    if override and not forced:
        return override
    table = VOICE_MAP.get(accent.lower()) or VOICE_MAP["uk"]
    role = str(speaker.get("role") or "").strip().lower()
    if role not in table:
        # Unrolled speaker (generated scripts sometimes omit `role`): cast it into the
        # next free slot deterministically so the same script always sounds the same.
        role = FALLBACK_ROLE_ORDER[ordinal % len(FALLBACK_ROLE_ORDER)]
    return table[role]


def resolve_voices(script: Mapping[str, Any], accent_set: str | None = None) -> dict[str, str]:
    """``{speaker_id: voice_id}`` for every speaker in the script.

    ``accent_set=None`` honours each speaker's authored ``accent`` (falling back to the
    script's ``accent_set``); passing an accent explicitly **forces** every speaker onto
    that accent's cast, which is what the accent-drill re-render needs (07 §8).
    """
    forced = str(accent_set).lower() if accent_set else None
    if forced is not None and forced not in VOICE_MAP:
        forced = "uk"
    default_accent = str(script.get("accent_set") or "uk").lower()
    resolved: dict[str, str] = {}
    ordinal = 0
    for speaker in script.get("speakers") or []:
        if not isinstance(speaker, Mapping):
            continue
        sid = str(speaker.get("id") or "").strip()
        if not sid:
            continue
        accent = forced or str(speaker.get("accent") or default_accent).lower()
        is_narrator = str(speaker.get("role") or sid).lower() == "narrator"
        resolved[sid] = resolve_voice(
            speaker, accent, 0 if is_narrator else ordinal, forced=forced is not None
        )
        if not is_narrator:
            ordinal += 1
    return resolved


def accent_label(accent_set: str | None) -> str:
    return ACCENT_LABELS.get(str(accent_set or "uk").lower(), ACCENT_LABELS["uk"])


def lang_for_voice(voice: str) -> str:
    """Phonemizer language for a Kokoro voice id — ``en-gb`` for the British cast.

    One line, and it decides whether ``Z.`` is *zed* or *zee*, whether ``after the last``
    keeps its TRAP–BATH split, and whether ``R.`` is rhotic. All three are things a real
    candidate notices inside a sentence.
    """
    return "en-gb" if str(voice or "").startswith(BRITISH_VOICE_PREFIXES) else "en-us"


# --------------------------------------------------------------------------- speech text

#: ``O-K-A-F-O-R`` / ``B-E-L-L-F-I-E-L-D`` — three or more single letters joined by
#: hyphens. Two letters is left alone: ``T-shirt``, ``X-ray`` and ``e-bike`` are words.
#: The apostrophe in the lookbehind stops ``that's B-R-A-D`` from starting the run on the
#: ``s`` of ``that's``.
_HYPHEN_SPELLED = re.compile(
    r"(?<![A-Za-z0-9'’])([A-Za-z])((?:-[A-Za-z]){2,})(?![A-Za-z0-9])"
)

#: ``B R A D S H A W`` — three or more single letters separated by spaces. Kokoro reads a
#: lone ``A`` here as the *article* (``ɐ``, "uh") rather than the letter name (``ˈeɪ``), so
#: this form silently loses every A in a surname.
_SPACE_SPELLED = re.compile(
    r"(?<![A-Za-z0-9'’])([A-Za-z])((?: [A-Za-z]){2,})(?![A-Za-z0-9])"
)


def _dotted(first: str, rest: str, sep: str) -> str:
    letters = [first, *[part for part in rest.split(sep) if part]]
    return " ".join(f"{letter}." for letter in letters)


def normalize_spelled_runs(text: str) -> str:
    """Rewrite spelled-aloud letter runs into the only notation Kokoro segments.

    Measured (L-R4 §8.1), transcribing each render back with ``faster-whisper``:

    ==============================  ==========================================
    ``O-K-A-F-O-R.``                heard as "OK FOA, or CAFA"  ✗
    ``B R A D S H A W``             heard as "B.R.A.D.S.H.W"    ✗ (the A is lost)
    ``O. K. A. F. O. R.``           heard as "O-K-A-F-O-R"      ✓
    ==============================  ==========================================

    Applied to the **synthesis** string only. The learner still reads ``O-K-A-F-O-R`` in the
    transcript, because that is how a person writes a spelled name down, and the review
    screen's substring search against ``answer_quote`` keeps matching the authored text.

    Trailing punctuation is preserved: the last letter's own full stop is the one the
    rewrite adds, so ``that's B-R-A-D.`` becomes ``that's B. R. A. D.`` and not ``… D..``.
    """
    body = text or ""
    if not body:
        return body
    body = _HYPHEN_SPELLED.sub(lambda m: _dotted(m.group(1), m.group(2), "-"), body)
    body = _SPACE_SPELLED.sub(lambda m: _dotted(m.group(1), m.group(2), " "), body)
    # The rewrite ends every run with a full stop; an authored one right behind it is now
    # a double. `D.."` and `D.,` both read as a hesitation in the phonemizer output.
    return re.sub(r"\.\s*([.,;:!?])", r"\1", body)


def speech_text(line: Mapping[str, Any]) -> tuple[str, bool]:
    """``(what to synthesize, is_phonemes)`` for one authored line.

    Precedence, narrowest override first: ``phonemes`` (a raw IPA string, synthesized
    verbatim — the escape hatch for a proper noun the phonemizer gets wrong) → ``say_as``
    (author-supplied spoken form) → ``text`` with :func:`normalize_spelled_runs` applied.

    ``say_as`` is *not* normalised: an author who reaches for the field has already decided
    what the speaker says, and second-guessing them would make the field useless for the
    one case it exists for.
    """
    phonemes = str(line.get("phonemes") or "").strip()
    if phonemes:
        return phonemes, True
    say_as = str(line.get("say_as") or "").strip()
    if say_as:
        return say_as, False
    return normalize_spelled_runs(str(line.get("text") or "")), False


#: Number and abbreviation forms Kokoro reads as something other than what is written
#: (L-R4 §8.2, §8.5). These are *not* auto-rewritten: "read 4021 as four oh two one" is a
#: judgement about what the speaker means, and a renderer that guessed would eventually
#: turn a genuine quantity into a phone number. They are logged at render time so a bad
#: line is caught by whoever renders it rather than by a learner.
_SPEECH_WARNINGS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        # Only where a cardinal is *wrong*. `a 1500 word essay` is a genuine quantity and
        # reads correctly (measured ✓), so a bare `\d{4,}` rule would fire on correct
        # content. What is always wrong is a digit string standing for a code — after a
        # code noun, or in phone-number grouping.
        "digit_run",
        re.compile(
            r"(?:\b(?:extension|ext|room|ref|reference|membership|number|no|code|flat"
            r"|unit|tel|telephone|phone|account|policy|booking|postcode)\b[^.\n]{0,16}"
            r"(?<!\d)\d{4,}(?!\d))|(?:(?<!\d)\d{3,4}[ -]\d{3,4}(?![\d-]))",
            re.IGNORECASE,
        ),
        (
            "a digit string reads as a cardinal ('four thousand and twenty-one'); write "
            "reference, extension and phone numbers as words ('four oh two one')"
        ),
    ),
    (
        "old_year",
        re.compile(r"(?<!\d)1[89]\d\d(?!\d)"),
        (
            "a 20th-century year reads as 'nineteen hundred and ninety-four'; write "
            "'nineteen ninety-four'"
        ),
    ),
    (
        "decimal",
        re.compile(r"(?<!\d)\d+\.\d+"),
        (
            "'point' is dropped from a written decimal ('12.5' reads 'twelve five'); write "
            "'twelve point five'. Clock times H.MM are safe and are not flagged"
        ),
    ),
    (
        "currency_symbol",
        re.compile(r"[£$€]\s*\d"),
        (
            "a currency symbol reads as a prefix word ('pound forty-two fifty'); write "
            "'forty-two pounds fifty'"
        ),
    ),
    (
        "abbreviation",
        re.compile(r"\b(?:Dr|St|Rd|Ave|Mt|Prof|approx|etc)\.", re.IGNORECASE),
        "abbreviations are read literally ('Rd.' becomes the letters R D); write the word",
    ),
    (
        "bare_dash",
        re.compile(r"\s-\s"),
        (
            "a bare dash is stripped from the audio while staying in the transcript, so the "
            "two diverge; use a comma, an ellipsis, or split the line"
        ),
    ),
)

#: Digits that are exempt from ``digit_run``/``decimal`` because they render correctly:
#: 21st-century years, and clock times written ``H.MM`` / ``HH.MM`` (both measured ✓).
_SPEECH_EXEMPT = (
    re.compile(r"(?<!\d)20\d\d(?!\d)"),
    re.compile(r"(?<!\d)\d{1,2}\.[0-5]\d(?!\d)"),
)


def speech_warnings(text: str) -> list[dict[str, str]]:
    """Forms in ``text`` that Kokoro will not say the way they are written.

    Advisory, never fatal. The exemptions matter as much as the rules: a naive
    ``\\d{4,}`` fires on every correct 21st-century year and a naive ``\\d+\\.\\d+`` fires on
    every correct clock time, and a linter that cries wolf is one authors learn to ignore.
    """
    body = text or ""
    if not body:
        return []
    masked = body
    for exempt in _SPEECH_EXEMPT:
        masked = exempt.sub(lambda m: "\x00" * len(m.group(0)), masked)
    found: list[dict[str, str]] = []
    for slug, pattern, advice in _SPEECH_WARNINGS:
        match = pattern.search(masked if slug in ("digit_run", "old_year", "decimal") else body)
        if match:
            found.append({"rule": slug, "found": match.group(0), "advice": advice})
    return found


# --------------------------------------------------------------------------- hashing

def _canonical(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def tts_identity(config: Mapping[str, Any] | None = None) -> str:
    """Provider identity of ``config``, or of the live TTS slot when it is ``None``.

    ``""`` for the legacy default (local Kokoro, shipped weights, speed 1.0) — see
    :func:`bandready.providers.transport.provider_identity`. Every caller here omits an
    empty term rather than folding an empty string in, so a default install's hashes are
    byte-identical to the ones it already has on disk.
    """
    from bandready.providers import transport

    if config is None:
        return transport.slot_identity("tts")
    try:
        return transport.provider_identity(config, "tts")
    except Exception as exc:  # noqa: BLE001 — identity must never break a render
        _log.debug("could not compute the TTS provider identity: %s", exc)
        return ""


def script_audio_hash(
    script: Mapping[str, Any],
    accent_set: str | None = None,
    *,
    config: Mapping[str, Any] | None = None,
) -> str:
    """Content hash of *what will be spoken*, **and of what will speak it**.

    Changing a line, a pause or the accent set yields a new hash; re-titling the script
    or editing a question does not (07 §3 step 5). Teaching payloads are therefore free to
    rewrite — which is the point, since they are rewritten far more often than the audio.

    Three things beyond the original are folded in, and each one had to be:

    * the **spoken** form (``phonemes``/``say_as``/normalised ``text``) rather than the raw
      ``text``, or editing ``say_as`` would silently keep serving the old audio;
    * :data:`RENDER_GENERATION`, so that a change to *how* we synthesize invalidates every
      cached render at once instead of leaving the previous pipeline's output on disk under
      a name the new pipeline would still consider a hit;
    * the **TTS provider identity** (:func:`tts_identity`), which is what makes a provider
      switch behave like any other change to the audio. Before it, rendering a part with
      local Kokoro and then choosing OpenRouter in Settings left the hash untouched:
      :func:`cached_render` hit, the library reported "audio ready", and the app served
      Kokoro audio forever. The engine's own ``speed`` rides inside that term, which is
      how a moved speed slider — previously present in :func:`line_cache_key` and absent
      here — finally re-keys the stitched render too.

    The identity term is **omitted** when it is empty, i.e. for the shipped default. That
    is deliberate and is the entire upgrade story: an install that never changed provider
    keeps every WAV it has, and only a learner who has actually moved off Kokoro gets new
    hashes — which is exactly when they should.

    ``config`` defaults to the live ``tts`` slot; pass it explicitly when hashing against
    a configuration other than the one currently saved.
    """
    voices = resolve_voices(script, accent_set)
    lines = []
    for line in script.get("lines") or []:
        if not isinstance(line, Mapping):
            continue
        speaker = str(line.get("speaker") or "")
        spoken, is_phonemes = speech_text(line)
        lines.append(
            {
                "v": voices.get(speaker, ""),
                "t": spoken,
                "ph": is_phonemes,
                "p": stitch_mod.clamp_pause(line.get("pause_after_ms", 300)),
            }
        )
    payload: dict[str, Any] = {
        "schema_version": int(script.get("schema_version") or 1),
        "render_generation": RENDER_GENERATION,
        "accent_set": str(accent_set or script.get("accent_set") or "uk").lower(),
        "lines": lines,
    }
    identity = tts_identity(config)
    if identity:
        payload["tts"] = identity
    return hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()[:16]


def line_cache_key(
    voice: str,
    text: str,
    speed: float = 1.0,
    *,
    is_phonemes: bool = False,
    config: Mapping[str, Any] | None = None,
) -> str:
    """Cache key for one synthesized line.

    The language is not a separate term because it is a pure function of ``voice``
    (:func:`lang_for_voice`); :data:`RENDER_GENERATION` is, because it is what retires the
    lines synthesized before British voices were given British phonology.

    The provider identity is the third term that is not about the text, and re-keying the
    stitched render without it fixes nothing: Kokoro's voice ids are engine-independent, so
    every line of a re-keyed script would still hit ``media/tts-lines/`` and the new render
    would be the old provider's audio, stitched again, under a new name. It is appended
    rather than inserted, and omitted when empty, so the shipped default's keys are exactly
    the ones already on disk.
    """
    raw = f"{RENDER_GENERATION}\x00{voice}\x00{text}\x00{speed:.2f}\x00{int(is_phonemes)}"
    identity = tts_identity(config)
    if identity:
        raw = f"{raw}\x00{identity}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


# --------------------------------------------------------------------------- paths

def media_root() -> Path:
    from bandready.config import get_settings

    return get_settings().media_dir


def listening_audio_paths(audio_hash: str) -> tuple[Path, Path]:
    """``(wav_path, timing_path)`` for a rendered script."""
    root = media_root() / "listening"
    return root / f"{audio_hash}.wav", root / f"{audio_hash}.timing.json"


def line_cache_path(key: str) -> Path:
    return media_root() / "tts-lines" / f"{key}.wav"


def cached_render(audio_hash: str) -> dict[str, Any] | None:
    """Return the cached render descriptor, or ``None`` when the WAV is gone.

    Re-registers the ``media_files`` row on the way out. The WAV can legitimately outlive
    its row — LRU eviction that unlinked the row but not the file, a media directory
    restored from backup, a reset database over a warm cache — and
    ``listening_scripts.audio_hash`` is a foreign key onto that row. Without this, every
    caller that merely *observes* a cache hit and then links the script (both the
    per-script and whole-test render routes do) fails the FK at flush and returns a 500
    that no amount of retrying clears, because the retry hits the same cache.
    ``register_media`` is an upsert and never raises, so this is free when the row exists.
    """
    wav_path, timing_path = listening_audio_paths(audio_hash)
    if not wav_path.exists() or wav_path.stat().st_size == 0:
        return None
    register_media(
        audio_hash, "listening_render", f"listening/{audio_hash}.wav",
        wav_path.stat().st_size,
    )
    timing: dict[str, Any] = {}
    if timing_path.exists():
        try:
            timing = json.loads(timing_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):  # pragma: no cover — corrupt sidecar
            timing = {}
    return {
        "audio_hash": audio_hash,
        "path": str(wav_path),
        "bytes": wav_path.stat().st_size,
        "duration_ms": int(timing.get("duration_ms") or 0),
        "sample_rate": int(timing.get("sample_rate") or stitch_mod.TARGET_RATE),
        "lines": timing.get("lines") or [],
        "cached": True,
    }


def load_timing(audio_hash: str) -> dict[str, Any] | None:
    _, timing_path = listening_audio_paths(audio_hash)
    if not timing_path.exists():
        return None
    try:
        return json.loads(timing_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):  # pragma: no cover
        return None


# --------------------------------------------------------------------------- providers

def tts_config(override: Mapping[str, Any] | None = None) -> dict[str, Any]:
    if override:
        return dict(override)
    from bandready.settings_store import get_slot

    return get_slot("tts")


def is_mock_tts(cfg: Mapping[str, Any]) -> bool:
    """Will this slot produce silence rather than reach an engine?

    Delegated to :func:`bandready.providers.transport.resolve_engine` so that "is it the
    mock?" and "which engine runs?" cannot disagree — they used to, because this read the
    slot's stored ``engine`` and the dispatcher read something else.
    """
    from bandready.providers import transport

    return transport.resolve_engine(cfg, "tts") == "mock"


def _mock_pcm(text: str, rate: int = stitch_mod.TARGET_RATE) -> tuple[np.ndarray, int]:
    """Silence of a plausible spoken duration (07 §10's chars/15 heuristic)."""
    ms = max(400, stitch_mod.estimate_speech_ms(text))
    return np.zeros(stitch_mod.ms_to_samples(ms, rate), dtype=np.float32), rate


def _kokoro_paths(cfg: Mapping[str, Any]) -> tuple[Path, Path]:
    from bandready.config import get_settings

    models = get_settings().models_dir / "kokoro"
    model_path = Path(str(cfg.get("model_path") or "") or models / "kokoro-v1.0.onnx")
    voices_path = Path(str(cfg.get("voices_path") or "") or models / "voices-v1.0.bin")
    return model_path, voices_path


def _kokoro(cfg: Mapping[str, Any]) -> Any:
    model_path, voices_path = _kokoro_paths(cfg)
    key = (str(model_path), str(voices_path))
    cached = _kokoro_cache.get(key)
    if cached is not None:
        return cached
    try:
        from kokoro_onnx import Kokoro  # type: ignore[import-not-found]
    except Exception as exc:
        raise ApiError(
            503,
            "provider_error",
            "the local Kokoro TTS engine is not installed; install the voice extra or "
            f"point Settings at an OpenAI-compatible TTS endpoint ({exc})",
        ) from exc
    if not model_path.exists() or not voices_path.exists():
        raise ApiError(
            503,
            "provider_error",
            f"Kokoro model files are missing (expected {model_path.name} and "
            f"{voices_path.name} under {model_path.parent}); download them from the "
            "Models settings page before rendering listening audio",
        )
    engine = Kokoro(str(model_path), str(voices_path))
    _kokoro_cache[key] = engine
    return engine


async def _synthesize_kokoro(
    text: str, voice: str, cfg: Mapping[str, Any], *, is_phonemes: bool = False
) -> tuple[np.ndarray, int]:
    engine = _kokoro(cfg)
    speed = float(cfg.get("speed") or 1.0)
    lang = lang_for_voice(voice)

    def run() -> tuple[np.ndarray, int]:
        samples, rate = engine.create(
            text, voice=voice, speed=speed, lang=lang, is_phonemes=is_phonemes
        )
        return np.asarray(samples, dtype=np.float32), int(rate)

    try:
        return await asyncio.to_thread(run)
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(
            502, "provider_error", f"Kokoro failed to synthesize a line: {exc}"
        ) from exc


async def _synthesize_openai(
    text: str, voice: str, cfg: Mapping[str, Any]
) -> tuple[np.ndarray, int]:
    import httpx
    import soundfile as sf

    base_url = str(cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ApiError(
            400, "provider_error", "the configured TTS provider has no base URL"
        )
    headers = {"Content-Type": "application/json"}
    api_key = str(cfg.get("api_key") or "")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    body = {
        "model": str(cfg.get("model") or "tts-1"),
        "voice": voice,
        "input": text,
        "response_format": "wav",
        "speed": float(cfg.get("speed") or 1.0),
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{base_url}/audio/speech", json=body, headers=headers
            )
    except httpx.HTTPError as exc:
        raise ApiError(502, "provider_error", f"the TTS endpoint is unreachable: {exc}") from exc
    if response.status_code >= 400:
        raise ApiError(
            502,
            "provider_error",
            f"the TTS endpoint returned {response.status_code}: {response.text[:200]}",
        )
    try:
        data, rate = sf.read(io.BytesIO(response.content), dtype="float32", always_2d=False)
    except Exception as exc:
        raise ApiError(
            502, "provider_error", f"the TTS endpoint returned audio we cannot decode: {exc}"
        ) from exc
    return stitch_mod.to_mono(data), int(rate)


async def synthesize_line(
    text: str,
    voice: str,
    cfg: Mapping[str, Any] | None = None,
    *,
    is_phonemes: bool = False,
) -> tuple[np.ndarray, int]:
    """``(pcm float32 mono, sample_rate)`` for one line — no caching, no stitching.

    ``text`` is the **spoken** string (see :func:`speech_text`), not the authored one.
    ``is_phonemes`` is Kokoro-only; an OpenAI-compatible endpoint has no IPA input, so a
    phonemized line falls back to speaking the IPA string, which is why the field is
    documented as a local-engine escape hatch rather than a portable one.
    """
    from bandready.providers import transport

    config = tts_config(cfg)
    clean = (text or "").strip()
    if not clean:
        return np.zeros(0, dtype=np.float32), stitch_mod.TARGET_RATE
    # `transport.resolve_engine`, not `config["engine"]`: the stored engine is a stale copy
    # of an answer the preset already gives, and reading it here is how "TTS: OpenRouter"
    # kept synthesizing locally on a cold cache.
    engine = transport.resolve_engine(config, "tts")
    if engine == "mock":
        return _mock_pcm(clean)
    if engine == "kokoro_onnx":
        return await _synthesize_kokoro(clean, voice, config, is_phonemes=is_phonemes)
    if engine == "faster_whisper":  # pragma: no cover — a mis-set slot, not a TTS engine
        raise ApiError(
            422,
            "validation_error",
            "the text-to-speech provider resolves to a speech-to-text engine "
            f"({engine}); choose a TTS provider in Settings",
        )
    return await _synthesize_openai(clean, voice, config)


async def _synthesize_cached(
    text: str,
    voice: str,
    cfg: Mapping[str, Any],
    *,
    use_cache: bool = True,
    is_phonemes: bool = False,
) -> tuple[np.ndarray, int]:
    """Per-line cache (07 §3 step 2) so an edited script re-renders only what changed.

    ``use_cache=False`` skips the *read* and still writes: a forced re-render is a request
    for fresh audio, not a request to leave the next render cold. The entry it writes is
    the one the current provider produced, under the current provider's key.
    """
    clean = (text or "").strip()
    if not clean:
        return np.zeros(0, dtype=np.float32), stitch_mod.TARGET_RATE
    key = line_cache_key(
        voice, clean, float(cfg.get("speed") or 1.0), is_phonemes=is_phonemes, config=cfg
    )
    path = line_cache_path(key)
    if use_cache and path.exists() and path.stat().st_size > 0:
        try:
            return stitch_mod.read_wav(path)
        except Exception:  # noqa: BLE001 — a corrupt cache entry is not fatal
            _log.warning("discarding unreadable TTS line cache entry %s", path.name)
    pcm, rate = await synthesize_line(clean, voice, cfg, is_phonemes=is_phonemes)
    if pcm.size:
        try:
            size = stitch_mod.write_wav(path, pcm, rate)
            register_media(key, "tts_line", f"tts-lines/{key}.wav", size)
        except OSError as exc:  # pragma: no cover — disk full / permissions
            _log.warning("could not cache TTS line %s: %s", key, exc)
    return pcm, rate


# --------------------------------------------------------------------------- media rows

def register_media(
    file_hash: str, kind: str, rel_path: str, size_bytes: int, *, pinned: bool = False
) -> None:
    """Upsert a ``media_files`` row (11 §9). Best effort — never fails a render."""
    try:
        from sqlalchemy import text as sql

        from bandready.db.engine import session_scope

        with session_scope() as session:
            session.execute(
                sql(
                    "INSERT INTO media_files (hash, kind, rel_path, bytes, pinned) "
                    "VALUES (:hash, :kind, :rel_path, :bytes, :pinned) "
                    "ON CONFLICT(hash) DO UPDATE SET "
                    "  rel_path = excluded.rel_path, bytes = excluded.bytes, "
                    "  last_access_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
                ),
                {
                    "hash": file_hash,
                    "kind": kind,
                    "rel_path": rel_path,
                    "bytes": int(size_bytes),
                    "pinned": 1 if pinned else 0,
                },
            )
    except Exception as exc:  # noqa: BLE001 — the cache file is the source of truth
        _log.warning("could not register media file %s (%s): %s", file_hash, kind, exc)


def touch_media(file_hash: str) -> None:
    """Bump ``last_access_at`` so LRU eviction keeps what the learner is playing."""
    try:
        from sqlalchemy import text as sql

        from bandready.db.engine import session_scope

        with session_scope() as session:
            session.execute(
                sql(
                    "UPDATE media_files SET last_access_at = "
                    "strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE hash = :hash"
                ),
                {"hash": file_hash},
            )
    except Exception as exc:  # noqa: BLE001
        _log.debug("could not touch media file %s: %s", file_hash, exc)


def _link_script_audio(script_id: str | None, audio_hash: str) -> None:
    if not script_id:
        return
    try:
        from sqlalchemy import text as sql

        from bandready.db.engine import session_scope

        with session_scope() as session:
            session.execute(
                sql("UPDATE listening_scripts SET audio_hash = :h WHERE id = :id"),
                {"h": audio_hash, "id": script_id},
            )
    except Exception as exc:  # noqa: BLE001
        _log.warning("could not link script %s to audio %s: %s", script_id, audio_hash, exc)


# --------------------------------------------------------------------------- rendering

def _progress(job_id: str | None, pct: int, detail: str) -> None:
    if not job_id:
        return
    try:
        from bandready.server.jobs import job_manager

        job_manager.set_progress(job_id, pct, detail)
    except Exception as exc:  # noqa: BLE001 — progress must never break a render
        _log.debug("progress update failed: %s", exc)


async def render_script(
    script: Mapping[str, Any],
    *,
    accent_set: str | None = None,
    script_id: str | None = None,
    job_id: str | None = None,
    force: bool = False,
    config: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Render one script part to a cached WAV; returns the render descriptor.

    Idempotent: a second call with identical audio content returns the cached result
    without touching the TTS engine.
    """
    lines: Sequence[Mapping[str, Any]] = [
        line for line in (script.get("lines") or []) if isinstance(line, Mapping)
    ]
    if not lines:
        raise ApiError(422, "validation_error", "this script has no lines to render")

    accent = str(accent_set or script.get("accent_set") or "uk").lower()
    # NB: the raw `accent_set` (possibly None) is what drives voice resolution, so a
    # mixed-accent authored script keeps its cast; `accent` is only the label.
    #
    # The config is resolved *before* the hash, not after: `config` is an override, and
    # hashing against the live slot while synthesizing with the override would file the
    # override's audio under the live slot's name — the same class of mismatch this whole
    # change exists to remove.
    cfg = tts_config(config)
    audio_hash = script_audio_hash(script, accent_set, config=cfg)

    if not force:
        hit = cached_render(audio_hash)
        if hit is not None:
            _progress(job_id, 100, "audio already rendered")
            touch_media(audio_hash)
            _link_script_audio(script_id, audio_hash)
            hit.update({"accent_set": accent, "script_id": script_id})
            return hit

    voices = resolve_voices(script, accent_set)
    default_voice = VOICE_MAP.get(accent, VOICE_MAP["uk"])["narrator"]

    pieces: list[stitch_mod.Piece] = []
    total = len(lines)
    for index, line in enumerate(lines):
        speaker = str(line.get("speaker") or "")
        voice = voices.get(speaker) or default_voice
        spoken, is_phonemes = speech_text(line)
        for warning in speech_warnings(str(line.get("text") or "")):
            _log.warning(
                "listening script %s line %d: %r — %s",
                script_id or "(unsaved)", index, warning["found"], warning["advice"],
            )
        # `force` has to reach *this* layer to mean anything. Skipping `cached_render`
        # alone re-stitched the per-line cache, which is the previous provider's audio
        # under a new name — the escape hatch defeated by the layer below it.
        pcm, rate = await _synthesize_cached(
            spoken, voice, cfg, use_cache=not force, is_phonemes=is_phonemes
        )
        # Trim *after* the cache read, so the stored line stays whatever the engine
        # produced and the trim policy can change without re-synthesizing anything.
        pcm = stitch_mod.trim_edges(pcm, rate)
        pieces.append((pcm, rate, stitch_mod.clamp_pause(line.get("pause_after_ms", 300))))
        _progress(
            job_id,
            int(5 + 80 * (index + 1) / total),
            f"synthesizing line {index + 1} of {total}",
        )

    _progress(job_id, 88, "stitching audio")
    result = stitch_mod.stitch(pieces)
    if result.audio.size == 0:
        raise ApiError(502, "provider_error", "the TTS provider returned no audio")

    _progress(job_id, 94, "writing the audio cache")
    wav_path, timing_path = listening_audio_paths(audio_hash)
    size = stitch_mod.write_wav(wav_path, result.audio, result.sample_rate)
    document = result.timing_document()
    document.update(
        {
            "audio_hash": audio_hash,
            "accent_set": accent,
            "accent_label": accent_label(accent),
            "script_id": script_id,
            "voices": voices,
            "part": script.get("part"),
        }
    )
    stitch_mod.write_timing(timing_path, document)
    register_media(audio_hash, "listening_render", f"listening/{audio_hash}.wav", size)
    _link_script_audio(script_id, audio_hash)
    _progress(job_id, 100, "audio ready")

    _log.info(
        "rendered listening script %s -> %s (%.1fs, %d lines)",
        script_id or "(unsaved)", audio_hash, result.duration_ms / 1000.0, total,
    )
    return {
        "audio_hash": audio_hash,
        "path": str(wav_path),
        "bytes": size,
        "duration_ms": result.duration_ms,
        "sample_rate": result.sample_rate,
        "lines": [
            {
                "index": t.index,
                "start_ms": t.start_ms,
                "end_ms": t.end_ms,
                "pause_after_ms": t.pause_after_ms,
            }
            for t in result.timings
        ],
        "accent_set": accent,
        "script_id": script_id,
        "cached": False,
    }

"""Offline dictionary — bundled WordNet (ruling R2-20, 08 §3.4, 18 §4.6).

The reading double-click popover (06 §5) and the vocab suggestion inbox (08 §3.2) need a
definition *instantly* and *offline*. No LLM is involved: the `wn` package plus an English
WordNet lexicon answers in single-digit milliseconds once the lexicon is installed.

Three properties this module has to guarantee:

1. **Never blocks the event loop.** `wn` is synchronous SQLite; the first install parses a
   ~35 MB LMF file into a database and takes minutes. Installing therefore happens on a
   worker thread and a lookup made while it runs answers immediately with
   ``{"available": false, "status": "installing"}`` — never a spinner that hangs the popover.
2. **Never errors when offline.** A missing lexicon and a dead network are ordinary states,
   not failures: the route always returns 200 with ``available: false`` so the UI can offer
   the online LLM fallback (``POST /api/v1/vocab/lookup``).
3. **Uses whatever is already on disk.** We look in ``$BANDREADY_WORDNET_DIR``, then
   ``<data_dir>/wordnet``, then `wn`'s own default (``~/.wn_data``) — so a developer, a CI
   image, or a packaged installer that pre-seeded the data (13-packaging-distribution.md)
   costs the user no download at all.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

_log = logging.getLogger("bandready.dictionary")

# English WordNet projects known to `wn`, newest first. `_candidate_specs()` re-derives
# this from the live project index so a newer edition is picked up automatically; this is
# the fallback when the index cannot be read.
FALLBACK_SPECS: tuple[str, ...] = ("oewn:2024", "oewn:2023", "ewn:2020", "omw-en:1.4")

ENGLISH_PROJECT_IDS = ("oewn", "ewn", "omw-en")

MAX_SENSES = 12
MAX_EXAMPLES = 4
MAX_SYNONYMS = 8

POS_LABELS = {
    "n": "noun",
    "v": "verb",
    "a": "adjective",
    "s": "adjective",
    "r": "adverb",
    "t": "phrase",
    "c": "conjunction",
    "p": "adposition",
    "x": "other",
    "u": "unknown",
}

# Cheap English de-inflection used when Morphy is unavailable (no lexicon-specific
# exception map needed — WordNet itself rejects anything that is not a real lemma).
_SUFFIX_RULES: tuple[tuple[str, str], ...] = (
    ("ies", "y"), ("ied", "y"), ("ier", "y"), ("iest", "y"),
    ("sses", "ss"), ("ches", "ch"), ("shes", "sh"), ("xes", "x"), ("zes", "z"),
    ("ves", "f"), ("men", "man"),
    ("ing", ""), ("ing", "e"),
    ("ed", ""), ("ed", "e"),
    ("est", ""), ("est", "e"),
    ("er", ""), ("er", "e"),
    ("es", ""), ("s", ""),
)

_WORD_RE = re.compile(r"^[A-Za-z][A-Za-z .'\-]{0,63}$")


# --------------------------------------------------------------------------- state

class _State:
    """Everything mutable lives here so `reset()` is one assignment (tests)."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.data_dir: Path | None = None
        self.lexicon: str | None = None
        self.status: str = "unknown"  # unknown|ready|installing|unavailable
        self.detail: str | None = None
        self.wordnet: Any = None
        self.install_thread: threading.Thread | None = None
        self.install_started_at: float | None = None
        self.probe_failed: bool = False


_state = _State()


def reset() -> None:
    """Drop every cached handle — used by tests and after a data-dir switch."""
    global _state
    _state = _State()


# --------------------------------------------------------------------------- locations

def candidate_dirs() -> list[Path]:
    """Where a WordNet database may live, in preference order."""
    dirs: list[Path] = []
    env = os.environ.get("BANDREADY_WORDNET_DIR", "").strip()
    if env:
        dirs.append(Path(env).expanduser())
    try:
        from bandready.config import get_settings

        dirs.append(get_settings().data_dir / "wordnet")
    except Exception as exc:  # noqa: BLE001 — config is optional this early
        _log.debug("could not resolve the app data dir for WordNet: %s", exc)
    dirs.append(Path.home() / ".wn_data")
    out: list[Path] = []
    for d in dirs:
        if d not in out:
            out.append(d)
    return out


def _use_dir(path: Path) -> None:
    """Point `wn` at `path` and invalidate any Wordnet handle bound to the old one."""
    import wn

    if _state.data_dir == path and _state.wordnet is not None:
        return
    path.mkdir(parents=True, exist_ok=True)
    wn.config.data_directory = str(path)
    _state.data_dir = path
    _state.wordnet = None


def _english_lexicon_in(path: Path) -> str | None:
    """``"oewn:2024"`` if that directory already holds an English lexicon, else None."""
    import wn

    if not (path / "wn.db").exists():
        return None
    try:
        _use_dir(path)
        lexicons = wn.lexicons()
    except Exception as exc:  # noqa: BLE001 — a corrupt db must not break lookups
        _log.warning("WordNet database at %s is unusable: %s", path, exc)
        return None
    english = [lx for lx in lexicons if getattr(lx, "language", "") in ("en", "eng")]
    if not english:
        return None
    english.sort(key=lambda lx: _version_key(getattr(lx, "version", "")), reverse=True)
    best = english[0]
    return f"{best.id}:{best.version}"


def _version_key(version: str) -> tuple[int, int]:
    """``"2025+"`` > ``"2025"`` > ``"2024"``; non-numeric versions sort last."""
    text = str(version or "")
    plus = 1 if text.endswith("+") else 0
    digits = re.sub(r"[^0-9]", "", text.replace(".", ""))
    return (int(digits) if digits else -1, plus)


def _candidate_specs() -> list[str]:
    """Installable English lexicons, newest first."""
    import wn

    specs: list[str] = []
    try:
        for project in wn.projects():
            if project.get("language") not in ("en", "eng"):
                continue
            if project.get("id") not in ENGLISH_PROJECT_IDS:
                continue
            specs.append(f"{project['id']}:{project['version']}")
    except Exception as exc:  # noqa: BLE001 — shipped index only, no network
        _log.debug("could not read the wn project index: %s", exc)
    specs.sort(key=lambda s: _version_key(s.split(":", 1)[-1]), reverse=True)
    for fallback in FALLBACK_SPECS:
        if fallback not in specs:
            specs.append(fallback)
    return specs


# --------------------------------------------------------------------------- readiness

def _probe() -> bool:
    """Bind to the first directory that already holds an English lexicon."""
    for path in candidate_dirs():
        lexicon = _english_lexicon_in(path)
        if lexicon:
            _state.lexicon = lexicon
            _state.status = "ready"
            _state.detail = f"{lexicon} at {path}"
            return True
    _state.probe_failed = True
    if _state.status not in ("installing",):
        _state.status = "unavailable"
        _state.detail = "no English WordNet lexicon is installed yet"
    return False


def is_ready() -> bool:
    """True when a lookup can be answered right now. Cheap after the first call."""
    with _state.lock:
        if _state.status == "ready":
            return True
        if _state.status == "installing":
            return False
        if _state.probe_failed and _state.status == "unavailable":
            return False
        return _probe()


def status() -> dict[str, Any]:
    """The shape ``GET /api/v1/dictionary`` returns (and every lookup embeds)."""
    ready = is_ready()
    return {
        "available": ready,
        "status": _state.status,
        "lexicon": _state.lexicon,
        "detail": _state.detail,
        "data_dir": str(_state.data_dir) if _state.data_dir else None,
        "source": "wordnet",
    }


# --------------------------------------------------------------------------- install

def install_lexicon(spec: str | None = None) -> str:
    """Download + add an English lexicon. **Blocking** — call it on a worker thread.

    Returns the installed lexicon spec, or raises the last download error.
    """
    import wn

    target = None
    for path in candidate_dirs():
        try:
            path.mkdir(parents=True, exist_ok=True)
            probe = path / ".bandready-write-test"
            probe.touch()
            probe.unlink()
            target = path
            break
        except OSError:
            continue
    if target is None:  # pragma: no cover — read-only home
        raise RuntimeError("no writable directory for the WordNet database")

    with _state.lock:
        _use_dir(target)

    specs = [spec] if spec else _candidate_specs()
    last_error: Exception | None = None
    for candidate in specs:
        for source in _sources_for(candidate):
            try:
                _log.info("downloading WordNet %s from %s into %s", candidate, source, target)
                wn.download(source, progress_handler=None)
            except Exception as exc:  # noqa: BLE001 — offline / 503 / parse error
                last_error = exc
                _log.warning("WordNet source %s failed: %s", source, exc)
                continue
            installed = _english_lexicon_in(target)
            if installed:
                _log.info("WordNet lexicon %s installed", installed)
                return installed
    raise last_error or RuntimeError("no English WordNet lexicon could be installed")


def _sources_for(spec: str) -> list[str]:
    """The project spec plus every mirror URL it declares.

    `wn.download` only falls through to the next mirror on a *transport* error — an HTTP
    503 from the primary host aborts the whole download (upstream bug). Passing the mirror
    URLs explicitly is what makes the fallback actually work; en-word.net 503s regularly
    while the GitHub release mirror stays up.
    """
    import wn

    sources = [spec]
    try:
        for project in wn.projects():
            if f"{project['id']}:{project['version']}" != spec:
                continue
            for url in project.get("resource_urls") or []:
                if url not in sources:
                    sources.append(url)
    except Exception as exc:  # noqa: BLE001
        _log.debug("could not expand %s into mirror urls: %s", spec, exc)
    return sources


def start_install(spec: str | None = None) -> dict[str, Any]:
    """Kick the install off on a daemon thread and return immediately."""
    with _state.lock:
        if _state.status == "ready":
            return status()
        thread = _state.install_thread
        if thread is not None and thread.is_alive():
            return status()
        _state.status = "installing"
        _state.detail = "downloading the English WordNet lexicon…"
        _state.install_started_at = time.time()
        _state.probe_failed = False

        def run() -> None:
            try:
                lexicon = install_lexicon(spec)
            except Exception as exc:  # noqa: BLE001 — offline is an ordinary outcome
                with _state.lock:
                    _state.status = "unavailable"
                    _state.detail = (
                        "the WordNet lexicon could not be downloaded "
                        f"({type(exc).__name__}) — lookups need one online install"
                    )
                    _state.probe_failed = True
                return
            with _state.lock:
                _state.lexicon = lexicon
                _state.status = "ready"
                _state.detail = f"{lexicon} installed"
                _state.wordnet = None

        _state.install_thread = threading.Thread(
            target=run, name="wordnet-install", daemon=True
        )
        _state.install_thread.start()
    return status()


# --------------------------------------------------------------------------- lookup

def _wordnet() -> Any:
    import wn

    if _state.wordnet is None:
        lemmatizer = None
        try:
            from wn.morphy import morphy

            lemmatizer = morphy
        except Exception as exc:  # noqa: BLE001 — optional
            _log.debug("wn.morphy is unavailable: %s", exc)
        _state.wordnet = wn.Wordnet(lexicon=_state.lexicon, lemmatizer=lemmatizer)
    return _state.wordnet


def _variants(word: str) -> list[str]:
    """Surface form first, then cheap de-inflections (Morphy usually gets there first)."""
    base = word.strip()
    out = [base]
    lowered = base.lower()
    if lowered != base:
        out.append(lowered)
    for suffix, replacement in _SUFFIX_RULES:
        if lowered.endswith(suffix) and len(lowered) - len(suffix) >= 2:
            candidate = lowered[: -len(suffix)] + replacement
            if candidate and candidate not in out:
                out.append(candidate)
    # doubled consonant: "running" -> "run", "bigger" -> "big"
    for stem in list(out):
        if len(stem) > 3 and stem[-1] == stem[-2] and stem[-1] not in "aeiou":
            trimmed = stem[:-1]
            if trimmed not in out:
                out.append(trimmed)
    return out[:12]


def _sense_payload(synset: Any, headword: str) -> dict[str, Any]:
    try:
        definition = synset.definition() or ""
    except Exception:  # noqa: BLE001
        definition = ""
    try:
        examples = [str(e) for e in (synset.examples() or [])][:MAX_EXAMPLES]
    except Exception:  # noqa: BLE001
        examples = []
    try:
        lemmas = [str(x) for x in (synset.lemmas() or [])]
    except Exception:  # noqa: BLE001
        lemmas = []
    synonyms = [lm for lm in lemmas if lm.lower() != headword.lower()][:MAX_SYNONYMS]
    pos = getattr(synset, "pos", None) or "u"
    return {
        "pos": POS_LABELS.get(str(pos), str(pos)),
        "pos_code": str(pos),
        "definition": definition,
        "examples": examples,
        "synonyms": synonyms,
    }


def _not_available(word: str) -> dict[str, Any]:
    payload = status()
    payload.update({"word": word, "lemma": word.lower(), "found": False, "senses": [], "entries": []})
    return payload


def lookup(word: str, *, auto_install: bool = True) -> dict[str, Any]:
    """``{word, lemma, found, available, senses[], entries[]}`` — never raises.

    `senses` is 18 §4.6's key; `entries` is the same list under 08's name, so both
    consumers work without a second round of doc reconciliation.
    """
    term = (word or "").strip()
    if not term or not _WORD_RE.match(term):
        payload = _not_available(term)
        payload["detail"] = "not a lookupable word"
        return payload

    if not is_ready():
        if auto_install and _state.status != "installing":
            start_install()
        return _not_available(term)

    try:
        wordnet = _wordnet()
    except Exception as exc:  # noqa: BLE001 — corrupt db, unreadable file …
        _log.warning("WordNet handle could not be opened: %s", exc)
        with _state.lock:
            _state.status = "unavailable"
            _state.detail = f"WordNet database error: {type(exc).__name__}"
            _state.probe_failed = True
        return _not_available(term)

    lemma = term.lower()
    synsets: list[Any] = []
    seen: set[str] = set()
    for variant in _variants(term):
        try:
            words = wordnet.words(variant)
        except Exception as exc:  # noqa: BLE001
            _log.debug("WordNet lookup of %r failed: %s", variant, exc)
            words = []
        if not words:
            continue
        lemma = str(words[0].lemma())
        for entry in words:
            for synset in entry.synsets():
                key = str(getattr(synset, "id", "")) or repr(synset)
                if key in seen:
                    continue
                seen.add(key)
                synsets.append(synset)
        if synsets:
            break

    senses = [_sense_payload(s, lemma) for s in synsets[:MAX_SENSES]]
    senses = [s for s in senses if s["definition"]]

    payload = status()
    payload.update(
        {
            "word": term,
            "lemma": lemma,
            "found": bool(senses),
            "senses": senses,
            "entries": senses,
        }
    )
    if not senses:
        payload["detail"] = f"{term!r} is not in WordNet — try the online lookup"
    return payload

"""Pronunciation assessment **v1** — 09-pronunciation-assessment.md §3.

v1 ships **no new models**. It combines:

1. an offline re-transcription pass over the per-turn WAVs in word-timestamp mode
   (faster-whisper / a configured STT provider), giving
   ``{word, t_start_ms, t_end_ms, confidence}``;
2. a low-confidence word list (``confidence < 0.55``, ≥ 4 chars, minus a filler stoplist);
3. one extra non-streaming LLM call that flags *likely mispronunciations* from transcript
   anomalies (verbatim prompt from 09 §3.3);
4. fluency proxies computed from the word timings (speech rate, pause profile).

The v2 GOP pipeline (ONNX wav2vec2 + CTC forced alignment) is deliberately **not** here.

Accent policy (09 §0): these scores measure intelligibility, never proximity to any
accent. ``ACCENT_NOTICE`` is the fixed copy every pronunciation screen shows.

Storage: ``pron_scores`` rows, ``score`` INTEGER 0–100 (11 §7). v1 derives the integer
from ASR confidence and labels it ``method='proxy-v1'``; 09 §6's ``pron_signals_json``
still serialises ``score: null`` for proxy-v1 because a confidence is not a GOP.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import text
from ulid import ULID

_log = logging.getLogger("bandready.pron.analyze")

METHOD = "proxy-v1"

ACCENT_NOTICE = (
    "IELTS accepts every accent. These scores measure how clearly each sound comes "
    "across — not how British or American you sound."
)

LOW_CONFIDENCE = 0.55
MIN_WORD_LEN = 4
MAX_FLAGGED = 8

# Green >= 80, amber 55-79, red < 55 (09 §4.5).
BAND_GREEN = 80
BAND_AMBER = 55

# Always-low-confidence tokens that say nothing about pronunciation (09 §3.2).
STOPLIST: frozenset[str] = frozenset(
    {
        "uh", "um", "erm", "er", "ah", "eh", "hmm", "mm", "mhm", "yeah", "yep", "nope",
        "okay", "ok", "like", "well", "so", "oh", "huh", "right", "you know", "i mean",
    }
)

WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z'’\-]*")

# 09 §3.3 — verbatim prompt template (prompts/pron/v1_flag_words.txt).
FLAG_PROMPT = """You review an IELTS speaking transcript for words the candidate likely
MISPRONOUNCED. You cannot hear audio. Use only transcript evidence:
- homophone/near-word substitutions that break meaning in context
  ("she made a good live" -> likely "life")
- words the ASR rendered inconsistently across turns ("developt",
  "devloped", "developed" for the same intended word)
- the LOW-CONFIDENCE list below (ASR was unsure); include one only if
  context makes a mispronunciation plausible, not mere rarity
Never flag a word for being informal, misspelled by the ASR alone, or
part of a proper noun. Accent is NOT mispronunciation.

TRANSCRIPT (candidate turns only, with turn indices):
{candidate_turns}

LOW-CONFIDENCE WORDS: {low_conf_words_json}

Output only JSON:
{{"flagged": [{{"word": "...", "turn_index": 3, "reason": "...",
             "likely_intended": "..." }}]}}
Maximum 8 entries. Empty list if nothing is clearly flaggable."""

ProgressFn = Callable[[float, str], None]


def _noop(_pct: float, _detail: str) -> None:
    return None


# --------------------------------------------------------------------------------------
# Value objects
# --------------------------------------------------------------------------------------


@dataclass(slots=True)
class WordScore:
    word: str
    word_index: int
    score: int | None = None
    confidence: float | None = None
    t_start_ms: int | None = None
    t_end_ms: int | None = None
    expected_ipa: str | None = None
    heard_approx: str | None = None
    issues: list[str] = field(default_factory=list)
    turn_index: int | None = None
    reason: str | None = None
    likely_intended: str | None = None

    def as_wire(self) -> dict[str, Any]:
        return {
            "word": self.word,
            "word_index": self.word_index,
            "t_start_ms": self.t_start_ms,
            "t_end_ms": self.t_end_ms,
            "score": self.score,
            "confidence": self.confidence,
            "expected_ipa": self.expected_ipa,
            "heard_approx": self.heard_approx,
            "phones": None,  # v2 only
            "issues": self.issues or None,
            "reason": self.reason,
            "likely_intended": self.likely_intended,
            "skipped": self.score is None,
            "level": (
                None
                if self.score is None
                else "good" if self.score >= BAND_GREEN else "warn" if self.score >= BAND_AMBER else "poor"
            ),
        }


@dataclass(slots=True)
class TurnPronResult:
    method: str = METHOD
    words: list[WordScore] = field(default_factory=list)
    intonation_flatness: float | None = None  # v2
    stress_accuracy: float | None = None  # v2
    gop_mean: int | None = None  # v2
    fluency: dict[str, Any] = field(default_factory=dict)
    turn_index: int | None = None
    turn_id: str | None = None
    audio_path: str | None = None
    transcript: str = ""

    def as_wire(self) -> dict[str, Any]:
        return {
            "method": self.method,
            "turn_index": self.turn_index,
            "turn_id": self.turn_id,
            "transcript": self.transcript,
            "words": [w.as_wire() for w in self.words],
            "intonation_flatness": self.intonation_flatness,
            "stress_accuracy": self.stress_accuracy,
            "gop_mean": self.gop_mean,
            "fluency": self.fluency or None,
        }


# --------------------------------------------------------------------------------------
# Stage 1 — word-level transcription
# --------------------------------------------------------------------------------------

_whisper_model: Any = None
_whisper_failed = False


def _stt_settings() -> dict[str, Any]:
    try:
        from bandready.settings_store import get_slot

        return dict(get_slot("stt") or {})
    except Exception:  # noqa: BLE001 — settings not ready
        return {}


def _load_whisper() -> Any:
    """faster-whisper model, cached. Never raises; returns ``None`` when unavailable."""
    global _whisper_model, _whisper_failed
    if _whisper_model is not None or _whisper_failed:
        return _whisper_model
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception:  # noqa: BLE001 — optional voice extra
        _whisper_failed = True
        _log.info("faster-whisper is not installed — pronunciation v1 runs transcript-only")
        return None

    cfg = _stt_settings()
    size = str(cfg.get("model") or cfg.get("model_size") or "small")
    for local_only in (True, False):
        try:
            _whisper_model = WhisperModel(
                size, device="auto", compute_type="int8", local_files_only=local_only
            )
            return _whisper_model
        except Exception as exc:  # noqa: BLE001
            _log.debug("faster-whisper load failed (local_files_only=%s): %s", local_only, exc)
    _whisper_failed = True
    _log.warning("no usable local STT model — pronunciation v1 falls back to the stored transcript")
    return None


def transcribe_words(wav_path: Path) -> tuple[list[dict[str, Any]], str]:
    """``([{word, t_start_ms, t_end_ms, confidence}], transcript)`` for one WAV.

    Tries a shared STT provider first (owned by the voice module), then faster-whisper.
    Returns ``([], "")`` when neither can run — the caller then degrades to LLM-only
    flagging over the stored transcript, exactly as 09 §3.1 prescribes.
    """
    try:  # pragma: no cover — provider module is owned by the voice agent
        from bandready.providers.stt import transcribe_words as provider_words  # type: ignore

        words, transcript = provider_words(str(wav_path))
        if words:
            return list(words), str(transcript or "")
    except Exception:  # noqa: BLE001
        pass

    model = _load_whisper()
    if model is None or not Path(wav_path).is_file():
        return [], ""
    try:
        segments, _info = model.transcribe(
            str(wav_path), word_timestamps=True, vad_filter=False, beam_size=1
        )
        words: list[dict[str, Any]] = []
        chunks: list[str] = []
        for segment in segments:
            chunks.append(str(getattr(segment, "text", "") or "").strip())
            for word in getattr(segment, "words", None) or []:
                token = str(getattr(word, "word", "") or "").strip()
                if not token:
                    continue
                words.append(
                    {
                        "word": token,
                        "t_start_ms": int(float(getattr(word, "start", 0.0)) * 1000),
                        "t_end_ms": int(float(getattr(word, "end", 0.0)) * 1000),
                        "confidence": float(getattr(word, "probability", 0.0) or 0.0),
                    }
                )
        return words, " ".join(c for c in chunks if c).strip()
    except Exception as exc:  # noqa: BLE001 — a failed pass must not fail the job
        _log.warning("word-level re-transcription failed for %s: %s", wav_path, exc)
        return [], ""


def words_from_transcript(transcript: str) -> list[dict[str, Any]]:
    """Timing-free fallback so the LLM flagger still has word positions."""
    return [
        {"word": m.group(0), "t_start_ms": None, "t_end_ms": None, "confidence": None}
        for m in WORD_RE.finditer(transcript or "")
    ]


# --------------------------------------------------------------------------------------
# Stage 2 — low-confidence list + fluency proxies
# --------------------------------------------------------------------------------------


def clean_token(token: str) -> str:
    return WORD_RE.sub(lambda m: m.group(0), token.strip().strip(".,!?;:\"'()[]")).lower()


def is_flaggable(token: str) -> bool:
    word = clean_token(token)
    return len(word) >= MIN_WORD_LEN and word not in STOPLIST


def low_confidence_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for index, word in enumerate(words):
        confidence = word.get("confidence")
        if confidence is None or confidence >= LOW_CONFIDENCE:
            continue
        if not is_flaggable(str(word.get("word") or "")):
            continue
        out.append(
            {
                "word": clean_token(str(word["word"])),
                "word_index": index,
                "confidence": round(float(confidence), 3),
            }
        )
    return out


def fluency_proxies(words: list[dict[str, Any]], duration_ms: int | None = None) -> dict[str, Any]:
    """Speech-rate and pause metrics from the word timings (09 §3.4 corroboration)."""
    timed = [w for w in words if w.get("t_start_ms") is not None and w.get("t_end_ms") is not None]
    if len(timed) < 2:
        return {"words": len(words), "available": False}

    timed.sort(key=lambda w: int(w["t_start_ms"]))
    span_ms = int(timed[-1]["t_end_ms"]) - int(timed[0]["t_start_ms"])
    speaking_ms = sum(max(0, int(w["t_end_ms"]) - int(w["t_start_ms"])) for w in timed)
    pauses: list[int] = []
    for previous, current in zip(timed, timed[1:], strict=False):
        gap = int(current["t_start_ms"]) - int(previous["t_end_ms"])
        if gap > 250:
            pauses.append(gap)
    total_ms = duration_ms or span_ms or 1
    minutes = max(total_ms, 1) / 60000.0
    confidences = [float(w["confidence"]) for w in words if w.get("confidence") is not None]

    return {
        "available": True,
        "words": len(words),
        "duration_ms": total_ms,
        "wpm": round(len(timed) / minutes, 1),
        "articulation_wpm": round(len(timed) / max(speaking_ms / 60000.0, 1e-6), 1),
        "pause_count": len(pauses),
        "pause_total_ms": sum(pauses),
        "long_pause_count": sum(1 for p in pauses if p >= 1000),
        "pause_ratio": round(sum(pauses) / max(total_ms, 1), 3),
        "mean_confidence": round(sum(confidences) / len(confidences), 3) if confidences else None,
    }


def wav_duration_ms(path: Path) -> int | None:
    try:
        import soundfile as sf  # type: ignore

        info = sf.info(str(path))
        return int(info.frames / info.samplerate * 1000) if info.samplerate else None
    except Exception:  # noqa: BLE001 — soundfile is optional at runtime
        return None


# --------------------------------------------------------------------------------------
# Stage 3 — LLM anomaly flagging
# --------------------------------------------------------------------------------------


async def flag_words(
    candidate_turns: list[dict[str, Any]], low_conf: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """One temperature-0 JSON call per 09 §3.3. Returns ``[]`` on any provider problem."""
    if not candidate_turns:
        return []
    from bandready.providers.llm import chat_json

    transcript = "\n".join(
        f"[{t.get('turn_index')}] {t.get('text', '')}".strip() for t in candidate_turns
    )
    prompt = FLAG_PROMPT.format(
        candidate_turns=transcript[:8000],
        low_conf_words_json=json.dumps([w["word"] for w in low_conf[:40]], ensure_ascii=False),
    )
    try:
        payload = await chat_json(
            [
                {
                    "role": "system",
                    "content": (
                        "You are a careful IELTS pronunciation reviewer. Reply with JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            mock_kind="generic",
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001 — flagging is best-effort evidence
        _log.info("pronunciation flagging call failed: %s", exc)
        return []

    flagged = payload.get("flagged")
    if not isinstance(flagged, list):
        return []
    out: list[dict[str, Any]] = []
    for entry in flagged[:MAX_FLAGGED]:
        if not isinstance(entry, dict) or not entry.get("word"):
            continue
        out.append(
            {
                "word": clean_token(str(entry["word"])),
                "turn_index": entry.get("turn_index"),
                "reason": str(entry.get("reason") or "")[:400] or None,
                "likely_intended": entry.get("likely_intended"),
            }
        )
    return out


# --------------------------------------------------------------------------------------
# Per-WAV analysis
# --------------------------------------------------------------------------------------


def score_from_confidence(confidence: float | None) -> int | None:
    if confidence is None:
        return None
    return max(0, min(100, int(round(float(confidence) * 100))))


def build_turn_result(
    words: list[dict[str, Any]],
    transcript: str,
    duration_ms: int | None = None,
    turn_index: int | None = None,
    turn_id: str | None = None,
    audio_path: str | None = None,
) -> TurnPronResult:
    scored = [
        WordScore(
            word=clean_token(str(w.get("word") or "")) or str(w.get("word") or "").strip().lower(),
            word_index=index,
            score=score_from_confidence(w.get("confidence")),
            confidence=(round(float(w["confidence"]), 3) if w.get("confidence") is not None else None),
            t_start_ms=w.get("t_start_ms"),
            t_end_ms=w.get("t_end_ms"),
            issues=(
                ["low_asr_confidence"]
                if w.get("confidence") is not None and float(w["confidence"]) < LOW_CONFIDENCE
                else []
            ),
            turn_index=turn_index,
        )
        for index, w in enumerate(words)
        if str(w.get("word") or "").strip()
    ]
    return TurnPronResult(
        method=METHOD,
        words=scored,
        fluency=fluency_proxies(words, duration_ms),
        turn_index=turn_index,
        turn_id=turn_id,
        audio_path=audio_path,
        transcript=transcript,
    )


async def analyze_wav(
    wav_path: Path,
    reference_text: str | None = None,
    turn_index: int | None = None,
) -> TurnPronResult:
    """Analyze one recording (read-aloud, shadowing, or a single speaking turn)."""
    wav_path = Path(wav_path)
    # Transcription is CPU-bound; keep the sidecar's single event loop responsive.
    words, transcript = await asyncio.to_thread(transcribe_words, wav_path)
    if not words:
        transcript = reference_text or transcript
        words = words_from_transcript(transcript)
    result = build_turn_result(
        words,
        transcript or (reference_text or ""),
        duration_ms=wav_duration_ms(wav_path),
        turn_index=turn_index,
        audio_path=str(wav_path),
    )
    flagged = await flag_words(
        [{"turn_index": turn_index or 0, "text": result.transcript}],
        low_confidence_words(words),
    )
    _merge_flags(result, flagged)
    return result


def _merge_flags(result: TurnPronResult, flagged: list[dict[str, Any]]) -> None:
    by_word = {f["word"]: f for f in flagged}
    for word in result.words:
        hit = by_word.get(word.word)
        if hit is None:
            continue
        word.reason = hit.get("reason")
        word.likely_intended = hit.get("likely_intended")
        if "llm_flagged" not in word.issues:
            word.issues.append("llm_flagged")


# --------------------------------------------------------------------------------------
# Speaking-session analysis (the pron_analyze job)
# --------------------------------------------------------------------------------------


def media_root() -> Path:
    from bandready.config import get_settings

    return get_settings().media_dir


def resolve_audio(audio_path: str | None) -> Path | None:
    if not audio_path:
        return None
    candidate = Path(audio_path)
    if not candidate.is_absolute():
        candidate = media_root() / audio_path
    return candidate if candidate.is_file() else None


def load_turns(session: Any, session_id: str) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            "SELECT id, turn_index, text, audio_path, dur_ms FROM speaking_turns "
            "WHERE session_id = :sid AND role = 'user' ORDER BY turn_index"
        ),
        {"sid": session_id},
    ).mappings().all()
    return [dict(r) for r in rows]


async def analyze_session(
    session: Any,
    session_id: str,
    profile_id: str,
    progress: ProgressFn | None = None,
) -> dict[str, Any]:
    """The ``pron_analyze`` job body: every candidate turn WAV of one speaking session."""
    report = progress or _noop
    turns = load_turns(session, session_id)
    if not turns:
        return {"session_id": session_id, "status": "unavailable", "reason": "no_candidate_turns"}

    session.execute(
        text("DELETE FROM pron_scores WHERE session_id = :sid AND method = :m"),
        {"sid": session_id, "m": METHOD},
    )

    results: list[TurnPronResult] = []
    candidate_turns: list[dict[str, Any]] = []
    all_low_conf: list[dict[str, Any]] = []

    for position, turn in enumerate(turns):
        report(
            5 + 70 * position / max(1, len(turns)),
            f"transcribing turn {position + 1} of {len(turns)}",
        )
        wav = resolve_audio(turn.get("audio_path"))
        words: list[dict[str, Any]] = []
        transcript = str(turn.get("text") or "")
        if wav is not None:
            words, asr_text = await asyncio.to_thread(transcribe_words, wav)
            transcript = asr_text or transcript
        if not words:
            words = words_from_transcript(transcript)
        result = build_turn_result(
            words,
            transcript,
            duration_ms=turn.get("dur_ms") or (wav_duration_ms(wav) if wav else None),
            turn_index=int(turn["turn_index"]),
            turn_id=str(turn["id"]),
            audio_path=turn.get("audio_path"),
        )
        results.append(result)
        candidate_turns.append({"turn_index": int(turn["turn_index"]), "text": transcript})
        all_low_conf.extend(
            {**w, "turn_index": int(turn["turn_index"])} for w in low_confidence_words(words)
        )

    report(80, "flagging likely mispronunciations")
    flagged = await flag_words(candidate_turns, all_low_conf)
    by_word = {f["word"]: f for f in flagged}
    for result in results:
        _merge_flags(result, flagged)

    report(90, "saving scores")
    _persist_scores(session, profile_id, session_id, results)

    aggregates = session_aggregates(results, flagged)
    session.execute(
        text("UPDATE speaking_sessions SET pron_summary_json = :s WHERE id = :sid"),
        {"s": json.dumps(aggregates), "sid": session_id},
    )
    report(100, "done")
    return {
        "session_id": session_id,
        "status": "ready",
        "method": METHOD,
        "turns_analyzed": len(results),
        "flagged": list(by_word.values()),
        "aggregates": aggregates,
    }


def _persist_scores(
    session: Any, profile_id: str, session_id: str, results: list[TurnPronResult]
) -> int:
    payload: list[dict[str, Any]] = []
    for result in results:
        for word in result.words:
            if not word.word:
                continue
            payload.append(
                {
                    "id": f"pw_{ULID()}",
                    "profile_id": profile_id,
                    "source": "speaking_turn",
                    "session_id": session_id,
                    "turn_id": result.turn_id,
                    "passage_id": None,
                    "audio_path": result.audio_path,
                    "method": METHOD,
                    "word": word.word,
                    "word_index": word.word_index,
                    "score": word.score,
                    "expected_ipa": None,
                    "heard_approx": word.likely_intended,
                    "t_start_ms": word.t_start_ms,
                    "t_end_ms": word.t_end_ms,
                    "phone_detail_json": None,
                    "issues_json": json.dumps(word.issues) if word.issues else None,
                }
            )
    if not payload:
        return 0
    session.execute(
        text(
            "INSERT INTO pron_scores (id, profile_id, source, session_id, turn_id, passage_id, "
            "audio_path, method, word, word_index, score, expected_ipa, heard_approx, "
            "t_start_ms, t_end_ms, phone_detail_json, issues_json) VALUES (:id, :profile_id, "
            ":source, :session_id, :turn_id, :passage_id, :audio_path, :method, :word, "
            ":word_index, :score, :expected_ipa, :heard_approx, :t_start_ms, :t_end_ms, "
            ":phone_detail_json, :issues_json)"
        ),
        payload,
    )
    return len(payload)


def persist_standalone(
    session: Any,
    profile_id: str,
    result: TurnPronResult,
    source: str,
    passage_id: str | None,
    audio_path: str | None,
) -> int:
    """Store read-aloud / shadowing / minimal-pair-production words (11 §7 polymorphism)."""
    payload = [
        {
            "id": f"pw_{ULID()}",
            "profile_id": profile_id,
            "source": source,
            "session_id": None,
            "turn_id": None,
            "passage_id": passage_id,
            "audio_path": audio_path,
            "method": METHOD,
            "word": word.word,
            "word_index": word.word_index,
            "score": word.score,
            "expected_ipa": None,
            "heard_approx": word.likely_intended,
            "t_start_ms": word.t_start_ms,
            "t_end_ms": word.t_end_ms,
            "phone_detail_json": None,
            "issues_json": json.dumps(word.issues) if word.issues else None,
        }
        for word in result.words
        if word.word
    ]
    if not payload:
        return 0
    session.execute(
        text(
            "INSERT INTO pron_scores (id, profile_id, source, session_id, turn_id, passage_id, "
            "audio_path, method, word, word_index, score, expected_ipa, heard_approx, "
            "t_start_ms, t_end_ms, phone_detail_json, issues_json) VALUES (:id, :profile_id, "
            ":source, :session_id, :turn_id, :passage_id, :audio_path, :method, :word, "
            ":word_index, :score, :expected_ipa, :heard_approx, :t_start_ms, :t_end_ms, "
            ":phone_detail_json, :issues_json)"
        ),
        payload,
    )
    return len(payload)


def session_aggregates(
    results: list[TurnPronResult], flagged: list[dict[str, Any]]
) -> dict[str, Any]:
    scored = [w for r in results for w in r.words if w.score is not None]
    reds = [w for w in scored if w.score is not None and w.score < BAND_AMBER]
    fluency_rows = [r.fluency for r in results if r.fluency.get("available")]
    wpm = (
        round(sum(float(f["wpm"]) for f in fluency_rows) / len(fluency_rows), 1)
        if fluency_rows
        else None
    )
    return {
        "method": METHOD,
        "accent_notice": ACCENT_NOTICE,
        "words_scored": len(scored),
        "mean_score": round(sum(int(w.score or 0) for w in scored) / len(scored), 1) if scored else None,
        "pct_words_red": round(len(reds) / len(scored), 3) if scored else None,
        "gop_mean": None,
        "intonation_flatness": None,
        "stress_accuracy": None,
        "flagged_count": len(flagged),
        "fluency": {
            "wpm": wpm,
            "long_pause_count": sum(int(f.get("long_pause_count") or 0) for f in fluency_rows),
            "pause_ratio": (
                round(sum(float(f.get("pause_ratio") or 0) for f in fluency_rows) / len(fluency_rows), 3)
                if fluency_rows
                else None
            ),
        },
    }


# --------------------------------------------------------------------------------------
# Reads: reconstruct TurnPronResult from pron_scores (09 §6)
# --------------------------------------------------------------------------------------


def session_results(session: Any, session_id: str) -> dict[str, Any]:
    rows = session.execute(
        text(
            "SELECT turn_id, word, word_index, score, t_start_ms, t_end_ms, expected_ipa, "
            "heard_approx, issues_json, method, audio_path FROM pron_scores "
            "WHERE session_id = :sid ORDER BY turn_id, word_index"
        ),
        {"sid": session_id},
    ).mappings().all()
    summary_row = session.execute(
        text("SELECT pron_summary_json FROM speaking_sessions WHERE id = :sid"),
        {"sid": session_id},
    ).first()
    if summary_row is None:
        from bandready.server.errors import ApiError

        raise ApiError(404, "not_found", f"no speaking session {session_id}")
    aggregates = _loads(summary_row[0]) or {}

    turn_index_by_id = {
        str(r[0]): int(r[1])
        for r in session.execute(
            text("SELECT id, turn_index FROM speaking_turns WHERE session_id = :sid"),
            {"sid": session_id},
        ).all()
    }

    turns: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row["turn_id"])
        turn = turns.setdefault(
            key,
            {
                "method": row["method"],
                "turn_id": row["turn_id"],
                "turn_index": turn_index_by_id.get(key),
                "words": [],
                "intonation_flatness": None,
                "stress_accuracy": None,
                "gop_mean": None,
                "audio_path": row["audio_path"],
            },
        )
        score = row["score"]
        turn["words"].append(
            {
                "word": row["word"],
                "word_index": row["word_index"],
                "score": score,
                "t_start_ms": row["t_start_ms"],
                "t_end_ms": row["t_end_ms"],
                "expected_ipa": row["expected_ipa"],
                "heard_approx": row["heard_approx"],
                "issues": _loads(row["issues_json"]),
                "skipped": score is None,
                "level": (
                    None
                    if score is None
                    else "good" if score >= BAND_GREEN else "warn" if score >= BAND_AMBER else "poor"
                ),
            }
        )
    ordered = sorted(turns.values(), key=lambda t: (t["turn_index"] is None, t["turn_index"] or 0))
    return {
        "session_id": session_id,
        "status": "ready" if rows else "pending",
        "method": METHOD,
        "accent_notice": ACCENT_NOTICE,
        "turns": ordered,
        "aggregates": aggregates,
    }


def worst_words(session: Any, profile_id: str, limit: int = 8) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            "SELECT word, MIN(score) AS score, COUNT(*) AS n, MAX(created_at) AS last_at, "
            "MAX(heard_approx) AS heard_approx FROM pron_scores "
            "WHERE profile_id = :pid AND score IS NOT NULL GROUP BY word "
            "ORDER BY score ASC, n DESC LIMIT :n"
        ),
        {"pid": profile_id, "n": max(1, limit)},
    ).mappings().all()
    return [dict(r) for r in rows]


def pron_signals(session: Any, session_id: str) -> dict[str, Any]:
    """``pron_signals_json`` for 04's evaluator (09 §6) — scores normalised to 0–1."""
    rows = session.execute(
        text(
            "SELECT p.word, p.score, p.expected_ipa, p.heard_approx, p.issues_json, "
            "t.turn_index FROM pron_scores p "
            "LEFT JOIN speaking_turns t ON t.id = p.turn_id "
            "WHERE p.session_id = :sid AND p.score IS NOT NULL "
            "ORDER BY p.score ASC LIMIT 8"
        ),
        {"sid": session_id},
    ).mappings().all()
    if not rows:
        return {"available": False}

    total = session.execute(
        text(
            "SELECT COUNT(*) AS n, SUM(CASE WHEN score < :amber THEN 1 ELSE 0 END) AS red "
            "FROM pron_scores WHERE session_id = :sid AND score IS NOT NULL"
        ),
        {"sid": session_id, "amber": BAND_AMBER},
    ).mappings().first()

    return {
        "available": True,
        "method": METHOD,
        # proxy-v1 has no GOP; 09 §6 requires these to be null in that mode.
        "gop_mean": None,
        "worst_words": [
            {
                "word": row["word"],
                "score": None,  # proxy-v1: an ASR confidence is not a pronunciation score
                "expected_ipa": None,
                "heard_approx": None,
                "heard_as": row["heard_approx"],
                "reason": _first_issue(row["issues_json"]),
                "turn_index": row["turn_index"],
            }
            for row in rows
        ],
        "intonation_flatness": None,
        "stress_accuracy": None,
        "pct_words_red": (
            round(float((total or {}).get("red") or 0) / max(1, int((total or {}).get("n") or 1)), 3)
            if total
            else None
        ),
        "accent_notice": ACCENT_NOTICE,
    }


def _first_issue(raw: Any) -> str | None:
    issues = _loads(raw)
    if isinstance(issues, list) and issues:
        return str(issues[0])
    return None


def _loads(raw: Any) -> Any:
    if raw is None or isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------------------
# Minimal-pair drills (09 §5.3) — v1 content, no model needed
# --------------------------------------------------------------------------------------

BUILTIN_MINIMAL_PAIRS: tuple[dict[str, Any], ...] = (
    {"id": "mp_ship_sheep", "a": "ship", "b": "sheep", "contrast": "ɪ–iː",
     "sentence_a": "The ship left the harbour.", "sentence_b": "The sheep left the field.",
     "tags": ["vowel", "length"]},
    {"id": "mp_fit_feet", "a": "fit", "b": "feet", "contrast": "ɪ–iː",
     "sentence_a": "These shoes fit well.", "sentence_b": "My feet ache today.",
     "tags": ["vowel", "length"]},
    {"id": "mp_live_leave", "a": "live", "b": "leave", "contrast": "ɪ–iː",
     "sentence_a": "I live near the station.", "sentence_b": "I leave near midnight.",
     "tags": ["vowel", "length"]},
    {"id": "mp_bad_bed", "a": "bad", "b": "bed", "contrast": "æ–e",
     "sentence_a": "That was a bad idea.", "sentence_b": "That was a bed frame.",
     "tags": ["vowel"]},
    {"id": "mp_man_men", "a": "man", "b": "men", "contrast": "æ–e",
     "sentence_a": "One man arrived late.", "sentence_b": "Some men arrived late.",
     "tags": ["vowel", "plural"]},
    {"id": "mp_sat_set", "a": "sat", "b": "set", "contrast": "æ–e",
     "sentence_a": "She sat by the window.", "sentence_b": "She set it by the window.",
     "tags": ["vowel"]},
    {"id": "mp_think_sink", "a": "think", "b": "sink", "contrast": "θ–s",
     "sentence_a": "I think it is fine.", "sentence_b": "I sink in soft sand.",
     "tags": ["consonant", "fricative"]},
    {"id": "mp_thick_sick", "a": "thick", "b": "sick", "contrast": "θ–s",
     "sentence_a": "The fog was thick.", "sentence_b": "The dog was sick.",
     "tags": ["consonant", "fricative"]},
    {"id": "mp_thin_tin", "a": "thin", "b": "tin", "contrast": "θ–t",
     "sentence_a": "The wire is thin.", "sentence_b": "The roof is tin.",
     "tags": ["consonant"]},
    {"id": "mp_three_tree", "a": "three", "b": "tree", "contrast": "θ–t",
     "sentence_a": "We planted three of them.", "sentence_b": "We planted a tree there.",
     "tags": ["consonant"]},
    {"id": "mp_vest_west", "a": "vest", "b": "west", "contrast": "v–w",
     "sentence_a": "He wore a vest.", "sentence_b": "He drove west.",
     "tags": ["consonant"]},
    {"id": "mp_vine_wine", "a": "vine", "b": "wine", "contrast": "v–w",
     "sentence_a": "The vine grew fast.", "sentence_b": "The wine aged well.",
     "tags": ["consonant"]},
    {"id": "mp_light_right", "a": "light", "b": "right", "contrast": "l–r",
     "sentence_a": "Turn on the light.", "sentence_b": "Turn to the right.",
     "tags": ["consonant", "liquid"]},
    {"id": "mp_collect_correct", "a": "collect", "b": "correct", "contrast": "l–r",
     "sentence_a": "Please collect the forms.", "sentence_b": "Please correct the forms.",
     "tags": ["consonant", "liquid"]},
    {"id": "mp_glass_grass", "a": "glass", "b": "grass", "contrast": "l–r",
     "sentence_a": "Mind the glass.", "sentence_b": "Mind the grass.",
     "tags": ["consonant", "liquid"]},
    {"id": "mp_cab_cap", "a": "cab", "b": "cap", "contrast": "b–p (final)",
     "sentence_a": "I took a cab home.", "sentence_b": "I took a cap home.",
     "tags": ["consonant", "final"]},
    {"id": "mp_rob_rope", "a": "rob", "b": "rope", "contrast": "b–p (final)",
     "sentence_a": "They tried to rob it.", "sentence_b": "They tied the rope.",
     "tags": ["consonant", "final"]},
    {"id": "mp_thin_thing", "a": "thin", "b": "thing", "contrast": "n–ŋ",
     "sentence_a": "The line is thin.", "sentence_b": "The thing is missing.",
     "tags": ["consonant", "nasal"]},
    {"id": "mp_win_wing", "a": "win", "b": "wing", "contrast": "n–ŋ",
     "sentence_a": "We hope to win.", "sentence_b": "We saw a wing.",
     "tags": ["consonant", "nasal"]},
    {"id": "mp_ban_bang", "a": "ban", "b": "bang", "contrast": "n–ŋ",
     "sentence_a": "They voted for a ban.", "sentence_b": "They heard a bang.",
     "tags": ["consonant", "nasal"]},
    {"id": "mp_bird_board", "a": "bird", "b": "board", "contrast": "ɜː–ɔː",
     "sentence_a": "A bird sat there.", "sentence_b": "A board sat there.",
     "tags": ["vowel"]},
    {"id": "mp_shirt_short", "a": "shirt", "b": "short", "contrast": "ɜː–ɔː",
     "sentence_a": "That shirt is new.", "sentence_b": "That short is new.",
     "tags": ["vowel"]},
    {"id": "mp_work_walk", "a": "work", "b": "walk", "contrast": "ɜː–ɔː",
     "sentence_a": "I work every morning.", "sentence_b": "I walk every morning.",
     "tags": ["vowel"]},
    {"id": "mp_works_walks", "a": "works", "b": "walks", "contrast": "-s/-z cluster",
     "sentence_a": "She works nearby.", "sentence_b": "She walks nearby.",
     "tags": ["cluster", "final"]},
    {"id": "mp_cost_costs", "a": "cost", "b": "costs", "contrast": "-s/-z cluster",
     "sentence_a": "The cost is high.", "sentence_b": "The costs are high.",
     "tags": ["cluster", "final"]},
    {"id": "mp_price_prize", "a": "price", "b": "prize", "contrast": "s–z",
     "sentence_a": "The price went up.", "sentence_b": "The prize went up.",
     "tags": ["consonant", "voicing"]},
)

WORD_STRESS_ITEMS: tuple[dict[str, Any], ...] = (
    {"id": "ws_photography", "word": "photography", "syllables": ["pho", "tog", "ra", "phy"],
     "answer_index": 1, "contrast": "word_stress"},
    {"id": "ws_economic", "word": "economic", "syllables": ["e", "co", "nom", "ic"],
     "answer_index": 2, "contrast": "word_stress"},
    {"id": "ws_comfortable", "word": "comfortable", "syllables": ["com", "for", "ta", "ble"],
     "answer_index": 0, "contrast": "word_stress"},
    {"id": "ws_development", "word": "development", "syllables": ["de", "vel", "op", "ment"],
     "answer_index": 1, "contrast": "word_stress"},
    {"id": "ws_advertisement", "word": "advertisement", "syllables": ["ad", "ver", "tise", "ment"],
     "answer_index": 1, "contrast": "word_stress"},
    {"id": "ws_environment", "word": "environment", "syllables": ["en", "vi", "ron", "ment"],
     "answer_index": 1, "contrast": "word_stress"},
    {"id": "ws_opportunity", "word": "opportunity", "syllables": ["op", "por", "tu", "ni", "ty"],
     "answer_index": 2, "contrast": "word_stress"},
    {"id": "ws_technology", "word": "technology", "syllables": ["tech", "nol", "o", "gy"],
     "answer_index": 1, "contrast": "word_stress"},
)

DRILL_TYPES = ("minimal_pair_ab", "word_stress_tap")


def minimal_pairs() -> list[dict[str, Any]]:
    """Built-in bank merged with any ``data/pron_pairs.jsonl`` an installed pack ships."""
    pairs = {p["id"]: dict(p) for p in BUILTIN_MINIMAL_PAIRS}
    try:
        from bandready.content.loader import load_pack_jsonl

        for row in load_pack_jsonl("pron_pairs.jsonl"):
            if row.get("id") and row.get("a") and row.get("b"):
                pairs[str(row["id"])] = dict(row)
    except Exception as exc:  # noqa: BLE001 — pack pairs are optional
        _log.debug("no pack-authored minimal pairs: %s", exc)
    return list(pairs.values())


def drill_items(
    drill_type: str = "minimal_pair_ab",
    contrast: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """One drill set (09 §5.3 perception mode is 10 items)."""
    if drill_type == "word_stress_tap":
        items = [dict(i) for i in WORD_STRESS_ITEMS]
    else:
        items = [
            {
                "id": p["id"],
                "drill_type": "minimal_pair_ab",
                "a": p["a"],
                "b": p["b"],
                "contrast": p["contrast"],
                "sentence_a": p.get("sentence_a", ""),
                "sentence_b": p.get("sentence_b", ""),
                "tags": p.get("tags") or [],
            }
            for p in minimal_pairs()
        ]
    if contrast:
        items = [i for i in items if str(i.get("contrast")) == contrast]
    return items[: max(1, min(50, limit))]


def contrasts() -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for pair in minimal_pairs():
        counts[str(pair["contrast"])] = counts.get(str(pair["contrast"]), 0) + 1
    return [{"contrast": k, "items": v} for k, v in sorted(counts.items())]


def find_drill_item(item_id: str) -> dict[str, Any] | None:
    for pair in minimal_pairs():
        if str(pair["id"]) == item_id:
            return {**pair, "drill_type": "minimal_pair_ab"}
    for item in WORD_STRESS_ITEMS:
        if item["id"] == item_id:
            return {**item, "drill_type": "word_stress_tap"}
    return None


def record_drill_attempt(
    session: Any,
    profile_id: str,
    drill_type: str,
    item_id: str,
    correct: bool,
    contrast: str | None = None,
    response_ms: int | None = None,
) -> dict[str, Any]:
    row_id = f"pd_{ULID()}"
    session.execute(
        text(
            "INSERT INTO pron_drill_attempts (id, profile_id, drill_type, item_id, contrast, "
            "correct, response_ms) VALUES (:id, :pid, :dt, :item, :contrast, :correct, :ms)"
        ),
        {
            "id": row_id,
            "pid": profile_id,
            "dt": drill_type,
            "item": item_id,
            "contrast": contrast,
            "correct": 1 if correct else 0,
            "ms": response_ms,
        },
    )
    return {"id": row_id, "correct": bool(correct), "contrast": contrast}


def contrast_accuracy(session: Any, profile_id: str) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            "SELECT contrast, COUNT(*) AS n, SUM(correct) AS ok, MAX(created_at) AS last_at "
            "FROM pron_drill_attempts WHERE profile_id = :pid AND contrast IS NOT NULL "
            "GROUP BY contrast ORDER BY (CAST(SUM(correct) AS REAL) / COUNT(*)) ASC"
        ),
        {"pid": profile_id},
    ).mappings().all()
    return [
        {
            "contrast": r["contrast"],
            "attempts": int(r["n"]),
            "correct": int(r["ok"] or 0),
            "accuracy": round(float(r["ok"] or 0) / max(1, int(r["n"])), 3),
            "last_at": r["last_at"],
        }
        for r in rows
    ]

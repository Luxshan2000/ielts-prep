"""Speaking evaluation — the prompt, the parse, and the server-side post-processing
(04-speaking-module.md §6).

Two rules dominate this module:

* **R2-4 — the model's own ``overall_band`` is ignored.** The overall band is always
  recomputed server-side as the mean of the criterion bands through the shared
  ``round_ielts()`` (ties round UP: 6.25 → 6.5, 6.75 → 7.0). The model's number survives
  only inside the stored raw response, for audit.
* **R2-5 — vocabulary is *suggested*, never scheduled.** ``vocab_to_bank[]`` items become
  ``vocab_entries`` rows with ``status='suggested'`` and a ``vocab_sources`` provenance
  row. No ``srs_cards`` row is ever created here; that happens when the learner accepts.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from ulid import ULID

from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.scoring.speaking")

PROMPT_VERSION = "speaking-eval-v1"
CRITERIA: tuple[str, ...] = ("fc", "lr", "gra", "pron")
CRITERION_LABELS = {
    "fc": "Fluency & Coherence",
    "lr": "Lexical Resource",
    "gra": "Grammatical Range & Accuracy",
    "pron": "Pronunciation",
}

__all__ = [
    "CRITERIA",
    "DESCRIPTOR_TABLE_MARKDOWN",
    "EVALUATE_SYSTEM",
    "PROMPT_VERSION",
    "build_evaluation_messages",
    "descriptor_table_markdown",
    "evaluate_session",
    "normalize_evaluation",
    "recompute_overall",
    "render_transcript",
    "round_ielts",
]


# --------------------------------------------------------------------------- rounding


def round_ielts(value: float) -> float:
    """Official IELTS rounding: nearest half band, ties round **up**.

    Delegates to the shared ``bandready.scoring.bands`` helper when that module exists
    (it is the canonical implementation used identically by writing (05) and the overall
    estimator (10)); the inline fallback keeps speaking scoring working before it lands
    and is numerically identical.
    """
    try:
        from bandready.scoring.bands import round_ielts as shared  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001 — module not written yet
        import math

        return max(0.0, min(9.0, math.floor(float(value) * 2 + 0.5) / 2))
    return float(shared(value))


def recompute_overall(criteria: dict[str, Any]) -> float | None:
    """Mean of the available criterion bands, rounded (R2-4).

    ``pron`` may be ``None`` when pronunciation signals were unavailable; the mean is then
    taken over the three remaining criteria and the report is flagged pronunciation-blind.
    """
    bands = [
        float(criteria[c]["band"])
        for c in CRITERIA
        if isinstance(criteria.get(c), dict) and criteria[c].get("band") is not None
    ]
    if not bands:
        return None
    return round_ielts(sum(bands) / len(bands))


# --------------------------------------------------------------------------- prompts

DESCRIPTOR_TABLE_MARKDOWN = """\
| Band | Fluency & Coherence | Lexical Resource | Grammatical Range & Accuracy | Pronunciation |
|---|---|---|---|---|
| 9 | Speaks effortlessly at length; any pause is for thinking of ideas, not words; ideas fully connected and on-point | Complete flexibility and precision; idiomatic language used naturally and accurately throughout | Full range of structures used naturally; the only slips are the kind fluent speakers also make | Uses the full toolkit of stress, rhythm and intonation precisely; effortless to understand throughout |
| 8 | Talks at length with only rare repetition or self-correction; hesitation is idea-driven; topics develop logically | Wide vocabulary deployed precisely; paraphrases skilfully; occasional misfire with idiom or collocation | Wide range of structures, most sentences error-free; only very occasional slips or unnatural choices | Wide range of features used flexibly; accent has minimal effect on how easily the listener understands |
| 7 | Keeps going without obvious effort; some language-driven hesitation or repetition; uses a range of linkers with some flexibility | Handles varied topics flexibly; some less-common and idiomatic items with style awareness; paraphrases effectively | Uses a range of complex structures with some flexibility; frequent error-free sentences, though some errors persist | Shows all the strengths of band 6 plus stretches of band-8 control; lapses occur but rarely obscure meaning |
| 6 | Willing to talk at length, but coherence sometimes breaks down; noticeable repetition, self-correction, or over-used simple linkers | Vocabulary broad enough to discuss topics at length and be clear, despite wrong word choices; paraphrase mostly works | Mixes simple and complex forms with limited flexibility; complex sentences often contain errors, but meaning usually survives | Uses a range of features with mixed control; some mispronounced words, but the listener can generally follow |
| 5 | Keeps the flow only by repeating, self-correcting, or slowing down; fluent stretches happen only in simple language; over-relies on a few connectives | Can talk about familiar and unfamiliar topics but with limited flexibility; attempts paraphrase with mixed results | Basic sentence forms reasonably accurate; complex structures attempted but usually faulty | Some effective features (band-6-like moments) but not sustained; mispronunciations cause the listener occasional strain |
| 4 | Cannot keep going without noticeable long pauses; speech slow with frequent repetition; joins only simple sentences, links often break | Confined to familiar topics; frequent wrong word choices; rarely attempts paraphrase | Mostly short or memorized utterances; frequent errors even in basic forms; subordinate clauses rare | Limited range of features; frequent lapses; mispronunciations put real strain on the listener |"""


def descriptor_table_markdown() -> str:
    """The 04 §6.2 descriptor grid.

    Prefers the shared ``bandready.scoring.rubrics`` table so the prompt, the writing
    module and the UI's "what this band means" popovers can never drift apart; falls back
    to the inline copy above when that module is unavailable.
    """
    try:
        from bandready.scoring.rubrics import descriptor_table

        table = descriptor_table("speaking")
    except Exception:  # noqa: BLE001 — rubrics module not present
        return DESCRIPTOR_TABLE_MARKDOWN
    return table or DESCRIPTOR_TABLE_MARKDOWN


EVALUATE_SYSTEM = """\
You are a senior IELTS Speaking examiner producing a written assessment of
a recorded Speaking test. You are calibrated, evidence-driven, and strict:
every band you award must be justified by quotes from the transcript or by
the measured signals. Do not be generous to be kind — inflated bands harm
the candidate on test day.

You assess ONLY the candidate's speech. Ignore the examiner's language.
Do not penalize accent per se — only features that affect intelligibility.
Do not penalize opinions or content choices — this is a language test.

SCORING PROCEDURE:
1. Read the whole transcript once for overall impression.
2. Score each criterion 1–9 (whole bands) using the descriptor table below.
   Anchor on band 6 and move up/down based on evidence.
3. For Fluency & Coherence you MUST reconcile your impression with the
   measured fluency metrics (speech rate, pause profile, filled pauses).
   If metrics and transcript impression conflict, trust the metrics for
   pacing/hesitation facts and the transcript for coherence.
4. For Pronunciation you MUST base the band primarily on the measured
   pronunciation signals; the transcript cannot capture pronunciation.
   If pronunciation signals are marked as unavailable, output band null
   for pron and say so in its evidence.
5. Collect concrete errors (verbatim quotes) and the candidate's best
   moments (verbatim quotes).
6. Nominate vocabulary for the candidate's study bank: strong items they
   used (to reinforce) and upgrades for weak word choices (to learn).

DESCRIPTOR TABLE (bands 4–9; bands 1–3: little rateable language — assign
only if the candidate produced almost no assessable speech):
{descriptor_table_markdown}

OUTPUT: a single JSON object, no markdown fence, no commentary, exactly
this shape:
{{
  "overall_band": 6.5,
  "criteria": {{
    "fc":   {{ "band": 6, "evidence": ["..."], "improvements": ["..."] }},
    "lr":   {{ "band": 7, "evidence": ["..."], "improvements": ["..."] }},
    "gra":  {{ "band": 6, "evidence": ["..."], "improvements": ["..."] }},
    "pron": {{ "band": 6, "evidence": ["..."], "improvements": ["..."] }}
  }},
  "best_moments": ["verbatim quote — why it was strong"],
  "errors": [
    {{ "quote": "I am agree with this idea",
      "issue": "verb form: 'agree' is not used with 'am'",
      "better": "I agree with this idea" }}
  ],
  "vocab_to_bank": [
    {{ "term": "commute", "type": "word",
      "reason": "used correctly under pressure — reinforce",
      "context_quote": "my daily commute takes an hour" }},
    {{ "term": "heavy traffic", "type": "collocation",
      "reason": "upgrade for 'very much cars'",
      "context_quote": "there were very much cars" }}
  ]
}}
Rules for the JSON: 2–4 evidence items and 1–3 improvements per criterion,
each evidence item quoting the transcript where possible; 2–5 best_moments;
up to 10 errors, most damaging first; 3–8 vocab_to_bank items;
overall_band = mean of the four criterion bands rounded to the nearest
half band (x.25 → x.5, x.75 → next whole). Improvements must be concrete
actions ("practise linking contrast with 'whereas'"), never restatements
of the deficit."""


EVALUATE_USER = """\
TEST METADATA
mode: {mode}            parts_completed: {parts_completed}
card_set: {card_set_id} total_candidate_speech: {speech_secs}s

TRANSCRIPT (E = examiner, C = candidate; [t=…s] turn start, (pause 1.8s) =
measured silent pause inside candidate speech, (um)/(uh) = filled pauses
kept verbatim):
{timed_transcript}

FLUENCY METRICS (per part, computed — see 02-voice-pipeline.md; exact R2-10 contract):
{fluency_metrics_json}

PRONUNCIATION SIGNALS (see 09-pronunciation-assessment.md):
{pron_signals_json}

Assess now. Output only the JSON object."""


def render_transcript(record: dict[str, Any]) -> str:
    """The ``E``/``C`` transcript of 04 §6.3, with measured pauses marked inline.

    Pause markers are placed between speech runs, splitting the turn's words in
    proportion to each segment's duration — the STT gives no word timings in v1, so this
    is the honest approximation of where the silence fell.
    """
    lines: list[str] = []
    for turn in record.get("turns") or []:
        role = turn.get("role")
        text = str(turn.get("text") or "").strip()
        if not text:
            continue
        t_s = int(turn.get("t_ms") or 0) // 1000
        if role == "assistant":
            lines.append(f"E [t={t_s}s] {text}")
            continue
        lines.append(f"C [t={t_s}s] {_with_pauses(text, turn.get('segments') or [])}")
    return "\n".join(lines) or "(no candidate speech was captured)"


def _with_pauses(text: str, segments: list[dict[str, Any]]) -> str:
    from bandready.voice.metrics import MIN_PAUSE_MS

    words = text.split()
    usable = [
        s
        for s in segments
        if isinstance(s, dict) and "t_start_ms" in s and "t_end_ms" in s
    ]
    if len(usable) < 2 or len(words) < len(usable):
        return text
    durations = [max(1, int(s["t_end_ms"]) - int(s["t_start_ms"])) for s in usable]
    total = sum(durations)
    out: list[str] = []
    cursor = 0
    for i, duration in enumerate(durations):
        if i == len(durations) - 1:
            chunk = words[cursor:]
        else:
            take = max(1, round(len(words) * duration / total))
            chunk = words[cursor : cursor + take]
            cursor += take
        out.append(" ".join(chunk))
        if i < len(durations) - 1:
            gap = int(usable[i + 1]["t_start_ms"]) - int(usable[i]["t_end_ms"])
            if gap >= MIN_PAUSE_MS:
                out.append(f"(pause {gap / 1000:.1f}s)")
    return " ".join(part for part in out if part)


def build_evaluation_messages(
    record: dict[str, Any],
    metrics: dict[str, Any],
    mode: str = "full_mock",
    card_set_id: str | None = None,
    pron_signals: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    """The two-message evaluation prompt of 04 §6.3."""
    parts = sorted((metrics.get("parts") or {}).keys())
    fluency: dict[str, Any] = dict(metrics.get("parts") or {})
    session_level = dict(metrics.get("session") or {})
    if "p2_long_turn_secs" in session_level:
        fluency["session"] = {"p2_long_turn_secs": session_level["p2_long_turn_secs"]}

    return [
        {
            "role": "system",
            "content": EVALUATE_SYSTEM.format(
                descriptor_table_markdown=descriptor_table_markdown()
            ),
        },
        {
            "role": "user",
            "content": EVALUATE_USER.format(
                mode=mode,
                parts_completed=", ".join(parts) or "none",
                card_set_id=card_set_id or "none",
                speech_secs=session_level.get("speech_secs", 0),
                timed_transcript=render_transcript(record),
                fluency_metrics_json=json.dumps(fluency, indent=2),
                pron_signals_json=json.dumps(pron_signals or {"available": False}),
            ),
        },
    ]


# --------------------------------------------------------------------------- parsing

_WS = re.compile(r"\s+")
_NON_WORD = re.compile(r"[^\w\s']+", re.UNICODE)


def _normalize(text: str) -> str:
    return _WS.sub(" ", _NON_WORD.sub(" ", (text or "").lower())).strip()


def _clamp_band(value: Any) -> int | None:
    if value is None:
        return None
    try:
        band = round(float(value))
    except (TypeError, ValueError):
        return None
    return max(1, min(9, band))


def _string_list(value: Any, limit: int) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [str(v).strip() for v in value if str(v).strip()][:limit]


def normalize_evaluation(
    parsed: dict[str, Any], record: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Clamp, recompute and anchor the model's JSON (04 §6.4 steps 2–4).

    Returns the report document persisted as ``llm_evaluations.parsed_json`` and served by
    ``GET /api/v1/speaking/reports/{id}``.
    """
    raw_criteria = parsed.get("criteria")
    if not isinstance(raw_criteria, dict):
        raw_criteria = {}

    criteria: dict[str, Any] = {}
    for key in CRITERIA:
        block = raw_criteria.get(key)
        block = block if isinstance(block, dict) else {}
        criteria[key] = {
            "band": _clamp_band(block.get("band")),
            "evidence": _string_list(block.get("evidence"), 4),
            "improvements": _string_list(block.get("improvements"), 3),
        }

    overall = recompute_overall(criteria)

    errors: list[dict[str, str]] = []
    for item in parsed.get("errors") or []:
        if not isinstance(item, dict):
            continue
        quote = str(item.get("quote") or "").strip()
        if not quote:
            continue
        errors.append(
            {
                "quote": quote,
                "issue": str(item.get("issue") or "").strip(),
                "better": str(item.get("better") or "").strip(),
            }
        )
        if len(errors) >= 10:
            break

    vocab: list[dict[str, str]] = []
    for item in parsed.get("vocab_to_bank") or []:
        if not isinstance(item, dict):
            continue
        term = str(item.get("term") or "").strip()
        if not term:
            continue
        vocab.append(
            {
                "term": term,
                "type": str(item.get("type") or "word").strip() or "word",
                "reason": str(item.get("reason") or "").strip(),
                "context_quote": str(item.get("context_quote") or "").strip(),
            }
        )
        if len(vocab) >= 8:
            break

    report: dict[str, Any] = {
        "overall_band": overall,
        "criteria": criteria,
        "best_moments": _string_list(parsed.get("best_moments"), 5),
        "errors": errors,
        "vocab_to_bank": vocab,
        "pronunciation_blind": criteria["pron"]["band"] is None,
        "model_overall_band": parsed.get("overall_band"),
        "prompt_version": PROMPT_VERSION,
    }

    # Step 4 — quote anchoring. Unmatched quotes are kept but segregated, so the UI never
    # renders a highlight that does not exist in the transcript.
    if record is not None:
        report["unanchored"] = _anchor(report, record)
    return report


def _anchor(report: dict[str, Any], record: dict[str, Any]) -> list[str]:
    haystack = _normalize(
        " ".join(
            str(t.get("text") or "")
            for t in (record.get("turns") or [])
            if t.get("role") == "user"
        )
    )
    unanchored: list[str] = []

    def check(quote: str) -> bool:
        needle = _normalize(quote)
        if not needle:
            return False
        # Evidence often reads "…quote… — commentary"; test the quoted head too.
        head = _normalize(quote.split("—")[0])
        return (needle and needle in haystack) or (head and head in haystack)

    for key in CRITERIA:
        for quote in report["criteria"][key]["evidence"]:
            if not check(quote):
                unanchored.append(quote)
    for quote in report["best_moments"]:
        if not check(quote):
            unanchored.append(quote)
    for error in report["errors"]:
        error["anchored"] = check(error["quote"])
    return unanchored


# --------------------------------------------------------------------------- run


async def evaluate_session(session_id: str, force: bool = False) -> dict[str, Any]:
    """Score one finished session and persist the report (04 §6.4).

    Idempotent by default: an existing ``ok`` evaluation is returned as-is unless
    ``force`` is set (the ``POST …/score`` route is re-runnable after an ERROR).
    """
    from bandready.db import models as m
    from bandready.db.engine import session_scope
    from bandready.providers.llm import chat_json

    with session_scope() as s:
        row = s.get(m.SpeakingSession, session_id)
        if row is None:
            raise ApiError(404, "not_found", "no speaking session with that id")
        envelope = s.get(m.PracticeSession, session_id)
        profile_id = envelope.profile_id if envelope is not None else "default"
        activity = envelope.activity if envelope is not None else "full_mock"
        record = json.loads(row.transcript_json or '{"turns": []}')
        metrics = json.loads(row.metrics_json or "{}")
        card_set_id = row.card_set_id
        pron = json.loads(row.pron_summary_json) if row.pron_summary_json else None
        existing = (
            s.query(m.LlmEvaluation)
            .filter(
                m.LlmEvaluation.subject_kind == "speaking_session",
                m.LlmEvaluation.subject_id == session_id,
                m.LlmEvaluation.status == "ok",
            )
            .order_by(m.LlmEvaluation.created_at.desc())
            .first()
        )
        existing_id = existing.id if existing is not None else None

    if existing_id and not force:
        return get_report(existing_id)

    if not [t for t in record.get("turns") or [] if t.get("role") == "user"]:
        raise ApiError(
            422,
            "validation_error",
            "this session has no candidate speech to score",
        )

    if not metrics:
        from bandready.voice.metrics import compute_transcript_metrics

        metrics = compute_transcript_metrics(record)

    messages = build_evaluation_messages(
        record,
        metrics,
        mode=activity,
        card_set_id=card_set_id,
        pron_signals=pron,
    )

    started = time.perf_counter()
    try:
        parsed = await chat_json(
            messages,
            mock_kind="speaking_eval",
            temperature=0.0,
            max_tokens=2048,
        )
    except ApiError as exc:
        _record_failure(session_id, exc)
        raise
    latency_ms = int((time.perf_counter() - started) * 1000)

    meta = parsed.pop("_meta", {}) if isinstance(parsed.get("_meta"), dict) else {}
    report = normalize_evaluation(parsed, record)
    report_id = f"sr_{ULID()}"

    _save(
        report_id=report_id,
        session_id=session_id,
        profile_id=profile_id,
        parsed=parsed,
        report=report,
        meta=meta,
        latency_ms=latency_ms,
        rescore=bool(existing_id),
    )
    return get_report(report_id)


def _provider_ids(meta: dict[str, Any]) -> tuple[str, str]:
    try:
        from bandready.settings_store import get_slot

        cfg = get_slot("llm")
    except Exception:  # noqa: BLE001
        cfg = {}
    model_id = str(meta.get("model_id") or cfg.get("model") or "unknown")
    provider_id = str(cfg.get("preset") or "unknown")
    return model_id, provider_id


def _save(
    report_id: str,
    session_id: str,
    profile_id: str,
    parsed: dict[str, Any],
    report: dict[str, Any],
    meta: dict[str, Any],
    latency_ms: int,
    rescore: bool,
) -> None:
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    model_id, provider_id = _provider_ids(meta)
    with session_scope() as s:
        s.add(
            m.LlmEvaluation(
                id=report_id,
                subject_kind="speaking_session",
                subject_id=session_id,
                purpose="rescore" if rescore else "score",
                model_id=model_id,
                provider_id=provider_id,
                prompt_version=PROMPT_VERSION,
                temperature=0.0,
                raw_response=json.dumps(parsed, ensure_ascii=False),
                parsed_json=json.dumps(report, ensure_ascii=False),
                overall_band=report.get("overall_band"),
                status="ok",
                latency_ms=latency_ms,
            )
        )
        row = s.get(m.SpeakingSession, session_id)
        if row is not None:
            # 04 §6.4 step 5 — denormalize the *recomputed* band, never the model's.
            row.overall_band = report.get("overall_band")
            row.criteria_json = json.dumps(report["criteria"], ensure_ascii=False)
        _ingest_vocab(s, profile_id, session_id, report.get("vocab_to_bank") or [])


def _record_failure(session_id: str, exc: ApiError) -> None:
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.add(
            m.LlmEvaluation(
                id=f"sr_{ULID()}",
                subject_kind="speaking_session",
                subject_id=session_id,
                purpose="score",
                model_id="unknown",
                provider_id="unknown",
                prompt_version=PROMPT_VERSION,
                temperature=0.0,
                raw_response=str(exc.detail)[:4000],
                status="parse_failed" if exc.code == "provider_error" else "api_failed",
            )
        )


_POS_BY_TYPE = {
    "word": "other",
    "collocation": "collocation",
    "phrase": "phrase",
    "phrasal_verb": "phrase",
    "idiom": "phrase",
}


def _ingest_vocab(
    s: Any, profile_id: str, session_id: str, items: list[dict[str, Any]]
) -> None:
    """R2-5 — suggested inbox only. Never creates an ``srs_cards`` row."""
    from bandready.db import models as m

    for item in items:
        term = str(item.get("term") or "").strip()
        if not term:
            continue
        lemma = term.lower()
        pos = _POS_BY_TYPE.get(str(item.get("type") or "word"), "other")
        entry = (
            s.query(m.VocabEntry)
            .filter(
                m.VocabEntry.profile_id == profile_id,
                m.VocabEntry.lemma == lemma,
                m.VocabEntry.pos == pos,
            )
            .first()
        )
        if entry is None:
            entry = m.VocabEntry(
                id=f"ve_{ULID()}",
                profile_id=profile_id,
                headword=term,
                lemma=lemma,
                pos=pos,
                is_phrase=1 if " " in term else 0,
                own_context_sentence=item.get("context_quote") or None,
                own_context_origin="learner",
                status="suggested",
            )
            s.add(entry)
        elif item.get("context_quote") and not entry.own_context_sentence:
            # Duplicate term: merge the new context instead of creating a second entry.
            entry.own_context_sentence = str(item["context_quote"])
        s.add(
            m.VocabSource(
                id=f"vs_{ULID()}",
                entry_id=entry.id,
                module="speaking",
                session_id=session_id,
                detail=str(item.get("reason") or "")[:500],
            )
        )


def get_report(report_id: str) -> dict[str, Any]:
    """The wire shape of ``GET /api/v1/speaking/reports/{id}`` (18 §4.7)."""
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        row = s.get(m.LlmEvaluation, report_id)
        if row is None or row.subject_kind != "speaking_session":
            raise ApiError(404, "not_found", "no speaking report with that id")
        session_row = s.get(m.SpeakingSession, row.subject_id)
        envelope = s.get(m.PracticeSession, row.subject_id)
        report = json.loads(row.parsed_json or "{}")
        metrics = json.loads(session_row.metrics_json or "{}") if session_row else {}
        return {
            "report_id": row.id,
            "session_id": row.subject_id,
            "created_at": row.created_at,
            "model_id": row.model_id,
            "prompt_version": row.prompt_version,
            "overall_band": row.overall_band,
            "criteria": report.get("criteria", {}),
            "best_moments": report.get("best_moments", []),
            "errors": report.get("errors", []),
            "vocab_to_bank": report.get("vocab_to_bank", []),
            "unanchored": report.get("unanchored", []),
            "pronunciation_blind": report.get("pronunciation_blind", False),
            "metrics": metrics,
            "mode": session_row.mode if session_row else None,
            "activity": envelope.activity if envelope else None,
            "card_set_id": session_row.card_set_id if session_row else None,
            "duration_s": envelope.duration_s if envelope else None,
            "honesty_note": (
                "AI-estimated band — typically within ±1.0 of an official examiner. "
                "Use the trend, not any single number."
            ),
        }

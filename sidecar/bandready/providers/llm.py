"""The one LLM adapter: OpenAI-compatible chat completions.

Every module that needs a model — speaking evaluation, writing evaluation, reading and
listening generation, vocabulary checks, "why was I wrong" — calls :func:`chat_json` or
:func:`chat_text`. There is exactly one configured LLM (03 §1), so there is exactly one
adapter and no per-module provider plumbing.

JSON discipline (04 §6.3, 05 §6, 06 §7):

* ``response_format={"type": "json_object"}`` is requested when the endpoint tolerates it;
  servers that 400 on it are retried once without it and remembered.
* Output is parsed tolerantly — code fences stripped, outermost ``{…}`` extracted.
* On a parse failure the call is retried (twice by default) with the exact repair nudge
  the prompt docs specify: *"Your previous output was not valid JSON. Output only the
  JSON object."*

Mock mode: when the configured preset is a mock provider, no HTTP happens at all and a
deterministic fixture keyed by ``mock_kind`` is returned. The fixtures below match the
JSON shapes the plan docs specify, so downstream parsers are exercised for real in tests.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import re
from typing import Any

import httpx

from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.llm")

DEFAULT_TIMEOUT_S = 60.0
DEFAULT_RETRIES = 2
REPAIR_MESSAGE = (
    "Your previous output was not valid JSON. Output only the JSON object."
)

Message = dict[str, str]

# Endpoints that reject `response_format` are remembered per base_url so we stop paying
# for the round trip.
_no_json_mode: set[str] = set()


# --------------------------------------------------------------------------- helpers

def _resolve_config(override: dict[str, Any] | None = None) -> dict[str, Any]:
    if override:
        return dict(override)
    from bandready.settings_store import get_slot

    return get_slot("llm")


def _is_mock(cfg: dict[str, Any]) -> bool:
    from bandready.providers.presets import is_mock_preset

    return is_mock_preset(cfg.get("preset")) or str(cfg.get("base_url", "")).startswith("mock://")


def _endpoint(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def strip_fences(text: str) -> str:
    """Remove ```json fences and any leading prose the model prefixed."""
    cleaned = text.strip()
    fence = re.match(r"^```[a-zA-Z0-9_-]*\s*\n(.*?)\n?```\s*$", cleaned, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    return cleaned


def extract_json(text: str) -> dict[str, Any]:
    """Parse a JSON object out of a model response, tolerantly.

    Order: whole string → fence-stripped → outermost balanced ``{…}``.
    Raises ``ValueError`` when nothing parses, which triggers the repair retry.
    """
    candidates: list[str] = []
    raw = (text or "").strip()
    if raw:
        candidates.append(raw)
        stripped = strip_fences(raw)
        if stripped != raw:
            candidates.append(stripped)
        target = candidates[-1]
        start = target.find("{")
        end = target.rfind("}")
        if start != -1 and end > start:
            candidates.append(target[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except (ValueError, TypeError):
            continue
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            return {"items": parsed}
    raise ValueError("no JSON object found in the model response")


def _params(cfg: dict[str, Any], kw: dict[str, Any]) -> dict[str, Any]:
    params = dict(cfg.get("params") or {})
    out = {
        "temperature": kw.pop("temperature", params.get("temperature", 0.7)),
        "max_tokens": kw.pop("max_tokens", params.get("max_tokens", 1024)),
        "timeout_s": float(kw.pop("timeout_s", params.get("timeout_s", DEFAULT_TIMEOUT_S))),
        "max_retries": int(kw.pop("max_retries", params.get("max_retries", DEFAULT_RETRIES))),
    }
    return out


# --------------------------------------------------------------------------- HTTP call

async def _post_chat(
    cfg: dict[str, Any],
    messages: list[Message],
    *,
    model: str,
    temperature: float,
    max_tokens: int,
    timeout_s: float,
    json_mode: bool,
    extra: dict[str, Any],
) -> str:
    base_url = str(cfg.get("base_url") or "").strip()
    if not base_url:
        raise ApiError(
            400, "provider_error",
            "no language model is configured — open Settings and pick a provider",
        )
    url = _endpoint(base_url, "chat/completions")
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    payload.update(extra)
    use_json_mode = json_mode and base_url not in _no_json_mode
    if use_json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {"Content-Type": "application/json"}
    api_key = str(cfg.get("api_key") or "")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(timeout=timeout_s) as client:
        try:
            resp = await client.post(url, json=payload, headers=headers)
        except httpx.ConnectError as exc:
            raise ApiError(
                502, "provider_error",
                f"could not reach the language model at {base_url} — is it running?",
            ) from exc
        except httpx.TimeoutException as exc:
            raise ApiError(
                504, "provider_error",
                f"the language model did not answer within {timeout_s:.0f}s",
            ) from exc

        if resp.status_code == 400 and use_json_mode and "response_format" in resp.text:
            _log.info("%s rejects response_format; retrying without JSON mode", base_url)
            _no_json_mode.add(base_url)
            payload.pop("response_format", None)
            resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code == 401 or resp.status_code == 403:
            raise ApiError(
                502, "provider_error",
                "the provider rejected the API key — check the key in Settings",
            )
        if resp.status_code >= 400:
            raise ApiError(
                502, "provider_error",
                f"language model error {resp.status_code}: {_short(resp.text)}",
            )
        try:
            data = resp.json()
        except ValueError as exc:
            raise ApiError(
                502, "provider_error", "the language model returned a non-JSON body"
            ) from exc

    try:
        choice = data["choices"][0]
        content = choice["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ApiError(
            502, "provider_error", "the language model returned an unexpected shape"
        ) from exc
    if content is None:
        # Some servers put a refusal or a tool call here instead.
        content = choice.get("message", {}).get("reasoning_content") or ""
    return str(content)


def _short(text: str, limit: int = 300) -> str:
    text = " ".join((text or "").split())
    return text[:limit] + ("…" if len(text) > limit else "")


# --------------------------------------------------------------------------- public API

async def chat_text(messages: list[Message], **kw: Any) -> str:
    """One non-streaming completion, returned as plain text."""
    cfg = _resolve_config(kw.pop("config", None))
    mock_kind = kw.pop("mock_kind", None)
    if _is_mock(cfg):
        await _mock_latency(cfg)
        return _mock_text(mock_kind, messages)
    p = _params(cfg, kw)
    model = kw.pop("model", None) or str(cfg.get("model") or "")
    if not model:
        raise ApiError(400, "provider_error", "no model is selected in Settings")
    return await _post_chat(
        cfg,
        messages,
        model=model,
        temperature=float(p["temperature"]),
        max_tokens=int(p["max_tokens"]),
        timeout_s=p["timeout_s"],
        json_mode=False,
        extra=kw,
    )


async def chat_json(
    messages: list[Message], mock_kind: str | None = None, **kw: Any
) -> dict[str, Any]:
    """One completion parsed as a JSON object, with repair retries.

    ``mock_kind`` selects the deterministic fixture in mock mode and is ignored
    otherwise, so callers can pass it unconditionally.
    """
    cfg = _resolve_config(kw.pop("config", None))
    if _is_mock(cfg):
        await _mock_latency(cfg)
        return mock_fixture(mock_kind)

    p = _params(cfg, kw)
    model = kw.pop("model", None) or str(cfg.get("model") or "")
    if not model:
        raise ApiError(400, "provider_error", "no model is selected in Settings")
    attempts = max(1, int(p["max_retries"]) + 1)
    convo = list(messages)
    last_error: Exception | None = None
    last_raw = ""

    for attempt in range(attempts):
        raw = await _post_chat(
            cfg,
            convo,
            model=model,
            temperature=float(p["temperature"]),
            max_tokens=int(p["max_tokens"]),
            timeout_s=p["timeout_s"],
            json_mode=True,
            extra=dict(kw),
        )
        last_raw = raw
        try:
            parsed = extract_json(raw)
            parsed.setdefault("_meta", {})
            if isinstance(parsed.get("_meta"), dict):
                parsed["_meta"].update({"model_id": model, "attempts": attempt + 1})
            return parsed
        except ValueError as exc:
            last_error = exc
            _log.warning(
                "model returned unparseable JSON (attempt %d/%d): %s",
                attempt + 1, attempts, _short(raw, 200),
            )
            convo = list(messages) + [
                {"role": "assistant", "content": raw},
                {"role": "user", "content": REPAIR_MESSAGE},
            ]

    raise ApiError(
        502,
        "provider_error",
        f"the language model did not return valid JSON after {attempts} attempts "
        f"({last_error}); last output began: {_short(last_raw, 120)}",
    )


# --------------------------------------------------------------------------- mock mode

async def _mock_latency(cfg: dict[str, Any]) -> None:
    latency = cfg.get("latency_ms") or 0
    try:
        latency = int(latency)
    except (TypeError, ValueError):
        latency = 0
    if latency > 0:
        await asyncio.sleep(latency / 1000.0)


def _mock_text(mock_kind: str | None, messages: list[Message]) -> str:
    if mock_kind == "why_wrong":
        return _FIXTURES["why_wrong"]["explanation"]
    if mock_kind in _FIXTURES:
        return json.dumps(_FIXTURES[mock_kind], ensure_ascii=False)
    last = messages[-1]["content"] if messages else ""
    return f"[mock] {_short(last, 120)}"


def mock_fixture(mock_kind: str | None) -> dict[str, Any]:
    """Deterministic canned response for `mock_kind` (falls back to `generic`)."""
    key = mock_kind if mock_kind in _FIXTURES else "generic"
    fixture = copy.deepcopy(_FIXTURES[key])
    fixture["_meta"] = {"model_id": "mock-model-1", "attempts": 1, "mock_kind": key}
    return fixture


# 04 §6.3 — speaking evaluation JSON, verbatim shape.
_SPEAKING_EVAL: dict[str, Any] = {
    "overall_band": 6.5,
    "criteria": {
        "fc": {
            "band": 6,
            "evidence": [
                ("\"I live in a small city and there were very much cars\" — the idea "
                 "is delivered but the link between clauses is loose"),
                "Frequent self-correction in Part 1 ('I go — I went to the university')",
            ],
            "improvements": [
                "Practise linking contrast with 'whereas' instead of restarting the sentence",
                "Plan the Part 2 answer for the full minute so you avoid mid-answer resets",
            ],
        },
        "lr": {
            "band": 7,
            "evidence": [
                "\"my daily commute takes an hour\" — precise, natural collocation",
                "\"the traffic builds up around eight\" used accurately under pressure",
            ],
            "improvements": [
                "Replace vague quantifiers ('very much cars') with 'heavy traffic'",
            ],
        },
        "gra": {
            "band": 6,
            "evidence": [
                "\"I am agree with this idea\" — recurring verb-form error",
                "Complex sentences are attempted but relative clauses often break",
            ],
            "improvements": [
                "Drill 'agree' as a full verb: I agree / I agreed / I don't agree",
                "Practise one relative clause per answer until it is automatic",
            ],
        },
        "pron": {
            "band": 6,
            "evidence": [
                "Measured GOP mean 0.71 with 'comfortable' scoring 0.31",
                "Intonation flatness 0.62 — statements often end level",
            ],
            "improvements": [
                "Shadow three sentences a day focusing on falling intonation",
            ],
        },
    },
    "best_moments": [
        ("\"the traffic builds up around eight, so I leave before seven\" — natural, "
         "fluent, and answers the question directly"),
        "\"it depends on whether I'm working from home\" — good conditional control",
    ],
    "errors": [
        {
            "quote": "I am agree with this idea",
            "issue": "verb form: 'agree' is not used with 'am'",
            "better": "I agree with this idea",
        },
        {
            "quote": "there were very much cars",
            "issue": "quantifier: 'very much' does not modify a countable noun",
            "better": "there was heavy traffic",
        },
    ],
    "vocab_to_bank": [
        {
            "term": "commute",
            "type": "word",
            "reason": "used correctly under pressure — reinforce",
            "context_quote": "my daily commute takes an hour",
        },
        {
            "term": "heavy traffic",
            "type": "collocation",
            "reason": "upgrade for 'very much cars'",
            "context_quote": "there were very much cars",
        },
        {
            "term": "build up",
            "type": "phrasal_verb",
            "reason": "strong natural phrasing the learner already produced",
            "context_quote": "the traffic builds up around eight",
        },
    ],
}

# 05 §6.2 — writing evaluation JSON, verbatim shape.
_WRITING_EVAL: dict[str, Any] = {
    "criteria": {
        "task_achievement": {
            "band": 6,
            "comment": (
                "The essay addresses both parts of the question but develops the second "
                "far less than the first. The position is clear in the introduction and "
                "conclusion, though body paragraph two drifts into a related topic."
            ),
            "evidence_quotes": ["In my opinion, both governments and individuals share this duty."],
        },
        "coherence_cohesion": {
            "band": 6,
            "comment": (
                "Paragraphing is logical and each paragraph has one controlling idea. "
                "Linking is mechanical — 'Firstly', 'Secondly', 'In conclusion' carry most "
                "of the work and referencing is occasionally unclear."
            ),
            "evidence_quotes": ["Firstly, the government should invest in public transport."],
        },
        "lexical_resource": {
            "band": 6,
            "comment": (
                "Vocabulary is adequate for the task with some attempts at less common "
                "items. Word-choice slips and one spelling error do not block meaning."
            ),
            "evidence_quotes": ["peoples are agree with this opinion"],
        },
        "grammatical_range_accuracy": {
            "band": 6,
            "comment": (
                "A mix of simple and complex sentences is present, but subject-verb "
                "agreement and article use are inconsistent. Meaning is still recoverable."
            ),
            "evidence_quotes": ["peoples are agree with this opinion"],
        },
    },
    "overall_band": 6.0,
    "annotated_errors": [
        {
            "quote": "peoples are agree with this opinion",
            "type": "grammar",
            "fix": "people agree with this opinion",
            "explanation": "'People' is already plural, and 'agree' needs no 'are'.",
        },
        {
            "quote": "In nowadays",
            "type": "vocabulary",
            "fix": "Nowadays",
            "explanation": "'Nowadays' is an adverb and takes no preposition.",
        },
        {
            "quote": "goverment",
            "type": "spelling",
            "fix": "government",
            "explanation": "The 'n' before 'ment' is not optional.",
        },
    ],
    "structure_analysis": {
        "paragraphs": [
            {"index": 1, "role": "introduction",
             "verdict": "Paraphrases the prompt and states a clear position."},
            {"index": 2, "role": "body-1",
             "verdict": "One idea, well supported with a concrete example."},
            {"index": 3, "role": "body-2",
             "verdict": "Introduces two ideas and develops neither fully."},
            {"index": 4, "role": "conclusion",
             "verdict": "Restates the position but adds a new argument, which weakens it."},
        ],
        "missing_elements": ["no explicit topic sentence in body-2"],
        "summary": (
            "The essay has a recognisable four-paragraph structure with a clear position. "
            "Body two is the weak point: two competing ideas share one paragraph. "
            "The conclusion should summarise rather than introduce."
        ),
    },
    "vocab_upgrades": [
        {"used": "very big problem", "better": "pressing issue",
         "example": "Traffic congestion is a pressing issue in most large cities."},
        {"used": "a lot of people", "better": "a substantial proportion of the population",
         "example": "A substantial proportion of the population commutes by car."},
        {"used": "good for environment", "better": "environmentally beneficial",
         "example": "Cycling to work is environmentally beneficial and cheap."},
    ],
    "model_answer_outline": [
        "Introduction: paraphrase the prompt, state a two-part position in one sentence.",
        "Body 1: government responsibility — infrastructure investment, with an example.",
        "Body 2: individual responsibility — daily choices, with an example.",
        "Conclusion: weigh the two and restate the position without new arguments.",
    ],
}

# 06 §3 — generated reading passage + question groups.
_READING_GENERATE: dict[str, Any] = {
    "schema_version": 1,
    "id": "rt_mock_0001",
    "format": "academic",
    "title": "Mock Academic Reading Passage",
    "source": "generated",
    "band_target": 7.0,
    "generation": {"model": "mock-model-1", "validated": True, "validation_report_id": None},
    "passages": [
        {
            "id": "p1",
            "position": 1,
            "title": "The Quiet Return of the Urban Beaver",
            "topic": "urban ecology",
            "word_count": 812,
            "difficulty": "medium",
            "gt_section": None,
            "texts": [
                {
                    "id": "t1",
                    "heading": None,
                    "paragraphs": [
                        {"id": "A", "text": "For most of the twentieth century the beaver was "
                                            "absent from European rivers, trapped almost to "
                                            "extinction for its fur and its glands."},
                        {"id": "B", "text": "Reintroduction programmes begun in the 1990s have "
                                            "quietly restored the animal to catchments that had "
                                            "not seen one in three hundred years."},
                        {"id": "C", "text": "Hydrologists now measure a measurable slowing of "
                                            "flood peaks downstream of beaver dams, though the "
                                            "effect varies with catchment size."},
                    ],
                }
            ],
            "question_groups": [
                {
                    "id": "g1",
                    "type": "true_false_not_given",
                    "instructions_extra": None,
                    "word_limit": None,
                    "allow_reuse": True,
                    "options": None,
                    "layout": None,
                    "questions": [
                        {
                            "number": 1,
                            "prompt": "Beavers disappeared from European rivers because of hunting.",
                            "answers": [{"value": "true"}],
                            "anchor_paragraphs": ["A"],
                            "evidence_quote": "trapped almost to extinction for its fur and its glands",
                            "explanation": "'Trapped almost to extinction' states the cause directly.",
                            "trap_note": "The passage never mentions disease, so FALSE is a trap.",
                            "difficulty": "easy",
                            "band_target": 5.5,
                        },
                        {
                            "number": 2,
                            "prompt": "Beaver dams reduce flooding equally in all catchments.",
                            "answers": [{"value": "false"}],
                            "anchor_paragraphs": ["C"],
                            "evidence_quote": "the effect varies with catchment size",
                            "explanation": "'Varies with catchment size' contradicts 'equally in all'.",
                            "trap_note": "Scope shift: 'all' versus 'varies'.",
                            "difficulty": "medium",
                            "band_target": 6.5,
                        },
                    ],
                },
                {
                    "id": "g2",
                    "type": "sentence_completion",
                    "instructions_extra": None,
                    "word_limit": {"max_words": 2, "numbers_allowed": True},
                    "allow_reuse": False,
                    "options": None,
                    "layout": None,
                    "questions": [
                        {
                            "number": 3,
                            "prompt": "Reintroduction schemes started in the {{gap}}.",
                            "answers": [{"value": "1990s"}],
                            "anchor_paragraphs": ["B"],
                            "evidence_quote": "Reintroduction programmes begun in the 1990s",
                            "explanation": "The decade is stated verbatim.",
                            "trap_note": None,
                            "difficulty": "easy",
                            "band_target": 5.0,
                        }
                    ],
                },
            ],
        }
    ],
}

# 07 §2 — generated listening script.
_LISTENING_GENERATE: dict[str, Any] = {
    "schema_version": 1,
    "part": 1,
    "title": "Booking a city cycling tour",
    "scenario": (
        "A caller books a guided cycling tour; the agent collects personal details "
        "and explains the options."
    ),
    "accent_set": "uk",
    "target_band": 6.0,
    "speakers": [
        {"id": "narrator", "name": "Narrator", "voice": "bm_george", "accent": "uk",
         "role": "narrator"},
        {"id": "s1", "name": "Agent (Karen)", "voice": "bf_emma", "accent": "uk",
         "role": "female_1"},
        {"id": "s2", "name": "Caller (Tom)", "voice": "bm_lewis", "accent": "uk",
         "role": "male_1"},
    ],
    "lines": [
        {"speaker": "narrator",
         "text": "Part one. You will hear a man booking a cycling tour. First, you have "
                 "thirty seconds to look at questions one to five.",
         "pause_after_ms": 30000},
        {"speaker": "s1", "text": "Good morning, City Cycle Tours, Karen speaking.",
         "pause_after_ms": 300},
        {"speaker": "s2", "text": "Oh hello. I'd like to book a place on one of your harbour "
                                  "tours, please.", "pause_after_ms": 250},
        {"speaker": "s1", "text": "Of course. Could I take your surname first?",
         "pause_after_ms": 250},
        {"speaker": "s2", "text": "It's Bramley. That's B-R-A-M-L-E-Y.", "pause_after_ms": 400},
        {"speaker": "s1", "text": "And the tour leaves from the market square at nine.",
         "pause_after_ms": 300},
    ],
    "questions": [
        {
            "n": 1,
            "type": "form_completion",
            "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
            "word_limit": {"words": 1, "numbers": 1},
            "prompt": "Surname: ______",
            "answers": [["bramley"]],
            "cue_line_index": 4,
        },
        {
            "n": 2,
            "type": "multiple_choice",
            "instruction": "Choose the correct letter, A, B or C.",
            "prompt": "The tour departs from",
            "options": {"A": "the ferry terminal", "B": "the railway station",
                        "C": "the market square"},
            "answers": [["C"]],
            "cue_line_index": 5,
        },
    ],
}

# 08 §5.2.3 — use-in-a-sentence check.
_VOCAB_CHECK: dict[str, Any] = {
    "acceptable": True,
    "issues": [],
    "better_version": "",
}

# 06 §6.1 — "why was I wrong" trap analysis (prose, wrapped for chat_json callers).
_WHY_WRONG: dict[str, Any] = {
    "explanation": (
        "The passage says only that \"the effect varies with catchment size\" — it never "
        "claims the benefit is the same everywhere. You fell for a scope/quantifier shift: "
        "the question's \"equally in all catchments\" is a stronger claim than anything the "
        "text supports, so the statement is FALSE rather than NOT GIVEN. When a question "
        "uses an absolute word like all, every or never, hunt for the hedge in the passage "
        "first — if the text hedges and the question does not, the answer is usually FALSE."
    ),
    "trap": "scope/quantifier shift",
    "tip": (
        "Underline absolute words in the question before you scan; then look for the "
        "matching hedge in the text."
    ),
}
_WHY_WRONG["text"] = _WHY_WRONG["explanation"]

_GENERIC: dict[str, Any] = {
    "ok": True,
    "text": "mock response",
    "items": [],
}

_FIXTURES: dict[str, dict[str, Any]] = {
    "speaking_eval": _SPEAKING_EVAL,
    "writing_eval": _WRITING_EVAL,
    "reading_generate": _READING_GENERATE,
    "listening_generate": _LISTENING_GENERATE,
    "vocab_check": _VOCAB_CHECK,
    "why_wrong": _WHY_WRONG,
    "generic": _GENERIC,
}

MOCK_KINDS: tuple[str, ...] = tuple(_FIXTURES)

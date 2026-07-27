"""Examiner realism: the conduct rules of a real IELTS-style Speaking test.

Everything here is derived from the round-1 research briefing
``content/core-en/staging/research/01-exam-reality.md`` (cited below as **R1 §n**). The
briefing's central finding for the live pipeline is that the examiner is defined far more
by what they *refuse* to do than by what they say: they never correct, never teach, never
evaluate, never police relevance, and — during the Part 2 long turn — never make a sound
at all (R1 §3.3, §7 "register rules", §8).

An LLM left to itself does the exact opposite. It is helpful. It explains the word the
candidate stumbled on, it says "good answer", it nudges a wandering candidate back on
topic. Each of those is a realistic-looking behaviour that no real examiner performs, and
a mock that behaves that way trains the wrong reflexes.

So this module holds three kinds of thing, all Pipecat-free and directly unit-testable:

* **Scripted moves** (:data:`SCRIPTED_MOVES`) — the wording of every part transition and
  every procedural line. These bypass the LLM entirely so the ritual is byte-identical in
  every session (R1 §7: "consistency over personality"). :mod:`bandready.voice.state_machine`
  imports its ``LINE_*`` constants from here, so there is exactly one source of truth.
* **Policies** — pure decision functions: what to do when the candidate asks for a repeat
  or a rephrase (part-dependent, R1 §8), and what to do when the long turn stalls or
  overruns (R1 §3.3).
* **Guards** — pure checks over generated examiner text: is this turn too long, is it
  praising / correcting / steering, is the candidate still holding ~80% of the airtime
  (R1 §7).

Copyright note: every line of examiner speech in this module is original text written for
BandReady, in the *register* the research describes. No official frame wording is
reproduced. Product copy says "IELTS-style".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from bandready.voice.metrics import word_count

__all__ = [
    "AIRTIME_TOLERANCE",
    "CANDIDATE_AIRTIME_TARGET",
    "LINE_DECLINE_MEANING",
    "LINE_DECLINE_REPHRASE",
    "LINE_DEFLECT_OPINION",
    "LINE_GREETING",
    "LINE_LONG_TURN_PROMPT",
    "LINE_P1_START",
    "LINE_P2_BEGIN",
    "LINE_P2_INTRO",
    "LINE_P2_STOP",
    "LINE_P3_INTRO",
    "LINE_SILENCE_PROMPT",
    "LINE_WRAP_UP",
    "LONG_TURN_MAX_PROMPTS",
    "LONG_TURN_MAX_S",
    "LONG_TURN_MIN_S",
    "MAX_EXAMINER_SENTENCES",
    "MAX_EXAMINER_WORDS",
    "OFF_TOPIC_RULE",
    "SCRIPTED_MOVES",
    "AirtimeCheck",
    "ClarificationPolicy",
    "ClarificationRequest",
    "TurnLengthCheck",
    "TurnViolation",
    "airtime_check",
    "airtime_from_turns",
    "clarification_instruction",
    "clarification_policy",
    "detect_clarification_request",
    "estimate_speech_seconds",
    "examiner_rules_fragment",
    "examiner_turn_length",
    "examiner_turn_violations",
    "is_scripted_move_text",
    "long_turn_decision",
    "long_turn_prompt_line",
    "scripted_line",
    "uncovered_bullet",
]


# =====================================================================================
# 1. Scripted moves — R1 §7
# =====================================================================================
#
# The examiner works from a frame. Parts 1 and 2 are delivered close to verbatim, which is
# exactly *why* the examiner cannot paraphrase in Part 1 (R1 §7, §8). Any line whose
# wording is part of the ritual therefore lives here and is queued as a TTSSpeakFrame —
# never generated. A model that re-invents "Can you start speaking now, please?" every
# session gives every candidate a slightly different test, which is the one thing a
# standardised exam may not do.


@dataclass(frozen=True)
class ScriptedMove:
    """One frame move: what it is for, and the exact words we say."""

    id: str
    function: str
    template: str
    fields: tuple[str, ...] = ()
    #: True when the move is a part boundary (R1 §7 moves 5, 9, 17, 21).
    is_transition: bool = False


_MOVES: tuple[ScriptedMove, ...] = (
    ScriptedMove(
        id="greeting",
        function="open the test, identify the examiner, start the recording cleanly",
        template=(
            "Good day. My name is your examiner today. "
            "Can you tell me your full name, please?"
        ),
    ),
    ScriptedMove(
        id="p1_launch",
        function="signal the shift from admin to test",
        template=(
            "Thank you. Now, in this first part, I'd like to ask you some questions "
            "about yourself."
        ),
        is_transition=True,
    ),
    ScriptedMove(
        id="p2_launch",
        function="flag the change of task type, hand over the card, license notes",
        template=(
            "Now, I'm going to give you a topic, and I'd like you to talk about it for "
            "one to two minutes. Before you talk, you'll have one minute to think about "
            "what you're going to say. You can make some notes if you wish. Here is your "
            "topic. I'd like you to {topic_line}"
        ),
        fields=("topic_line",),
        is_transition=True,
    ),
    ScriptedMove(
        id="p2_begin",
        function="hand the floor over, and pre-empt panic at the cut-off (R1 §7 move 12)",
        template=(
            "All right? Remember, you have one to two minutes for this, so don't worry if "
            "I stop you. I'll tell you when the time is up. Can you start speaking now, "
            "please?"
        ),
    ),
    ScriptedMove(
        id="p2_stop",
        function="end the long turn on time, mid-sentence if needed, with no evaluation",
        template="Thank you.",
    ),
    ScriptedMove(
        id="p2_prompt",
        function="the single permitted nudge when the long turn dries up early (R1 §3.3)",
        template="Is there anything more you can tell me about {bullet}?",
        fields=("bullet",),
    ),
    ScriptedMove(
        id="p2_prompt_generic",
        function="the same nudge when no bullet is identifiably uncovered",
        template="Is there anything else you'd like to add?",
    ),
    ScriptedMove(
        id="p3_bridge",
        function="name the Part 2 topic and announce the shift to the general",
        template=(
            "We've been talking about {topic_short}, and I'd like to discuss with you one "
            "or two more general questions related to this."
        ),
        fields=("topic_short",),
        is_transition=True,
    ),
    ScriptedMove(
        id="closing",
        function="end the test cleanly, give no result and no feedback",
        template="Thank you. That is the end of the Speaking test.",
        is_transition=True,
    ),
    ScriptedMove(
        id="silence_prompt",
        function="extension move when a candidate stalls outside the long turn",
        template="Take your time — would you like me to repeat the question?",
    ),
    ScriptedMove(
        id="decline_rephrase",
        function="refuse to reword a scripted question, offer the one thing allowed",
        template="I'm not able to reword the question, but I can read it to you again.",
    ),
    ScriptedMove(
        id="decline_meaning",
        function="refuse to gloss vocabulary in Parts 1-2 (R1 §8)",
        template=(
            "I'm not able to explain what a word means, but I can read the question again."
        ),
    ),
    ScriptedMove(
        id="deflect_opinion",
        function="turn a question about the examiner's own views back to the candidate",
        template="It's your views we're interested in here, not mine.",
    ),
)

SCRIPTED_MOVES: dict[str, ScriptedMove] = {move.id: move for move in _MOVES}


def scripted_line(move_id: str, **fields: Any) -> str:
    """The exact words for ``move_id``. Raises on an unknown move or a missing field."""
    move = SCRIPTED_MOVES.get(move_id)
    if move is None:
        raise KeyError(f"unknown scripted move {move_id!r}")
    missing = [name for name in move.fields if name not in fields]
    if missing:
        raise KeyError(f"scripted move {move_id!r} needs {missing}")
    return move.template.format(**fields) if move.fields else move.template


# Named aliases, so ``state_machine`` keeps its ``LINE_*`` vocabulary while the text is
# defined exactly once, here.
LINE_GREETING = scripted_line("greeting")
LINE_P1_START = scripted_line("p1_launch")
LINE_P2_INTRO = SCRIPTED_MOVES["p2_launch"].template
LINE_P2_BEGIN = scripted_line("p2_begin")
LINE_P2_STOP = scripted_line("p2_stop")
LINE_P3_INTRO = SCRIPTED_MOVES["p3_bridge"].template
LINE_WRAP_UP = scripted_line("closing")
LINE_SILENCE_PROMPT = scripted_line("silence_prompt")
LINE_DECLINE_REPHRASE = scripted_line("decline_rephrase")
LINE_DECLINE_MEANING = scripted_line("decline_meaning")
LINE_DEFLECT_OPINION = scripted_line("deflect_opinion")
LINE_LONG_TURN_PROMPT = SCRIPTED_MOVES["p2_prompt"].template

def _template_pattern(template: str) -> re.Pattern[str]:
    """A regex matching a scripted line with its ``{field}`` slots wildcarded."""
    collapsed = " ".join(template.split())
    # re.escape turns "{topic_line}" into "\{topic_line\}"; put ".*" back in its place.
    body = re.sub(r"\\\{[a-z_]+\\\}", ".*", re.escape(collapsed))
    return re.compile(f"^{body}$", re.IGNORECASE)


_SCRIPTED_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    _template_pattern(move.template) for move in _MOVES
)


def is_scripted_move_text(text: str) -> bool:
    """True when ``text`` is one of our scripted lines (templated fields wildcarded).

    Used to exempt frame moves from the turn-length guard: the Part 2 launch is long
    *by design*, and its length says nothing about the model drifting chatty.
    """
    collapsed = " ".join((text or "").split())
    return any(pattern.match(collapsed) for pattern in _SCRIPTED_PATTERNS)


# =====================================================================================
# 2. Repeat vs rephrase — the part-dependent asymmetry, R1 §8
# =====================================================================================
#
# R1 §8's table is the whole rule, and it is asymmetric:
#
#   * Part 1 — the examiner may REPEAT a question verbatim. They may NOT reword it and may
#     NOT explain what a word means, because the Part 1 frame is a script.
#   * Part 2 — same restriction; the card is in front of the candidate and re-reading it is
#     the remedy. During the long turn itself the examiner says nothing at all.
#   * Part 3 — a genuine discussion, so the examiner may repeat, reword, and explain a term.
#
# The briefing flags this as [convention] with medium-high confidence: it is unanimous
# among former-examiner sources and follows from the scripted/discussion split, but the
# partners never published it. We implement it because the cost of being wrong is small
# (a mock that is slightly stricter than the real room) and the cost of the LLM's default
# behaviour — cheerfully glossing vocabulary in Part 1 — is a candidate who expects help
# that will not come.

REPEAT = "repeat"
REPHRASE = "rephrase"
MEANING = "meaning"
OPINION = "opinion"

#: Actions a policy can return.
ACT_REPEAT = "repeat"
ACT_REPHRASE = "rephrase"
ACT_EXPLAIN = "explain"
ACT_DECLINE = "decline"
ACT_DEFLECT = "deflect"
ACT_SILENCE = "silence"

#: R1 §8 — "asking once or twice costs nothing"; a habit of it is dead airtime. We never
#: refuse, but the count is worth surfacing in the report.
CLARIFICATION_FREE_ALLOWANCE = 2

#: Weak cues ("sorry?", "again?") only count as a request in a short utterance; inside a
#: long answer they are almost always discourse, not a request to the examiner.
_SHORT_UTTERANCE_WORDS = 18


@dataclass(frozen=True)
class ClarificationRequest:
    """A detected candidate request for help."""

    kind: str
    matched: str
    #: The word whose meaning was asked about, when we could identify it.
    term: str | None = None


@dataclass(frozen=True)
class ClarificationPolicy:
    """What the examiner does about a request, for the part they are in."""

    kind: str
    part: int
    action: str
    #: True when our wording is fixed: the response is quoted verbatim into the turn
    #: instructions rather than composed by the model.
    scripted: bool
    #: The fixed words that precede any repetition (None = go straight to the repeat).
    lead_in: str | None
    #: Whether the current question is then put again, word for word.
    repeat_question: bool
    #: Instruction the model is given when it must compose the response itself.
    llm_instruction: str | None
    rationale: str
    #: Always False: a request for help never consumes the question.
    advance_question: bool = False


_STRONG_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        MEANING,
        re.compile(
            r"\bwhat(?:'s| is| does)?\s+(?:the meaning of\s+)?[\"']?(?P<term>[\w' -]{2,30}?)"
            r"[\"']?\s*(?:mean|means)\b",
            re.IGNORECASE,
        ),
    ),
    (MEANING, re.compile(r"\b(?:the meaning of|what do you mean by)\b", re.IGNORECASE)),
    (
        MEANING,
        re.compile(
            r"\bi (?:don't|do not) know (?:the word|what)\b.{0,40}\bmeans?\b", re.IGNORECASE
        ),
    ),
    (
        REPEAT,
        re.compile(
            r"\b(?:could|can|would) you (?:please )?"
            r"(?:repeat|say (?:that|it|the question) again|read (?:that|it|the question) again)",
            re.IGNORECASE,
        ),
    ),
    (REPEAT, re.compile(r"\b(?:say that again|come again|one more time)\b", re.IGNORECASE)),
    (
        REPEAT,
        re.compile(r"\bi (?:didn't|did not) (?:catch|hear|get) (?:that|it|you)\b", re.IGNORECASE),
    ),
    (
        REPHRASE,
        re.compile(
            r"\b(?:could|can|would) you (?:please )?"
            r"(?:rephrase|reword|explain|simplify|put (?:that|it) (?:another way|differently))",
            re.IGNORECASE,
        ),
    ),
    (
        REPHRASE,
        re.compile(
            r"\bi (?:don't|do not) understand (?:the question|that question|what you (?:mean|"
            r"are asking))",
            re.IGNORECASE,
        ),
    ),
    (
        OPINION,
        re.compile(
            r"\bwhat (?:do you think|about you|is your (?:opinion|view))\b", re.IGNORECASE
        ),
    ),
    (OPINION, re.compile(r"\b(?:how about you|and you|do you agree)\b\s*\?", re.IGNORECASE)),
)

_WEAK_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (REPEAT, re.compile(r"^\s*(?:sorry|pardon|excuse me|again|what)\s*\?", re.IGNORECASE)),
    (REPEAT, re.compile(r"\b(?:sorry|pardon)\s*\?", re.IGNORECASE)),
    (REPHRASE, re.compile(r"\bi (?:don't|do not) understand\b", re.IGNORECASE)),
)


def detect_clarification_request(text: str) -> ClarificationRequest | None:
    """Classify a candidate turn as a request for repetition / rewording / meaning / opinion.

    Returns ``None`` for an ordinary answer. Order matters: "what does X mean" is a
    *meaning* request, not an opinion one, and must be tested first.
    """
    body = (text or "").strip()
    if not body:
        return None
    for kind, pattern in _STRONG_PATTERNS:
        match = pattern.search(body)
        if match:
            term = None
            if kind == MEANING and "term" in (match.groupdict() or {}):
                term = (match.group("term") or "").strip() or None
            return ClarificationRequest(kind=kind, matched=match.group(0).strip(), term=term)
    if word_count(body) <= _SHORT_UTTERANCE_WORDS:
        for kind, pattern in _WEAK_PATTERNS:
            match = pattern.search(body)
            if match:
                return ClarificationRequest(kind=kind, matched=match.group(0).strip())
    return None


def clarification_policy(
    part: int | None,
    kind: str,
    *,
    during_long_turn: bool = False,
) -> ClarificationPolicy:
    """R1 §8's table as a function. ``part`` outside 1-3 is treated as Part 1 (strictest)."""
    part_no = part if part in (1, 2, 3) else 1

    if during_long_turn:
        # R1 §3.3 — the examiner is silent for the whole long turn, including when the
        # candidate talks *to* them. Nothing is said, and nothing is scored for it.
        return ClarificationPolicy(
            kind=kind,
            part=2,
            action=ACT_SILENCE,
            scripted=True,
            lead_in=None,
            repeat_question=False,
            llm_instruction=None,
            rationale="R1 §3.3: no backchannel, no interruption, no help during the long turn",
        )

    if kind == OPINION:
        return ClarificationPolicy(
            kind=kind,
            part=part_no,
            action=ACT_DEFLECT,
            scripted=True,
            lead_in=LINE_DEFLECT_OPINION,
            repeat_question=True,
            llm_instruction=None,
            rationale="R1 §8: the examiner's own views are never volunteered",
        )

    if kind == REPEAT:
        # Allowed in every part — and scripted, because a verbatim repeat is the one
        # response whose wording is fixed by definition (R1 §8).
        return ClarificationPolicy(
            kind=kind,
            part=part_no,
            action=ACT_REPEAT,
            scripted=True,
            lead_in=None,
            repeat_question=True,
            llm_instruction=None,
            rationale="R1 §8: repetition is permitted in all three parts",
        )

    # kind in (REPHRASE, MEANING)
    if part_no == 3:
        action = ACT_EXPLAIN if kind == MEANING else ACT_REPHRASE
        instruction = (
            "The candidate has just asked you to explain a word in the question. Give a "
            "one-sentence plain-English gloss of it, then put the question again in "
            "simpler words. Do not answer the question yourself and do not comment on "
            "their English."
            if kind == MEANING
            else "The candidate has just said they did not understand the question. Put the "
            "same question again in simpler, shorter words. Keep the meaning identical, "
            "do not answer it yourself, and do not comment on their English."
        )
        return ClarificationPolicy(
            kind=kind,
            part=3,
            action=action,
            scripted=False,
            lead_in=None,
            repeat_question=False,
            llm_instruction=instruction,
            rationale="R1 §8: Part 3 is a discussion, so rewording and glossing are allowed",
        )

    return ClarificationPolicy(
        kind=kind,
        part=part_no,
        action=ACT_DECLINE,
        scripted=True,
        lead_in=LINE_DECLINE_MEANING if kind == MEANING else LINE_DECLINE_REPHRASE,
        repeat_question=True,
        llm_instruction=None,
        rationale=(
            "R1 §8: the Parts 1-2 frame is scripted, so the examiner may repeat but may "
            "neither reword nor gloss vocabulary"
        ),
    )


def clarification_instruction(policy: ClarificationPolicy, question: str | None = None) -> str:
    """The turn instruction that carries out ``policy``.

    Delivery goes through the question card rather than through a separately queued
    scripted line, deliberately: the candidate's request and the examiner's reply land in
    the *same* turn, and two voices answering one request would talk over each other. Our
    wording is still fixed — for a scripted policy it is quoted here word for word, and
    the model is told to add nothing.
    """
    if policy.action == ACT_SILENCE:
        return ""
    if policy.llm_instruction:
        return policy.llm_instruction

    parts: list[str] = []
    if policy.action == ACT_REPEAT:
        parts.append("The candidate has asked you to repeat the question.")
    elif policy.action == ACT_DECLINE:
        parts.append(
            "The candidate has asked you to reword the question or explain a word in it. "
            "In this part of the test you may not do either."
        )
    elif policy.action == ACT_DEFLECT:
        parts.append("The candidate has asked for your own opinion. You never give one.")
    if policy.lead_in:
        parts.append(f'Say exactly this, word for word: "{policy.lead_in}"')
    if policy.repeat_question:
        target = f' It is: "{question}"' if question else ""
        lead = "Then put" if policy.lead_in else "Put"
        parts.append(
            f"{lead} the same question again word for word, with no rewording, no "
            f"simplification, no explanation and no extra comment.{target}"
        )
    return " ".join(parts)


# =====================================================================================
# 3. The long turn — silence, one prompt, a neutral cut-off (R1 §3.3)
# =====================================================================================
#
# Three findings drive this:
#   * The examiner is *silent* from the start cue onwards. No "mm-hm", no follow-up. R1
#     calls this the single most unnerving feature of the real exam and explicitly worth
#     simulating faithfully.
#   * At two minutes the candidate is stopped, mid-sentence if necessary, with a bare
#     acknowledgment. Being stopped is a GOOD sign and carries no penalty — so the cut-off
#     line must contain nothing that reads as a judgement.
#   * If the candidate dries up before roughly a minute, the examiner prompts ONCE, then
#     moves on. [convention, medium confidence on the trigger point.]

LONG_TURN_MIN_S = 60.0
LONG_TURN_MAX_S = 120.0
LONG_TURN_END_SILENCE_S = 8.0
LONG_TURN_MAX_PROMPTS = 1
#: R1 §3.3 / §7 move 14 — the absence of backchannel *is* the examiner's behaviour here.
BACKCHANNEL_ALLOWED = False

#: Decisions returned by :func:`long_turn_decision`.
LT_SILENT = "silent"
LT_PROMPT = "prompt"
LT_END = "end"
LT_STOP = "stop"

_BULLET_LEAD = re.compile(
    r"^(?:and\s+)?(?:say\s+|explain\s+|describe\s+|talk about\s+)?", re.IGNORECASE
)
_BULLET_STOPWORDS = frozenset(
    {
        "a", "about", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by",
        "did", "do", "does", "each", "explain", "for", "from", "had", "has", "have", "how",
        "i", "if", "in", "is", "it", "its", "like", "many", "me", "much", "my", "of", "often",
        "on", "or", "say", "should", "so", "some", "that", "the", "their", "them", "then",
        "there", "these", "they", "this", "to", "under", "up", "was", "were", "what", "when",
        "where", "whether", "which", "while", "who", "why", "will", "with", "would", "you",
        "your",
    }
)


def long_turn_decision(
    *,
    speech_s: float,
    elapsed_s: float = 0.0,
    candidate_speaking: bool = True,
    prompts_used: int = 0,
    min_s: float = LONG_TURN_MIN_S,
    max_s: float = LONG_TURN_MAX_S,
    max_prompts: int = LONG_TURN_MAX_PROMPTS,
) -> str:
    """What the examiner does right now during the Part 2 long turn.

    ``speech_s`` is how much the candidate has actually *spoken* (silence excluded);
    ``elapsed_s`` is wall-clock since the start cue. Returns one of :data:`LT_SILENT`,
    :data:`LT_PROMPT`, :data:`LT_END`, :data:`LT_STOP`.

    The hard cut-off wins over everything, including a candidate in mid-flow — that is
    precisely the behaviour being simulated (R1 §3.3, §8 "being interrupted").
    """
    if elapsed_s >= max_s:
        return LT_STOP
    if candidate_speaking:
        return LT_SILENT
    if speech_s >= min_s:
        # A full-length turn that has clearly ended: move on, no prompt, no praise.
        return LT_END
    if prompts_used < max_prompts:
        return LT_PROMPT
    # Prompted once already and still nothing. The examiner does not nag; a short turn is
    # self-penalising through the fluency criterion, not through anything said here.
    return LT_END


def _content_words(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[a-z']+", (text or "").lower())
        if len(word) >= 2 and word not in _BULLET_STOPWORDS
    }


def uncovered_bullet(bullets: list[str] | tuple[str, ...], said: str) -> str | None:
    """The first cue-card bullet with no content word echoed in what the candidate said.

    A deliberately shallow lexical check: the prompt only has to point somewhere useful,
    and R1 §3.3 is explicit that bullets are a planning aid, never a scored checklist — so
    a wrong guess costs the candidate nothing.
    """
    spoken = _content_words(said)
    for bullet in bullets or ():
        keywords = _content_words(bullet)
        if not keywords:
            continue
        if not (keywords & spoken):
            return bullet
    return None


def _clean_bullet(bullet: str) -> str:
    text = " ".join((bullet or "").split()).rstrip(".").strip()
    text = _BULLET_LEAD.sub("", text, count=1).strip()
    if text and text[:2] != text[:2].upper():
        text = text[0].lower() + text[1:]
    return text


def long_turn_prompt_line(bullet: str | None = None) -> str:
    """The single permitted nudge, aimed at an uncovered bullet when we have one."""
    clean = _clean_bullet(bullet or "")
    if not clean:
        return scripted_line("p2_prompt_generic")
    return scripted_line("p2_prompt", bullet=clean)


# =====================================================================================
# 4. Off-topic, misunderstanding, and the things the LLM must not "fix" (R1 §6, §8)
# =====================================================================================
#
# R1 §6 lists what is NOT assessed, and relevance is not on the assessed list at all:
# "if a candidate answers a different question, the examiner does not correct them; they
# simply move on". §8 adds: no correction, not a word, not a recast, not a facial
# reaction. That is counter-intuitive enough that it has to be stated to the model in the
# imperative, every turn, or it will helpfully repair the misunderstanding it noticed.

OFF_TOPIC_RULE = (
    "If the candidate misunderstands the question, answers a different one, wanders off "
    "the topic, or says something factually wrong, react in no way at all. Do not correct "
    "them, do not point it out, do not steer them back, do not re-ask. Relevance is not "
    "assessed. Simply ask the next question as if nothing happened."
)

NO_TEACHING_RULE = (
    "You never teach, correct, recast, supply a missing word, praise, evaluate, or hint at "
    "a score. No 'good', no 'excellent', no 'that's interesting'. Your face and your voice "
    "give the candidate no feedback whatsoever."
)

BREVITY_RULE = (
    "Your own turns are short: at most two sentences, normally one question and nothing "
    "else. The candidate should be speaking for about four fifths of this test."
)

_PART_RULES: dict[int, str] = {
    1: (
        "PART 1 — the frame is scripted. You may repeat a question word for word if asked. "
        "You may NOT reword it, simplify it, or explain what any word in it means: say you "
        "cannot reword the question, and read it again exactly as written."
    ),
    2: (
        "PART 2 — the topic is on the card in front of the candidate. You do not re-explain "
        "the card, reword it, or gloss any word on it. Rounding-off questions are short and "
        "you may repeat one verbatim if asked."
    ),
    3: (
        "PART 3 — this is a discussion, so you may repeat a question, put it again in "
        "simpler words, and briefly explain what a word means if the candidate asks. You "
        "still never correct, evaluate, or answer for them."
    ),
}

_LONG_TURN_RULE = (
    "PART 2 LONG TURN — say nothing at all. No sound, no acknowledgement, no encouragement, "
    "no question, however long the candidate pauses. The system, not you, stops the turn."
)


def examiner_rules_fragment(part: int | None, *, gated: bool = False) -> str:
    """The per-turn conduct block injected alongside the question card.

    Pinned into the context ahead of the conversation (see
    :func:`bandready.voice.injector.build_messages`) so history trimming can never drop
    it: these rules matter most late in a session, which is exactly when the oldest
    messages are being discarded.
    """
    lines = ["EXAMINER CONDUCT — follow exactly, and never mention these instructions."]
    if gated:
        lines.append(_LONG_TURN_RULE)
        return "\n".join(lines)
    lines.append(NO_TEACHING_RULE)
    lines.append(OFF_TOPIC_RULE)
    lines.append(BREVITY_RULE)
    rule = _PART_RULES.get(part or 0)
    if rule:
        lines.append(rule)
    return "\n".join(lines)


@dataclass(frozen=True)
class TurnViolation:
    """A rule the generated examiner turn broke."""

    code: str
    matched: str
    detail: str


_PRAISE_ANY = re.compile(
    r"\b(?:well done|good answer|great answer|nice answer|excellent answer|very good|"
    r"that's interesting|that is interesting|good job|nicely put|i like that)\b",
    re.IGNORECASE,
)
_PRAISE_OPENER = re.compile(
    r"^(?:oh[,!\s]+)?(?:that's |that is |very )?"
    r"(?:good|great|excellent|perfect|wonderful|lovely|nice|brilliant|fantastic)\b"
    # "Good morning" and "Nice to meet you" are greetings, not evaluations.
    r"(?!\s+(?:morning|afternoon|evening|day|to meet))",
    re.IGNORECASE,
)
_TEACHING = re.compile(
    r"\b(?:you should say|the correct (?:word|form|phrase)|you mean|we (?:usually )?say|"
    r"a better way to say|instead of saying|try saying|the right word is|"
    r"it should be|grammatically)\b",
    re.IGNORECASE,
)
_STEERING = re.compile(
    r"\b(?:that's not (?:what|quite what) i asked|you didn't answer|you haven't answered|"
    r"let's get back to|stay on the topic|off topic|that's off the point|"
    r"i asked about)\b",
    re.IGNORECASE,
)
_FEEDBACK = re.compile(
    r"\b(?:your band|band score|you'd (?:probably )?get|i'd give you|your english is|"
    r"you did (?:well|badly)|keep it up)\b",
    re.IGNORECASE,
)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def examiner_turn_violations(text: str) -> list[TurnViolation]:
    """Conduct violations in a generated examiner turn (R1 §6, §7, §8).

    A guard, not a filter: the caller decides whether to log, regenerate, or fall back to
    the scripted move. Scripted lines are exempt — they are the standard, by definition.
    """
    body = " ".join((text or "").split())
    if not body or is_scripted_move_text(body):
        return []
    found: list[TurnViolation] = []

    match = _PRAISE_ANY.search(body)
    if match:
        found.append(
            TurnViolation("praise", match.group(0), "the examiner never evaluates an answer")
        )
    if not found:
        for sentence in _SENTENCE_SPLIT.split(body):
            opener = _PRAISE_OPENER.match(sentence.strip())
            if opener:
                found.append(
                    TurnViolation(
                        "praise",
                        opener.group(0),
                        "an approving opener is feedback the exam forbids",
                    )
                )
                break
    for pattern, code, detail in (
        (_TEACHING, "teaching", "the examiner never corrects, recasts or supplies language"),
        (_STEERING, "steering", "relevance is not assessed; the examiner never redirects"),
        (_FEEDBACK, "feedback", "no score, estimate or hint is ever given"),
    ):
        match = pattern.search(body)
        if match:
            found.append(TurnViolation(code, match.group(0), detail))
    return found


# =====================================================================================
# 5. Turn discipline and airtime (R1 §7)
# =====================================================================================
#
# "The examiner's job is to maximise the candidate's talking time, so examiner turns are
# short by design. Roughly, the candidate should hold ~80% of the airtime." A chatty LLM
# examiner steals the very thing the test is trying to measure, and it does it invisibly —
# the session still *looks* fine. Hence a hard word budget per turn and a running share.

MAX_EXAMINER_WORDS = 40
MAX_EXAMINER_SENTENCES = 2
CANDIDATE_AIRTIME_TARGET = 0.80
AIRTIME_TOLERANCE = 0.05
#: Below this much total speech the share is noise (the greeting alone would fail it).
AIRTIME_MIN_SAMPLE_S = 60.0
#: Rough TTS pace, used only where we have text but no measured audio duration.
EXAMINER_WORDS_PER_SECOND = 2.6


def estimate_speech_seconds(text: str, words_per_second: float = EXAMINER_WORDS_PER_SECOND) -> float:
    """Seconds of speech ``text`` is worth. Used for examiner turns, which are not VAD-timed."""
    if words_per_second <= 0:
        return 0.0
    return word_count(text) / words_per_second


@dataclass(frozen=True)
class TurnLengthCheck:
    words: int
    sentences: int
    ok: bool
    scripted: bool
    reason: str | None = None


def examiner_turn_length(
    text: str,
    *,
    max_words: int = MAX_EXAMINER_WORDS,
    max_sentences: int = MAX_EXAMINER_SENTENCES,
) -> TurnLengthCheck:
    """Flag a generated examiner turn that is drifting long (R1 §7)."""
    body = " ".join((text or "").split())
    words = word_count(body)
    sentences = len([s for s in _SENTENCE_SPLIT.split(body) if s.strip()])
    if is_scripted_move_text(body):
        return TurnLengthCheck(words, sentences, True, True, "scripted frame move")
    if words > max_words:
        return TurnLengthCheck(
            words, sentences, False, False, f"{words} words (budget {max_words})"
        )
    if sentences > max_sentences:
        return TurnLengthCheck(
            words, sentences, False, False, f"{sentences} sentences (budget {max_sentences})"
        )
    return TurnLengthCheck(words, sentences, True, False, None)


@dataclass(frozen=True)
class AirtimeCheck:
    candidate_s: float
    examiner_s: float
    candidate_share: float
    target: float
    ok: bool
    #: False when there is too little speech so far for the share to mean anything.
    sample_ok: bool
    detail: str


def airtime_check(
    candidate_s: float,
    examiner_s: float,
    *,
    target: float = CANDIDATE_AIRTIME_TARGET,
    tolerance: float = AIRTIME_TOLERANCE,
    min_sample_s: float = AIRTIME_MIN_SAMPLE_S,
) -> AirtimeCheck:
    """Is the candidate still holding ~80% of the airtime? (R1 §7)"""
    candidate_s = max(0.0, float(candidate_s))
    examiner_s = max(0.0, float(examiner_s))
    total = candidate_s + examiner_s
    share = (candidate_s / total) if total > 0 else 0.0
    sample_ok = total >= min_sample_s
    floor = target - tolerance
    ok = (not sample_ok) or share >= floor
    if not sample_ok:
        detail = "too little speech so far to judge"
    elif ok:
        detail = f"candidate holds {share:.0%} of the airtime"
    else:
        detail = f"candidate holds only {share:.0%}; the examiner is talking too much"
    return AirtimeCheck(candidate_s, examiner_s, share, target, ok, sample_ok, detail)


def airtime_from_turns(turns: list[dict[str, Any]], **kwargs: Any) -> AirtimeCheck:
    """:func:`airtime_check` over a captured transcript.

    Candidate time comes from the VAD segments (real speech, silence excluded); examiner
    time is estimated from the words, since TTS output is not segmented.
    """
    candidate_s = 0.0
    examiner_s = 0.0
    for turn in turns or ():
        if turn.get("role") == "user":
            segments = turn.get("segments") or []
            measured = sum(
                max(0, int(s.get("t_end_ms", 0)) - int(s.get("t_start_ms", 0))) for s in segments
            ) / 1000.0
            candidate_s += measured or estimate_speech_seconds(str(turn.get("text") or ""))
        elif turn.get("role") == "assistant":
            examiner_s += estimate_speech_seconds(str(turn.get("text") or ""))
    return airtime_check(candidate_s, examiner_s, **kwargs)

"""Paraphrased band descriptors for speaking and writing (bands 4–9).

These are ORIGINAL paraphrases of the publicly published IELTS band descriptors — the
scoring criteria are facts of the assessment scheme, but the official descriptor wording
is copyrighted, so nothing here is copied text (15-content-authoring-licensing.md).
Source of truth for the wording: 04-speaking-module.md §6.2 and 05-writing-module.md §6.1.

Two consumers:

* the evaluators (04/05) — :func:`descriptor_table` renders the rows for a prompt, and
  :func:`descriptor` backs "why this band?" reasoning;
* the UI — the feedback screen's *what does band 6 mean?* popovers read the same data
  through the sidecar, so a learner and the examiner model are always looking at one
  rubric.

    >>> descriptor("writing", "lr", 7)[:37]
    'Enough range for flexibility and some'
    >>> writing_criterion_labels("task2")["ta"]
    'Task Response'
"""

from __future__ import annotations

from typing import Literal

__all__ = [
    "DESCRIPTOR_BANDS",
    "SPEAKING_CRITERIA",
    "SPEAKING_CRITERION_LABELS",
    "SPEAKING_DESCRIPTORS",
    "WRITING_CRITERIA",
    "WRITING_CRITERION_LABELS",
    "WRITING_CRITERION_WIRE",
    "WRITING_DESCRIPTORS",
    "criteria_for",
    "descriptor",
    "descriptor_table",
    "descriptors_for",
    "rubric_payload",
    "writing_criterion1_name",
    "writing_criterion_labels",
]

Skill = Literal["speaking", "writing"]

#: Descriptors exist for 4–9; 1–3 are below the range this app coaches for and are
#: deliberately not paraphrased (an evaluator may still award them).
DESCRIPTOR_BANDS: tuple[int, ...] = (9, 8, 7, 6, 5, 4)

# --------------------------------------------------------------------------- criteria

#: Short keys used on the wire and in the DB columns (``band_ta`` … ``band_gra``).
WRITING_CRITERIA: tuple[str, ...] = ("ta", "cc", "lr", "gra")

#: The evaluator prompt (05 §6.2) asks for these long keys; map them to the short ones.
WRITING_CRITERION_WIRE: dict[str, str] = {
    "ta": "task_achievement",
    "cc": "coherence_cohesion",
    "lr": "lexical_resource",
    "gra": "grammatical_range_accuracy",
}

WRITING_CRITERION_LABELS: dict[str, str] = {
    "ta": "Task Achievement",
    "cc": "Coherence and Cohesion",
    "lr": "Lexical Resource",
    "gra": "Grammatical Range and Accuracy",
}

SPEAKING_CRITERIA: tuple[str, ...] = ("fc", "lr", "gra", "pron")

SPEAKING_CRITERION_LABELS: dict[str, str] = {
    "fc": "Fluency and Coherence",
    "lr": "Lexical Resource",
    "gra": "Grammatical Range and Accuracy",
    "pron": "Pronunciation",
}


def writing_criterion1_name(task_type: str | None) -> str:
    """Criterion 1 is *Task Achievement* on Task 1 and *Task Response* on Task 2."""
    return "Task Response" if (task_type or "").strip() == "task2" else "Task Achievement"


def writing_criterion_labels(task_type: str | None = None) -> dict[str, str]:
    """Criterion labels with criterion 1 named for the task type."""
    labels = dict(WRITING_CRITERION_LABELS)
    labels["ta"] = writing_criterion1_name(task_type)
    return labels


# --------------------------------------------------------------------------- writing

WRITING_DESCRIPTORS: dict[str, dict[int, str]] = {
    "ta": {
        9: (
            "Fully answers every part; position (Task 2) or overview (Task 1) is crystal "
            "clear; ideas fully extended and well supported."
        ),
        8: (
            "Covers all parts well; clear position or overview; ideas well developed with "
            "only minor gaps."
        ),
        7: (
            "Addresses all parts; a clear position or overview is maintained, though some "
            "points could be better extended."
        ),
        6: (
            "Addresses the task but some parts more fully than others; the position or "
            "overview is present but may be unclear or mechanical."
        ),
        5: (
            "Only partly addresses the task; position unclear or overview missing; ideas "
            "thin or repetitive."
        ),
        4: (
            "Misreads or barely engages with the task; no clear position or overview; "
            "ideas are hard to identify."
        ),
    },
    "cc": {
        9: (
            "Effortless flow; paragraphing and linking are invisible because they are "
            "perfect."
        ),
        8: (
            "Logical sequencing throughout; paragraphs well managed; cohesion rarely draws "
            "attention to itself."
        ),
        7: (
            "Clear organisation; a range of linkers used well with occasional over- or "
            "under-use; one idea per paragraph."
        ),
        6: (
            "Coherent overall, but linking is mechanical or faulty at times and "
            "paragraphing may be illogical."
        ),
        5: (
            "Some organisation but not enough linking, or linking is repetitive or wrong; "
            "paragraphs weak or absent."
        ),
        4: (
            "Ideas are not arranged logically; little successful linking; no real "
            "paragraphing."
        ),
    },
    "lr": {
        9: "Wide, natural, precise vocabulary; rare slips only.",
        8: (
            "Fluent, flexible vocabulary including uncommon items; occasional inaccuracy "
            "in collocation."
        ),
        7: (
            "Enough range for flexibility and some precision; uses less common items with "
            "some awkwardness."
        ),
        6: (
            "Adequate range for the task; some errors in word choice or spelling that do "
            "not block meaning."
        ),
        5: (
            "Limited range; noticeable errors that sometimes cause strain for the reader."
        ),
        4: (
            "Very limited, repetitive vocabulary; errors often distort the message."
        ),
    },
    "gra": {
        9: "Full range of structures used accurately and flexibly; rare slips only.",
        8: (
            "Wide range of structures; most sentences error-free; errors are rare and "
            "minor."
        ),
        7: (
            "Mix of simple and complex sentences; frequent error-free sentences; good "
            "control, though a few errors persist."
        ),
        6: (
            "Uses some complex structures, but errors are noticeable; meaning is still "
            "usually clear."
        ),
        5: (
            "Limited range of structures; frequent errors, including ones that cause "
            "difficulty."
        ),
        4: "Mostly simple sentences with frequent errors that distort meaning.",
    },
}

# --------------------------------------------------------------------------- speaking

SPEAKING_DESCRIPTORS: dict[str, dict[int, str]] = {
    "fc": {
        9: (
            "Speaks effortlessly at length; any pause is for thinking of ideas, not words; "
            "ideas fully connected and on-point."
        ),
        8: (
            "Talks at length with only rare repetition or self-correction; hesitation is "
            "idea-driven; topics develop logically."
        ),
        7: (
            "Keeps going without obvious effort; some language-driven hesitation or "
            "repetition; uses a range of linkers with some flexibility."
        ),
        6: (
            "Willing to talk at length, but coherence sometimes breaks down; noticeable "
            "repetition, self-correction, or over-used simple linkers."
        ),
        5: (
            "Keeps the flow only by repeating, self-correcting or slowing down; fluent "
            "stretches happen only in simple language; over-relies on a few connectives."
        ),
        4: (
            "Cannot keep going without noticeable long pauses; speech is slow with frequent "
            "repetition; joins only simple sentences and links often break."
        ),
    },
    "lr": {
        9: (
            "Complete flexibility and precision; idiomatic language used naturally and "
            "accurately throughout."
        ),
        8: (
            "Wide vocabulary deployed precisely; paraphrases skilfully; occasional misfire "
            "with idiom or collocation."
        ),
        7: (
            "Handles varied topics flexibly; some less-common and idiomatic items with "
            "style awareness; paraphrases effectively."
        ),
        6: (
            "Vocabulary is broad enough to discuss topics at length and be clear despite "
            "wrong word choices; paraphrase mostly works."
        ),
        5: (
            "Can talk about familiar and unfamiliar topics but with limited flexibility; "
            "attempts paraphrase with mixed results."
        ),
        4: (
            "Confined to familiar topics; frequent wrong word choices; rarely attempts "
            "paraphrase."
        ),
    },
    "gra": {
        9: (
            "Full range of structures used naturally; the only slips are the kind fluent "
            "speakers also make."
        ),
        8: (
            "Wide range of structures, most sentences error-free; only very occasional "
            "slips or unnatural choices."
        ),
        7: (
            "Uses a range of complex structures with some flexibility; frequent error-free "
            "sentences, though some errors persist."
        ),
        6: (
            "Mixes simple and complex forms with limited flexibility; complex sentences "
            "often contain errors, but meaning usually survives."
        ),
        5: (
            "Basic sentence forms are reasonably accurate; complex structures are attempted "
            "but usually faulty."
        ),
        4: (
            "Mostly short or memorised utterances; frequent errors even in basic forms; "
            "subordinate clauses are rare."
        ),
    },
    "pron": {
        9: (
            "Uses the full toolkit of stress, rhythm and intonation precisely; effortless "
            "to understand throughout."
        ),
        8: (
            "Wide range of features used flexibly; accent has minimal effect on how easily "
            "the listener understands."
        ),
        7: (
            "Shows all the strengths of band 6 plus stretches of band-8 control; lapses "
            "occur but rarely obscure meaning."
        ),
        6: (
            "Uses a range of features with mixed control; some mispronounced words, but the "
            "listener can generally follow."
        ),
        5: (
            "Some effective features (band-6-like moments) but not sustained; "
            "mispronunciations cause the listener occasional strain."
        ),
        4: (
            "Limited range of features; frequent lapses; mispronunciations put real strain "
            "on the listener."
        ),
    },
}

_TABLES: dict[str, dict[str, dict[int, str]]] = {
    "writing": WRITING_DESCRIPTORS,
    "speaking": SPEAKING_DESCRIPTORS,
}

_CRITERIA: dict[str, tuple[str, ...]] = {
    "writing": WRITING_CRITERIA,
    "speaking": SPEAKING_CRITERIA,
}

_LABELS: dict[str, dict[str, str]] = {
    "writing": WRITING_CRITERION_LABELS,
    "speaking": SPEAKING_CRITERION_LABELS,
}


# --------------------------------------------------------------------------- accessors

def criteria_for(skill: str) -> tuple[str, ...]:
    """The four criterion keys of a skill, in reporting order."""
    try:
        return _CRITERIA[skill]
    except KeyError as exc:
        raise ValueError(f"unknown skill {skill!r} (expected 'speaking' or 'writing')") from exc


def descriptors_for(skill: str, criterion: str) -> dict[int, str]:
    """Every paraphrased descriptor (bands 9→4) for one criterion."""
    table = _TABLES.get(skill)
    if table is None:
        raise ValueError(f"unknown skill {skill!r} (expected 'speaking' or 'writing')")
    if criterion not in table:
        raise ValueError(f"unknown {skill} criterion {criterion!r}")
    return dict(table[criterion])


def descriptor(skill: str, criterion: str, band: float) -> str:
    """One descriptor cell. Bands outside 4–9 clamp to the nearest paraphrased row."""
    rows = descriptors_for(skill, criterion)
    whole = round(float(band))
    whole = min(9, max(4, whole))
    return rows[whole]


def descriptor_table(skill: str, task_type: str | None = None) -> str:
    """The descriptor grid as a compact markdown table, ready to embed in a prompt.

    Criterion 1 of writing is labelled for ``task_type`` (Task Achievement vs Response).
    """
    keys = criteria_for(skill)
    labels = writing_criterion_labels(task_type) if skill == "writing" else _LABELS[skill]
    header = "| Band | " + " | ".join(labels[k] for k in keys) + " |"
    divider = "|---" * (len(keys) + 1) + "|"
    lines = [header, divider]
    for band in DESCRIPTOR_BANDS:
        cells = [descriptor(skill, key, band).replace("\n", " ") for key in keys]
        lines.append(f"| {band} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def rubric_payload(skill: str, task_type: str | None = None) -> dict[str, object]:
    """JSON-ready rubric for the UI's band-meaning popovers."""
    keys = criteria_for(skill)
    labels = writing_criterion_labels(task_type) if skill == "writing" else _LABELS[skill]
    return {
        "skill": skill,
        "task_type": task_type,
        "bands": list(DESCRIPTOR_BANDS),
        "criteria": [
            {
                "key": key,
                "label": labels[key],
                "wire": WRITING_CRITERION_WIRE.get(key) if skill == "writing" else key,
                "descriptors": {str(band): descriptor(skill, key, band) for band in DESCRIPTOR_BANDS},
            }
            for key in keys
        ],
        "note": (
            "Paraphrased from the publicly published IELTS band descriptors. "
            "Not official IELTS text."
        ),
    }

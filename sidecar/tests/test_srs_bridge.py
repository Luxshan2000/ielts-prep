"""The skills bridge (GV-B3): evidence from the four skills becomes suggestions, not cards.

The behaviours proved here:

* **Ruling R2-5 holds.** Everything the bridge files lands with ``status='suggested'`` and
  **no** ``srs_cards`` row, on every path — including the "known word misused" path, which
  the bridge deliberately does not trigger.
* **Real evidence is harvested.** Writing upgrades and anchored annotations, the speaking
  report's ``vocab_to_bank`` and error quotes, reading items that blocked a question the
  learner got wrong, and listening pre-teach terms that sat on a missed answer.
* **The loop closes.** :func:`attach_learner_context` hands an entry the sentences the
  learner met it in and the mistakes they made with it, and
  ``context.build("error_fix", ...)`` then corrects *their* sentence.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import delete, select
from ulid import ULID

from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import run_migrations, session_scope
from bandready.srs import bridge
from bandready.srs import context as ctx
from bandready.srs import scheduler as sched

PROFILE = "default"


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def migrated_db(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    data_dir = tmp_path_factory.mktemp("bandready-bridge")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_AUTH_TOKEN", "test-token")
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        from bandready.config import reset_settings_cache

        reset_settings_cache()
        db_engine.reset_engine()
        run_migrations()
        try:
            yield data_dir
        finally:
            db_engine.reset_engine()
            reset_settings_cache()


@pytest.fixture()
def db(migrated_db: Path) -> Iterator[Path]:
    with session_scope() as s:
        s.execute(delete(m.SrsReviewLog))
        s.execute(delete(m.SrsCard))
        s.execute(delete(m.VocabSource))
        s.execute(delete(m.VocabEntry))
        s.execute(delete(m.VocabPackEntry))
        s.execute(delete(m.WritingEvaluation))
        s.execute(delete(m.WritingSubmission))
        s.execute(delete(m.LlmEvaluation))
        s.execute(delete(m.SpeakingTurn))
        s.execute(delete(m.SpeakingSession))
        s.execute(delete(m.ReadingAnswer))
        s.execute(delete(m.ReadingAttempt))
        s.execute(delete(m.ListeningAnswer))
        s.execute(delete(m.ListeningAttempt))
        s.execute(delete(m.PracticeSession))
        if s.get(m.Profile, PROFILE) is None:
            s.add(m.Profile(id=PROFILE, name="Test Learner", exam_format="academic"))
    yield migrated_db


def _now() -> str:
    return sched.iso(sched.now_utc())


def _practice(s, module: str, activity: str = "practice") -> str:
    sid = f"ps_{ULID()}"
    s.add(
        m.PracticeSession(
            id=sid, profile_id=PROFILE, module=module, activity=activity, started_at=_now()
        )
    )
    s.flush()
    return sid


ESSAY = (
    "Cities are growing quickly across the region. Much of the land around them is arable "
    "land, but the soil are poor after years of intensive use. Planners should think about "
    "this before they build."
)


def seed_writing(s) -> str:
    """One scored Task 2 attempt with an upgrade nomination and an anchored annotation."""
    if s.get(m.WritingPrompt, "wp_seed") is None:
        s.add(
            m.WritingPrompt(
                id="wp_seed",
                pack_id="core-en",
                task_type="task2",
                genre="opinion",
                prompt_text="Some people think farmland should never be built on. Discuss.",
            )
        )
        s.flush()
    submission_id = _practice(s, "writing")
    s.add(
        m.WritingSubmission(
            id=submission_id,
            prompt_id="wp_seed",
            mode="practice",
            status="scored",
            essay_text=ESSAY,
            word_count=len(ESSAY.split()),
        )
    )
    s.flush()
    start = ESSAY.index("the soil are poor")
    payload = {
        "annotations": [
            {
                "quote": "the soil are poor",
                "type": "grammar",
                "fix": "the soil is poor",
                "explanation": "`soil` is uncountable, so it takes a singular verb.",
                "start": start,
                "end": start + len("the soil are poor"),
            },
            {
                "quote": "think about",
                "type": "task",  # essay-level, no correctable span — must be ignored
                "fix": "consider",
                "explanation": "register",
                "start": ESSAY.index("think about"),
                "end": ESSAY.index("think about") + len("think about"),
            },
        ]
    }
    s.add(
        m.WritingEvaluation(
            id=f"we_{ULID()}",
            submission_id=submission_id,
            llm_evaluation_id="le_seed",
            band_ta=6.0,
            band_cc=6.0,
            band_lr=6.0,
            band_gra=5.5,
            overall_band=6.0,
            annotations_json=json.dumps(payload),
            vocab_suggestions_json=json.dumps(
                [
                    {
                        "term": "arable",
                        "replaces": "good land",
                        "sentence_context": "Much of the land around them is arable land.",
                        "source": {"kind": "writing", "item_id": submission_id},
                    }
                ]
            ),
            created_at=_now(),
        )
    )
    s.flush()
    return submission_id


SPOKEN_TURN = "I am agree with this idea because the commute takes too long every morning."


def seed_speaking(s) -> str:
    session_id = _practice(s, "speaking")
    s.add(
        m.SpeakingSession(id=session_id, mode="practice", part=3, state="done", status="complete")
    )
    s.add(
        m.SpeakingTurn(
            id=f"st_{ULID()}",
            session_id=session_id,
            turn_index=0,
            role="user",
            t_ms=0,
            text=SPOKEN_TURN,
        )
    )
    report = {
        "overall_band": 6.0,
        "errors": [
            {
                "quote": "I am agree with this idea",
                "issue": "verb form: 'agree' is not used with 'am'",
                "better": "I agree with this idea",
            }
        ],
        "vocab_to_bank": [
            {
                "term": "commute",
                "type": "word",
                "reason": "used correctly under pressure — reinforce",
                "context_quote": "my daily commute takes an hour",
            }
        ],
    }
    s.add(
        m.LlmEvaluation(
            id=f"le_{ULID()}",
            subject_kind="speaking_session",
            subject_id=session_id,
            purpose="score",
            model_id="mock-model-1",
            provider_id="mock",
            prompt_version="v1",
            temperature=0.0,
            raw_response="{}",
            parsed_json=json.dumps(report),
            overall_band=6.0,
            status="ok",
            created_at=_now(),
        )
    )
    s.flush()
    return session_id


def seed_reading(s) -> str:
    """A passage with a mineable item that blocks Q1, and Q1 answered wrongly."""
    passage_id = f"rp_{ULID()}"
    passage_json = {
        "title": "Soil and settlement",
        "texts": [
            {
                "paragraphs": [
                    {
                        "id": "A",
                        "text": (
                            "Planners have long treated the fringe as spare capacity. Much "
                            "of it is arable land that took millennia to form."
                        ),
                    }
                ]
            }
        ],
        "teaching": {
            "mineable": [
                {
                    "item": "arable",
                    "meaning": "suitable for growing crops",
                    "cefr": "B2",
                    "paragraph": "A",
                    "blocks_q": 1,
                }
            ]
        },
        "question_groups": [],
    }
    s.add(
        m.ReadingPassage(
            id=passage_id,
            pack_id="core-en",
            format="academic",
            title="Soil and settlement",
            topic_id=None,
            band_target=6.5,
            word_count=200,
            passage_json=json.dumps(passage_json),
        )
    )
    s.flush()
    question_id = f"rq_{ULID()}"
    s.add(
        m.ReadingQuestion(
            id=question_id,
            passage_id=passage_id,
            number=1,
            group_index=0,
            qtype="tfng",
            answers_json=json.dumps(["TRUE"]),
        )
    )
    attempt_id = _practice(s, "reading")
    s.add(
        m.ReadingAttempt(
            id=attempt_id,
            passage_id=passage_id,
            mode="practice",
            status="submitted",
            raw_score=0,
            total_questions=1,
            submitted_at=_now(),
        )
    )
    s.flush()
    s.add(
        m.ReadingAnswer(
            id=f"ra_{ULID()}",
            attempt_id=attempt_id,
            question_id=question_id,
            qtype="tfng",
            given="FALSE",
            normalized="false",
            correct=0,
        )
    )
    s.flush()
    return attempt_id


def seed_listening(s) -> str:
    script_id = f"ls_{ULID()}"
    script_json = {
        "lines": [
            {"speaker": "tutor", "text": "The council rezoned the floodplain last winter."},
            {
                "speaker": "tutor",
                "text": "Most of that ground was arable, so the loss is permanent.",
            },
        ],
        "teaching": {
            "pre_teach": [
                {"item": "arable", "gloss": "used for growing crops", "line_index": 1, "blocks_q": 2}
            ]
        },
        "groups": [],
        "questions": [],
    }
    s.add(
        m.ListeningScript(
            id=script_id,
            pack_id="core-en",
            part=4,
            title="Land use lecture",
            target_band=6.5,
            script_json=json.dumps(script_json),
        )
    )
    s.flush()
    question_id = f"lq_{ULID()}"
    s.add(
        m.ListeningQuestion(
            id=question_id,
            script_id=script_id,
            number=2,
            qtype="note_completion",
            answers_json=json.dumps(["arable"]),
        )
    )
    attempt_id = _practice(s, "listening")
    s.add(
        m.ListeningAttempt(
            id=attempt_id,
            script_id=script_id,
            mode="practice",
            status="submitted",
            raw_score=0,
            total_questions=1,
            submitted_at=_now(),
        )
    )
    s.flush()
    s.add(
        m.ListeningAnswer(
            id=f"la_{ULID()}",
            attempt_id=attempt_id,
            question_id=question_id,
            qtype="note_completion",
            given="arible",
            normalized="arible",
            correct=0,
        )
    )
    s.flush()
    return attempt_id


# ======================================================================================
# 1. Harvesting
# ======================================================================================


def test_writing_upgrades_are_harvested(db: Path) -> None:
    with session_scope() as s:
        seed_writing(s)
        found = bridge.harvest_lexis(s, PROFILE, modules=["writing"])
    assert [item["term"] for item in found.lexis] == ["arable"]
    assert found.lexis[0]["source"]["kind"] == "writing"
    assert "good land" in found.lexis[0]["source"]["detail"]
    assert found.by_module == {"writing": 1}


def test_speaking_vocab_to_bank_is_harvested(db: Path) -> None:
    with session_scope() as s:
        seed_speaking(s)
        found = bridge.harvest_lexis(s, PROFILE, modules=["speaking"])
    assert [item["term"] for item in found.lexis] == ["commute"]
    assert found.lexis[0]["sentence_context"] == "my daily commute takes an hour"


def test_reading_harvests_only_what_blocked_a_missed_question(db: Path) -> None:
    with session_scope() as s:
        seed_reading(s)
        found = bridge.harvest_lexis(s, PROFILE, modules=["reading"])
    assert [item["term"] for item in found.lexis] == ["arable"]
    item = found.lexis[0]
    assert item["source"]["kind"] == "reading"
    assert "blocks Q1" in item["source"]["detail"]
    assert "arable land" in (item["sentence_context"] or ""), "the passage sentence comes too"


def test_reading_harvests_nothing_when_the_learner_got_it_right(db: Path) -> None:
    with session_scope() as s:
        seed_reading(s)
        s.execute(
            m.ReadingAnswer.__table__.update().values(correct=1)
        )
        found = bridge.harvest_lexis(s, PROFILE, modules=["reading"])
    assert found.lexis == [], "a word you did not need is not worth a card"


def test_listening_harvests_the_term_that_sat_on_the_missed_answer(db: Path) -> None:
    with session_scope() as s:
        seed_listening(s)
        found = bridge.harvest_lexis(s, PROFILE, modules=["listening"])
    assert [item["term"] for item in found.lexis] == ["arable"]
    item = found.lexis[0]
    assert item["definition"] == "used for growing crops"
    assert item["sentence_context"] == "Most of that ground was arable, so the loss is permanent."
    assert "blocked Q2" in item["source"]["detail"]


def test_all_four_skills_feed_one_harvest(db: Path) -> None:
    with session_scope() as s:
        seed_writing(s)
        seed_speaking(s)
        seed_reading(s)
        seed_listening(s)
        found = bridge.harvest(s, PROFILE)
    assert set(found.by_module) == set(bridge.BRIDGE_MODULES)
    assert sum(found.by_module.values()) == len(found.lexis) == 4
    assert len(found.errors) == 2


def test_a_broken_module_does_not_lose_the_others(
    db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*_a: object, **_kw: object) -> list[dict[str, object]]:
        raise RuntimeError("passage_json is corrupt")

    monkeypatch.setattr(bridge, "_reading_lexis", boom)
    with session_scope() as s:
        seed_writing(s)
        seed_reading(s)
        found = bridge.harvest_lexis(s, PROFILE)
    assert found.by_module["reading"] == 0
    assert [item["term"] for item in found.lexis] == ["arable"]


# ======================================================================================
# 2. Errors
# ======================================================================================


def test_writing_errors_are_anchored_to_the_sentence_the_learner_wrote(db: Path) -> None:
    with session_scope() as s:
        seed_writing(s)
        errors = bridge.harvest_errors(s, PROFILE)
    assert len(errors) == 1, "an essay-level `task` note has no correctable span"
    error = errors[0]
    assert error.module == "writing"
    assert error.span == "the soil are poor"
    assert error.fix == "the soil is poor"
    assert error.sentence.startswith("Much of the land around them")
    assert "Cities are growing" not in error.sentence, "one sentence, not the whole essay"


def test_speaking_errors_come_back_inside_the_turn_they_were_said_in(db: Path) -> None:
    with session_scope() as s:
        seed_speaking(s)
        errors = bridge.harvest_errors(s, PROFILE)
    assert len(errors) == 1
    assert errors[0].module == "speaking"
    assert errors[0].span == "I am agree with this idea"
    assert errors[0].sentence == SPOKEN_TURN
    assert errors[0].fix == "I agree with this idea"


# ======================================================================================
# 3. Filing — suggestions, never cards
# ======================================================================================


def test_bridged_items_land_as_suggestions_and_are_never_scheduled(db: Path) -> None:
    with session_scope() as s:
        seed_writing(s)
        seed_speaking(s)
        seed_reading(s)
        seed_listening(s)
        result = bridge.run(s, PROFILE)

    assert result["filed"] >= 3
    with session_scope() as s:
        entries = list(s.execute(select(m.VocabEntry)).scalars().all())
        cards = list(s.execute(select(m.SrsCard)).scalars().all())

    assert entries, "the harvest produced nothing to check"
    assert {e.status for e in entries} == {"suggested"}
    assert cards == [], "R2-5: a module ingest creates no srs_cards row, ever"


def test_filing_is_idempotent(db: Path) -> None:
    with session_scope() as s:
        seed_writing(s)
        first = bridge.run(s, PROFILE)
    with session_scope() as s:
        second = bridge.run(s, PROFILE)

    assert first["filed"] == 1
    assert second["filed"] == 0 and second["skipped"] == 1
    with session_scope() as s:
        sources = list(s.execute(select(m.VocabSource)).scalars().all())
        entries = list(s.execute(select(m.VocabEntry)).scalars().all())
    assert len(entries) == 1
    assert len(sources) == 1, "a second sweep must not append a duplicate provenance row"


def test_the_bridge_never_triggers_the_known_word_misuse_flip(db: Path) -> None:
    """The §3.3 flip belongs to the module that watched it happen, not to a re-sweep.

    Otherwise every run of the harvest would silently reschedule the same card.
    """
    with session_scope() as s:
        seed_writing(s)
        s.add(
            m.VocabEntry(
                id=f"ve_{ULID()}",
                profile_id=PROFILE,
                headword="arable",
                lemma="arable",
                pos="other",
                definition="suitable for crops",
                status="known",
                created_at=_now(),
                updated_at=_now(),
            )
        )
        s.flush()
        found = bridge.harvest_lexis(s, PROFILE, modules=["writing"])
        for payload in found.lexis:
            payload["misuse"] = True  # even if a caller asks for it
        bridge.file_suggestions(s, PROFILE, found.lexis)

    with session_scope() as s:
        entry = s.execute(select(m.VocabEntry)).scalars().one()
        cards = list(s.execute(select(m.SrsCard)).scalars().all())
    assert entry.status == "known", "status is the learner's to change, not the harvester's"
    assert cards == []


def test_accepting_a_suggestion_is_what_schedules_it(db: Path) -> None:
    """The inbox is opt-in by design; this is the only door that creates a card."""
    from bandready.server.routes.vocab import _accept

    with session_scope() as s:
        seed_writing(s)
        bridge.run(s, PROFILE)
    with session_scope() as s:
        entry = s.execute(select(m.VocabEntry)).scalars().one()
        _accept(s, entry, sched.now_utc())
    with session_scope() as s:
        entry = s.execute(select(m.VocabEntry)).scalars().one()
        cards = list(s.execute(select(m.SrsCard)).scalars().all())
    assert entry.status == "active"
    assert len(cards) == 1 and cards[0].entry_id == entry.id


def test_an_unusable_payload_is_skipped_not_fatal(db: Path) -> None:
    with session_scope() as s:
        result = bridge.file_suggestions(
            s,
            PROFILE,
            [
                {"term": "   ", "source": {"kind": "writing", "item_id": "x"}},
                {"term": "arable", "source": {"kind": "writing", "item_id": "x"}},
            ],
        )
    assert result["filed"] == 1 and result["skipped"] == 1


# ======================================================================================
# 4. Closing the loop — the harvest feeds the sentence selector
# ======================================================================================


def test_attach_learner_context_hands_the_entry_its_own_sentences_and_mistakes(
    db: Path,
) -> None:
    with session_scope() as s:
        seed_writing(s)
        bridge.run(s, PROFILE)
        entry_row = s.execute(select(m.VocabEntry)).scalars().one()

        doc = {
            "id": entry_row.id,
            "headword": "soil",
            "lemma": "soil",
            "pos": "noun",
            "definition": "the top layer of earth that plants grow in",
            "own_context_origin": "seed",
            "example_sentences": ["Healthy soil holds water far better than sand."],
        }
        decorated = bridge.attach_learner_context(s, PROFILE, doc)

    assert decorated["learner_errors"], "the mistake was made with this very word"
    assert decorated["learner_errors"][0]["fix"] == "the soil is poor"
    assert decorated["attempt_sentences"][0]["text"].startswith("Much of the land")

    # …and the selector now prefers the sentence the learner actually wrote.
    chosen = ctx.select_sentence(decorated)
    assert chosen is not None
    assert chosen.source == "learner_attempt"
    assert chosen.provenance == "from your Writing feedback"

    # …and `error_fix` corrects that sentence rather than an invented one.
    built = ctx.build("error_fix", decorated)
    assert built["type"] == "error_fix"
    assert built["payload"]["span"] == "the soil are poor"
    assert built["payload"]["source_note"] == "from your Writing feedback"
    assert built["expected"], "a correction with nothing to compare against is not gradable"


def test_an_unrelated_mistake_is_not_attached_to_an_entry(db: Path) -> None:
    with session_scope() as s:
        seed_writing(s)
        doc = {
            "id": "ve_unrelated",
            "headword": "commute",
            "lemma": "commute",
            "pos": "noun",
            "definition": "the journey to work",
        }
        decorated = bridge.attach_learner_context(s, PROFILE, doc)
    assert "learner_errors" not in decorated
    assert "attempt_sentences" not in decorated


def test_pack_payload_reaches_the_runtime_without_a_migration(db: Path) -> None:
    """entry_json v2 arrives through the seed-provenance join (DESIGN §3.3)."""
    from bandready.server.routes.vocab import IngestItem, SourceRef, ingest_item

    entry_json = {
        "schema_version": 2,
        "headword": "arable",
        "pos": "adj",
        "definition": "suitable for growing crops",
        "own_context_sentence": "Arable land takes decades to recover.",
        "example_sentences": ["Arable land takes decades to recover."],
        "unit_type": "word",
        "register": "written",
        "contexts": [
            {
                "id": "c1",
                "text": "Only half of the estate is really arable.",
                "register": "spoken",
                "gap_span": "arable",
                "unique_answer": True,
            }
        ],
        "confusables": [
            {
                "term": "fertile",
                "difference": "Arable is about use; fertile is about richness.",
                "minimal_pair": ["The floor is arable.", "The floor is fertile."],
            }
        ],
    }
    with session_scope() as s:
        pack_row_id = f"vp_{ULID()}"
        s.add(
            m.VocabPackEntry(
                id=pack_row_id,
                pack_id="core-en",
                lemma="arable",
                pos="adj",
                deck="topic-environment",
                entry_json=json.dumps(entry_json),
            )
        )
        s.flush()
        result = ingest_item(
            s,
            PROFILE,
            IngestItem(
                term="arable",
                pos="adj",
                definition=entry_json["definition"],
                sentence_context=entry_json["own_context_sentence"],
                example_sentences=entry_json["example_sentences"],
                source=SourceRef(kind="seed", item_id=pack_row_id, detail="deck:topic-environment"),
            ),
            schedule=False,
            status_on_create="suggested",
        )
        s.flush()  # autoflush is off project-wide; the vocab routes flush here too
        payload = ctx.pack_payload(s, result["id"])
        assert payload.get("schema_version") == 2

        entry_row = s.get(m.VocabEntry, result["id"])
        doc = {
            "id": entry_row.id,
            "headword": entry_row.headword,
            "lemma": entry_row.lemma,
            "pos": entry_row.pos,
            "definition": entry_row.definition,
            "own_context_sentence": entry_row.own_context_sentence,
            "own_context_origin": entry_row.own_context_origin,
            "example_sentences": json.loads(entry_row.example_sentences_json),
        }
        decorated = bridge.attach_learner_context(s, PROFILE, doc)

    assert decorated["contexts"], "the authored contexts arrived without a migration"
    assert decorated["register"] == "written"
    # And the new kinds are now buildable off an entry the learner opted into from a deck.
    assert ctx.can_build("forced_choice", decorated) is True
    built = ctx.build("forced_choice", decorated)
    assert sorted(built["payload"]["options"]) == ["arable", "fertile"]


def test_a_learner_added_entry_degrades_to_v1_behaviour(db: Path) -> None:
    with session_scope() as s:
        entry = m.VocabEntry(
            id=f"ve_{ULID()}",
            profile_id=PROFILE,
            headword="arable",
            lemma="arable",
            pos="adj",
            definition="suitable for crops",
            own_context_sentence="I read this on a farming website.",
            own_context_origin="learner",
            status="active",
            created_at=_now(),
            updated_at=_now(),
        )
        s.add(entry)
        s.flush()
        assert ctx.pack_payload(s, entry.id) == {}
        decorated = bridge.attach_learner_context(
            s,
            PROFILE,
            {
                "id": entry.id,
                "headword": "arable",
                "lemma": "arable",
                "pos": "adj",
                "own_context_sentence": entry.own_context_sentence,
                "own_context_origin": "learner",
            },
        )
    chosen = ctx.select_sentence(decorated)
    assert chosen is not None and chosen.source == "learner_own"
    assert ctx.can_build("forced_choice", decorated) is False

"""Data-layer tests: migrations run clean, the views work, and the constraints bite.

Everything runs against a throwaway data dir so the developer's real database is never touched.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Self

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from ulid import ULID

from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import run_migrations, session_scope


def nid(prefix: str) -> str:
    return f"{prefix}_{ULID()}"


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def migrated_db(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    data_dir = tmp_path_factory.mktemp("bandready-data")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        db_engine.reset_engine()
        run_migrations()
        try:
            yield data_dir
        finally:
            db_engine.reset_engine()


@pytest.fixture()
def clean_db(migrated_db: Path) -> Iterator[Path]:
    """Wipe learner + content rows between tests (profile delete cascades the rest)."""
    with session_scope() as s:
        s.execute(delete(m.Profile))
        s.execute(delete(m.WritingPrompt))
        s.execute(delete(m.CardSet))
    yield migrated_db


def make_profile(s, profile_id: str = "default") -> m.Profile:
    profile = m.Profile(id=profile_id, name="Test Learner", exam_format="academic", target_band=7.0)
    s.add(profile)
    s.flush()  # parents before children: these tables have no ORM relationship() to order them
    return profile


def make_speaking_session(
    s,
    profile_id: str,
    *,
    band: float | None = 6.5,
    status: str = "complete",
    mode: str = "mock",
) -> str:
    session_id = nid("ss")
    s.add(
        m.PracticeSession(
            id=session_id,
            profile_id=profile_id,
            module="speaking",
            activity="full_mock",
            started_at="2026-07-01T09:00:00.000Z",
            ended_at="2026-07-01T09:14:00.000Z",
            duration_s=840,
        )
    )
    s.flush()
    s.add(
        m.SpeakingSession(
            id=session_id,
            mode=mode,
            state="closed",
            status=status,
            overall_band=band,
            criteria_json=json.dumps({"FC": 6.5, "LR": 6.5, "GRA": 6.0, "P": 7.0}),
            transcript_json=json.dumps({"turns": []}),
        )
    )
    return session_id


# --------------------------------------------------------------------------------------
# Schema
# --------------------------------------------------------------------------------------


def test_migration_created_tables_views_and_fts(migrated_db: Path) -> None:
    with session_scope() as s:
        names = {
            row[0]
            for row in s.execute(
                text("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
            )
        }
    for table in m.Base.metadata.tables:
        assert table in names, f"missing table {table}"
    assert {"current_band_estimates", "scored_attempts", "vocab_fts"} <= names
    assert (migrated_db / "bandready.db").exists()


def test_connection_pragmas(migrated_db: Path) -> None:
    with session_scope() as s:
        assert s.execute(text("PRAGMA foreign_keys")).scalar() == 1
        assert s.execute(text("PRAGMA journal_mode")).scalar() == "wal"
        assert s.execute(text("PRAGMA busy_timeout")).scalar() == 5000


# --------------------------------------------------------------------------------------
# Round-trip: profile → speaking session → turns → vocab entry → srs card
# --------------------------------------------------------------------------------------


def test_speaking_session_round_trip(clean_db: Path) -> None:
    with session_scope() as s:
        make_profile(s)
        session_id = make_speaking_session(s, "default")
        s.flush()
        for i, (role, body) in enumerate(
            [("assistant", "Tell me about your home town."), ("user", "I grew up in Jaffna.")]
        ):
            s.add(
                m.SpeakingTurn(
                    id=nid("st"),
                    session_id=session_id,
                    turn_index=i,
                    role=role,
                    text=body,
                    t_ms=i * 5000,
                    dur_ms=4200,
                    audio_path=f"turn-{i:03d}.wav" if role == "user" else None,
                )
            )

    with session_scope() as s:
        turns = s.scalars(
            select(m.SpeakingTurn)
            .where(m.SpeakingTurn.session_id == session_id)
            .order_by(m.SpeakingTurn.turn_index)
        ).all()
        assert [t.role for t in turns] == ["assistant", "user"]
        assert turns[1].audio_path == "turn-001.wav"
        # created_at style defaults are applied by SQLite, not Python.
        envelope = s.get(m.PracticeSession, session_id)
        assert envelope is not None and envelope.module == "speaking"


def test_vocab_entry_card_and_review_log(clean_db: Path) -> None:
    with session_scope() as s:
        make_profile(s)
        entry_id = nid("ve")
        card_id = nid("sc")
        s.add(
            m.VocabEntry(
                id=entry_id,
                profile_id="default",
                headword="mitigate",
                lemma="mitigate",
                pos="verb",
                definition="to make something less severe",
                status="active",
            )
        )
        s.flush()
        s.add(m.VocabSource(id=nid("vs"), entry_id=entry_id, module="writing", detail="task2"))
        s.add(
            m.SrsCard(
                id=card_id,
                entry_id=entry_id,
                state=0,
                due_at="2026-07-25T00:00:00.000Z",
                fsrs_json=json.dumps({"state": 0, "step": 0}),
            )
        )
        s.flush()
        s.add(
            m.SrsReviewLog(
                id=nid("rl"),
                card_id=card_id,
                rating=3,
                review_type="use_in_sentence",
                state_before=0,
            )
        )

    with session_scope() as s:
        card = s.scalar(select(m.SrsCard).where(m.SrsCard.entry_id == entry_id))
        assert card is not None and card.reps == 0 and card.lapses == 0
        assert s.scalar(
            select(m.SrsReviewLog).where(m.SrsReviewLog.card_id == card_id)
        ).review_type == "use_in_sentence"
        # FTS index is kept in sync by the triggers.
        hits = s.execute(
            text(
                "SELECT e.headword FROM vocab_fts f "
                "JOIN vocab_entries e ON e.rowid = f.rowid WHERE vocab_fts MATCH 'mitigate'"
            )
        ).scalars().all()
        assert hits == ["mitigate"]


# --------------------------------------------------------------------------------------
# Views
# --------------------------------------------------------------------------------------


def test_scored_attempts_view(clean_db: Path) -> None:
    with session_scope() as s:
        make_profile(s)
        s.flush()
        mock_id = make_speaking_session(s, "default", band=6.5, mode="mock")
        # Not complete → must not appear.
        make_speaking_session(s, "default", band=7.0, status="active", mode="practice")

        prompt_id = nid("wp")
        s.add(
            m.WritingPrompt(
                id=prompt_id,
                task_type="task2",
                genre="opinion",
                prompt_text="Some people think ...",
            )
        )
        submission_id = nid("wr")
        s.add(
            m.PracticeSession(
                id=submission_id,
                profile_id="default",
                module="writing",
                activity="task2",
                started_at="2026-07-02T10:00:00.000Z",
            )
        )
        s.flush()
        s.add(
            m.WritingSubmission(
                id=submission_id,
                prompt_id=prompt_id,
                mode="exam",
                status="scored",
                essay_text="...",
                word_count=270,
                overall_band=6.0,
                submitted_at="2026-07-02T10:40:00.000Z",
            )
        )
        s.flush()
        s.add(
            m.WritingEvaluation(
                id=nid("we"),
                submission_id=submission_id,
                llm_evaluation_id=nid("le"),
                band_ta=6.0,
                band_cc=6.0,
                band_lr=6.5,
                band_gra=5.5,
                overall_band=6.0,
                annotations_json="[]",
            )
        )

    with session_scope() as s:
        rows = s.execute(
            text("SELECT attempt_id, skill, mode, band, criteria_json, at FROM scored_attempts")
        ).mappings().all()

    by_skill = {r["skill"]: r for r in rows}
    assert set(by_skill) == {"speaking", "writing"}, rows

    speaking = by_skill["speaking"]
    assert speaking["attempt_id"] == mock_id
    assert speaking["mode"] == "mock"
    assert speaking["band"] == 6.5
    assert speaking["at"] == "2026-07-01T09:14:00.000Z"  # COALESCE(ended_at, started_at)

    writing = by_skill["writing"]
    assert writing["mode"] == "mock"  # exam mode maps to the 'mock' weight class
    assert writing["band"] == 6.0
    assert json.loads(writing["criteria_json"]) == {
        "TA": 6.0,
        "CC": 6.0,
        "LR": 6.5,
        "GRA": 5.5,
    }


def test_current_band_estimates_view_returns_latest_per_skill(clean_db: Path) -> None:
    with session_scope() as s:
        make_profile(s)
        s.flush()
        # Crafted monotonic ids: the view relies on ULIDs sorting by creation time (11 §8.2).
        for i, (skill, band, conf) in enumerate(
            [
                ("speaking", 5.5, "low"),
                ("speaking", 6.5, "medium"),
                ("writing", 6.0, "low"),
            ]
        ):
            s.add(
                m.BandEstimate(
                    id=f"be_{i:026d}",
                    profile_id="default",
                    skill=skill,
                    estimate_raw=band - 0.13,
                    band=band,
                    range_low=band - 0.5,
                    range_high=band + 0.5,
                    confidence=conf,
                    n_eff=2.0,
                    attempts_used=2,
                    method="estimator",
                )
            )

    with session_scope() as s:
        rows = s.execute(
            text("SELECT skill, band, confidence FROM current_band_estimates ORDER BY skill")
        ).mappings().all()

    assert [(r["skill"], r["band"], r["confidence"]) for r in rows] == [
        ("speaking", 6.5, "medium"),
        ("writing", 6.0, "low"),
    ]


# --------------------------------------------------------------------------------------
# Constraints actually bite
# --------------------------------------------------------------------------------------


def test_check_constraint_rejects_bad_exam_format(clean_db: Path) -> None:
    with pytest.raises(IntegrityError, match="CHECK constraint"), session_scope() as s:
        s.add(m.Profile(id="bad", name="Nope", exam_format="general"))


def test_check_constraint_rejects_bad_speaking_mode(clean_db: Path) -> None:
    with session_scope() as s:
        make_profile(s)
    with pytest.raises(IntegrityError, match="CHECK constraint"), session_scope() as s:
        make_speaking_session(s, "default", mode="full_mock")


def test_check_constraint_rejects_out_of_range_pron_score(clean_db: Path) -> None:
    with session_scope() as s:
        make_profile(s)
    with pytest.raises(IntegrityError, match="CHECK constraint"), session_scope() as s:
        s.add(
            m.PronScore(
                id=nid("pw"),
                profile_id="default",
                source="read_aloud",
                method="proxy-v1",
                word="thorough",
                word_index=3,
                score=140,
            )
        )


def test_reading_attempt_requires_exactly_one_target(clean_db: Path) -> None:
    with session_scope() as s:
        make_profile(s)
        s.add(
            m.PracticeSession(
                id="rd_orphan", profile_id="default", module="reading", activity="single_passage"
            )
        )
    with pytest.raises(IntegrityError, match="CHECK constraint"), session_scope() as s:
        s.add(m.ReadingAttempt(id="rd_orphan", mode="practice"))  # both targets NULL


def test_foreign_key_is_enforced(clean_db: Path) -> None:
    with pytest.raises(IntegrityError, match="FOREIGN KEY constraint"), session_scope() as s:
        s.add(
            m.PracticeSession(
                id=nid("ss"), profile_id="ghost", module="speaking", activity="quick_chat"
            )
        )


def test_vocab_entry_unique_on_profile_lemma_pos(clean_db: Path) -> None:
    with session_scope() as s:
        make_profile(s)
        s.flush()
        s.add(
            m.VocabEntry(id=nid("ve"), profile_id="default", headword="book", lemma="book",
                         pos="noun")
        )
        # Same lemma, different POS is a distinct entry (R2-5).
        s.add(
            m.VocabEntry(id=nid("ve"), profile_id="default", headword="book", lemma="book",
                         pos="verb")
        )

    with pytest.raises(IntegrityError, match="UNIQUE constraint"), session_scope() as s:
        s.add(
            m.VocabEntry(id=nid("ve"), profile_id="default", headword="Book", lemma="book",
                         pos="noun")
        )


def test_deleting_a_profile_cascades_learner_data(clean_db: Path) -> None:
    with session_scope() as s:
        make_profile(s)
        session_id = make_speaking_session(s, "default")
        s.flush()
        s.add(
            m.SpeakingTurn(
                id=nid("st"), session_id=session_id, turn_index=0, role="user", text="hi", t_ms=0
            )
        )
        entry_id = nid("ve")
        s.add(
            m.VocabEntry(
                id=entry_id, profile_id="default", headword="curb", lemma="curb", pos="verb"
            )
        )

    with session_scope() as s:
        s.execute(delete(m.Profile).where(m.Profile.id == "default"))

    with session_scope() as s:
        assert s.scalar(select(m.PracticeSession)) is None
        assert s.scalar(select(m.SpeakingSession)) is None
        assert s.scalar(select(m.SpeakingTurn)) is None
        assert s.scalar(select(m.VocabEntry)) is None
        assert s.execute(text("SELECT count(*) FROM scored_attempts")).scalar() == 0


# ======================================================================================
# The manifest's byte counts are a hint, never a gate
# ======================================================================================


class _FakeResponse:
    """One streamed response, with a Content-Length that is the truth about this transfer."""

    def __init__(self, payload: bytes) -> None:
        self._payload = payload
        self.status_code = 200
        self.headers = {"Content-Length": str(len(payload))}

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_bytes(self, _chunk: int = 0):
        yield self._payload


class _FakeClient:
    def __init__(self, payload: bytes) -> None:
        self._payload = payload
        self.calls = 0

    def stream(self, _method: str, _url: str, headers: dict | None = None) -> _FakeResponse:
        self.calls += 1
        return _FakeResponse(self._payload)


async def test_a_wrong_size_in_the_manifest_no_longer_blocks_the_download(tmp_path) -> None:
    """The bug that made Kokoro uninstallable for everyone.

    Both Kokoro entries carried a hand-typed byte count and both were wrong: the model by 227
    bytes and the voices by 88,706. The old check compared the finished file to that constant,
    deleted it on mismatch, and retried twice more before failing with "0 bytes, expected
    325532160" — nonsense, because the size was read after the unlink. Integrity is sha256's
    job; the manifest number is for the progress bar.
    """
    from bandready.server.routes.models import _fetch_file

    payload = b"x" * 5000
    spec = {"name": "thing.bin", "size": 999999, "sha256": None, "url": "https://example/thing"}
    client = _FakeClient(payload)
    await _fetch_file(client, spec, tmp_path, lambda *_: None)

    got = tmp_path / "thing.bin"
    assert got.exists(), "a complete download was rejected for disagreeing with the manifest"
    assert got.read_bytes() == payload
    assert client.calls == 1, "it retried a download that had already succeeded"


async def test_a_truncated_transfer_is_still_caught(tmp_path) -> None:
    """Loosening the size gate must not mean accepting half a file.

    Completeness is now measured against the Content-Length of the response that actually
    arrived, which is the only number that describes this transfer.
    """
    from bandready.server.errors import ApiError
    from bandready.server.routes.models import _fetch_file

    class _Truncating(_FakeClient):
        def stream(self, _m: str, _u: str, headers: dict | None = None) -> _FakeResponse:
            self.calls += 1
            res = _FakeResponse(b"y" * 5000)
            res.headers["Content-Length"] = "5000"
            res._payload = b"y" * 40  # the connection dropped
            return res

    spec = {"name": "cut.bin", "size": None, "sha256": None, "url": "https://example/cut"}
    with pytest.raises(ApiError) as caught:
        await _fetch_file(_Truncating(b""), spec, tmp_path, lambda *_: None)
    assert "incomplete" in str(caught.value.detail)
    assert not (tmp_path / "cut.bin").exists()


async def test_an_installed_file_is_not_fetched_again(tmp_path) -> None:
    """`final` only exists because it already passed verification, so it is trusted.

    Comparing it to the manifest constant meant a correctly installed model was re-downloaded
    on every visit to the screen, for as long as that constant was wrong.
    """
    from bandready.server.routes.models import _fetch_file

    (tmp_path / "there.bin").write_bytes(b"z" * 128)
    spec = {"name": "there.bin", "size": 999999, "sha256": None, "url": "https://example/there"}
    client = _FakeClient(b"")
    await _fetch_file(client, spec, tmp_path, lambda *_: None)
    assert client.calls == 0, "an installed file was downloaded again"

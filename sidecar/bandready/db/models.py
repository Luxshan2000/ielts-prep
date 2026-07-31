"""SQLAlchemy 2.0 ORM models — canonical schema per docs/plan/11-data-model.md (v2).

Conventions (11 §1):

* IDs are TEXT ULIDs with a short type prefix (``ss_``, ``wr_``, ``ve_``, …); content-bank
  rows shipped in packs use stable authored slugs so re-imports are idempotent.
* Timestamps are TEXT ISO-8601 UTC with milliseconds, named ``*_at``, defaulted in SQLite via
  ``strftime('%Y-%m-%dT%H:%M:%fZ','now')``.
* Booleans are INTEGER 0/1 with a CHECK.
* Bands are REAL with ``CHECK (col BETWEEN 0 AND 9)``.
* JSON columns are TEXT named ``*_json`` (two documented exceptions kept verbatim from the
  spec: ``writing_prompts.topic_tags`` / ``chart_spec`` / ``letter_bullets``).

Every constraint is explicitly named so Alembic's SQLite batch mode (copy-and-rename) can
drop and recreate them (11 §12).
"""

from __future__ import annotations

from sqlalchemy import (
    REAL,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

__all__ = [
    "NAMING_CONVENTION",
    "ActivityLog",
    "AdaptiveEvent",
    "BandEstimate",
    "Base",
    "CardSet",
    "ContentPack",
    "DailyActivity",
    "DrillResult",
    "GrammarCard",
    "GrammarItem",
    "GrammarPoint",
    "GrammarReviewLog",
    "ListeningAnswer",
    "ListeningAttempt",
    "ListeningQuestion",
    "ListeningScript",
    "ListeningTest",
    "LlmEvaluation",
    "MediaFile",
    "Milestone",
    "PlacementResult",
    "PlanSession",
    "PracticeSession",
    "Profile",
    "PronDrillAttempt",
    "PronScore",
    "ReadinessItem",
    "ReadingAnswer",
    "ReadingAttempt",
    "ReadingPassage",
    "ReadingQuestion",
    "ReadingTest",
    "Setting",
    "SpeakingCard",
    "SpeakingSession",
    "SpeakingTurn",
    "SrsCard",
    "SrsReviewLog",
    "StudyPlan",
    "Topic",
    "VocabEntry",
    "VocabPackEntry",
    "VocabSource",
    "WritingEvaluation",
    "WritingPrompt",
    "WritingSubmission",
    "metadata",
]

# --------------------------------------------------------------------------------------
# Base
# --------------------------------------------------------------------------------------

#: 11 §12 — required from day one: anonymous constraints cannot be dropped in batch mode.
#: NB: the plan doc writes the FK token as ``%(referenced_table_name)s``; SQLAlchemy's actual
#: token is ``%(referred_table_name)s`` (the doc spelling raises KeyError). Same rendered names.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(referred_table_name)s_%(column_0_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=NAMING_CONVENTION)

#: SQLite expression used as the default for every ``*_at`` column.
NOW_SQL = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"


def now_default():
    """Fresh ``TextClause`` for the ISO-8601-with-millis UTC ``now`` default."""
    return text(NOW_SQL)


class Base(DeclarativeBase):
    metadata = metadata


def band_check(column: str) -> CheckConstraint:
    return CheckConstraint(f"{column} BETWEEN 0 AND 9", name=column)


def bool_check(column: str) -> CheckConstraint:
    return CheckConstraint(f"{column} IN (0,1)", name=column)


# --------------------------------------------------------------------------------------
# Pack provenance mixin (11 §3 "/* pack cols */")
# --------------------------------------------------------------------------------------


class PackMixin:
    """Shared provenance block on every content-bank table."""

    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pack'"))
    pack_id: Mapped[str | None] = mapped_column(Text)
    pack_version: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str | None] = mapped_column(Text)
    retired: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())


def pack_checks() -> tuple[CheckConstraint, ...]:
    return (
        CheckConstraint("source IN ('pack','generated','user')", name="source"),
        bool_check("retired"),
    )


# --------------------------------------------------------------------------------------
# 2. Core
# --------------------------------------------------------------------------------------


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    exam_format: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'academic'")
    )
    target_band: Mapped[float | None] = mapped_column(REAL)
    exam_date: Mapped[str | None] = mapped_column(Text)
    self_level: Mapped[str | None] = mapped_column(Text)
    daily_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("60"))
    study_days_json: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("""'["mon","tue","wed","thu","fri","sat"]'"""),
    )
    onboarded_at: Mapped[str | None] = mapped_column(Text)
    placement_completed_at: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        CheckConstraint(
            "exam_format IN ('academic','general_training')", name="exam_format"
        ),
        CheckConstraint("target_band BETWEEN 4 AND 9", name="target_band"),
        CheckConstraint(
            "self_level IN ('beginner','intermediate','upper','advanced')", name="self_level"
        ),
        CheckConstraint("daily_minutes IN (30,60,90)", name="daily_minutes"),
    )


class Setting(Base):
    """KV of JSON values. Provider config lives in the on-disk lockfile, not here (03)."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())


# --------------------------------------------------------------------------------------
# 3. Content bank
# --------------------------------------------------------------------------------------


class ContentPack(Base):
    __tablename__ = "content_packs"

    pack_id: Mapped[str] = mapped_column(Text, primary_key=True)
    version: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    publisher: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    homepage: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str] = mapped_column(Text, nullable=False)
    ai_disclosure: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'human'")
    )
    manifest_json: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    installed_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        CheckConstraint(
            "ai_disclosure IN ('human','ai_assisted','ai_generated')", name="ai_disclosure"
        ),
        bool_check("enabled"),
    )


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'general'"))


class CardSet(PackMixin, Base):
    """R2-21 — groups the P1/P2/P3 cards of one mock topic (least-recently-served picker)."""

    __tablename__ = "card_sets"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    topic_id: Mapped[str | None] = mapped_column(Text, ForeignKey("topics.id"))
    parts_json: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'[1,2,3]'")
    )
    payload_json: Mapped[str | None] = mapped_column(Text)
    last_served_at: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        *pack_checks(),
        Index("ix_card_sets_pick", "retired", "last_served_at"),
    )


class SpeakingCard(PackMixin, Base):
    __tablename__ = "speaking_cards"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    part: Mapped[int] = mapped_column(Integer, nullable=False)
    card_set_id: Mapped[str | None] = mapped_column(Text, ForeignKey("card_sets.id"))
    topic_id: Mapped[str | None] = mapped_column(Text, ForeignKey("topics.id"))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'core'"))
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    last_served_at: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        *pack_checks(),
        CheckConstraint("part BETWEEN 1 AND 3", name="part"),
        CheckConstraint("difficulty IN ('core','stretch')", name="difficulty"),
        Index("ix_speaking_cards_pick", "part", "difficulty", "retired", "last_served_at"),
        Index("ix_speaking_cards_set", "card_set_id"),
    )


class WritingPrompt(PackMixin, Base):
    __tablename__ = "writing_prompts"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    task_type: Mapped[str] = mapped_column(Text, nullable=False)
    genre: Mapped[str] = mapped_column(Text, nullable=False)
    topic_id: Mapped[str | None] = mapped_column(Text, ForeignKey("topics.id"))
    topic_tags: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("2"))
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    chart_spec: Mapped[str | None] = mapped_column(Text)
    letter_bullets: Mapped[str | None] = mapped_column(Text)
    #: The authored teaching layer (staging-writing/DESIGN.md §1–§5), serialised JSON.
    #: NULL means "no teaching material" — every consumer is absent-by-default.
    teaching_json: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        *pack_checks(),
        CheckConstraint(
            "task_type IN ('ac_task1','gt_task1','task2')", name="task_type"
        ),
        CheckConstraint("difficulty BETWEEN 1 AND 3", name="difficulty"),
        Index("ix_writing_prompts_pick", "task_type", "genre", "difficulty", "retired"),
    )


class ReadingPassage(PackMixin, Base):
    __tablename__ = "reading_passages"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    format: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    topic_id: Mapped[str | None] = mapped_column(Text, ForeignKey("topics.id"))
    word_count: Mapped[int] = mapped_column(Integer, nullable=False)
    band_target: Mapped[float | None] = mapped_column(REAL)
    passage_json: Mapped[str] = mapped_column(Text, nullable=False)
    validation_report_json: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        *pack_checks(),
        CheckConstraint("format IN ('academic','general_training')", name="format"),
        band_check("band_target"),
        Index("ix_reading_passages_pick", "format", "band_target", "retired"),
    )


class ReadingQuestion(Base):
    """Flattened projection of ``reading_passages.passage_json`` (one row per numbered Q)."""

    __tablename__ = "reading_questions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    passage_id: Mapped[str] = mapped_column(
        Text, ForeignKey("reading_passages.id", ondelete="CASCADE"), nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    group_index: Mapped[int] = mapped_column(Integer, nullable=False)
    qtype: Mapped[str] = mapped_column(Text, nullable=False)
    word_limit: Mapped[int | None] = mapped_column(Integer)
    answers_json: Mapped[str] = mapped_column(Text, nullable=False)
    anchor_paragraphs_json: Mapped[str | None] = mapped_column(Text)
    evidence_quote: Mapped[str | None] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)
    trap_note: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        UniqueConstraint("passage_id", "number", name="uq_reading_questions_passage_number"),
        Index("ix_reading_questions_type", "qtype"),
    )


class ReadingTest(PackMixin, Base):
    __tablename__ = "reading_tests"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    format: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    p1_id: Mapped[str] = mapped_column(Text, ForeignKey("reading_passages.id"), nullable=False)
    p2_id: Mapped[str] = mapped_column(Text, ForeignKey("reading_passages.id"), nullable=False)
    p3_id: Mapped[str] = mapped_column(Text, ForeignKey("reading_passages.id"), nullable=False)

    __table_args__ = (
        *pack_checks(),
        CheckConstraint("format IN ('academic','general_training')", name="format"),
    )


class ListeningScript(PackMixin, Base):
    __tablename__ = "listening_scripts"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    part: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    topic_id: Mapped[str | None] = mapped_column(Text, ForeignKey("topics.id"))
    accent_set: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'uk'"))
    target_band: Mapped[float] = mapped_column(REAL, nullable=False)
    script_json: Mapped[str] = mapped_column(Text, nullable=False)
    audio_hash: Mapped[str | None] = mapped_column(Text, ForeignKey("media_files.hash"))

    __table_args__ = (
        *pack_checks(),
        CheckConstraint("part BETWEEN 1 AND 4", name="part"),
        CheckConstraint("accent_set IN ('uk','us','au')", name="accent_set"),
        band_check("target_band"),
        Index("ix_listening_scripts_pick", "part", "target_band", "retired"),
    )


class ListeningQuestion(Base):
    __tablename__ = "listening_questions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    script_id: Mapped[str] = mapped_column(
        Text, ForeignKey("listening_scripts.id", ondelete="CASCADE"), nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    qtype: Mapped[str] = mapped_column(Text, nullable=False)
    word_limit: Mapped[int | None] = mapped_column(Integer)
    answers_json: Mapped[str] = mapped_column(Text, nullable=False)
    cue_line_index: Mapped[int | None] = mapped_column(Integer)
    explanation: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        UniqueConstraint("script_id", "number", name="uq_listening_questions_script_number"),
        Index("ix_listening_questions_type", "qtype"),
    )


class ListeningTest(PackMixin, Base):
    __tablename__ = "listening_tests"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    p1_id: Mapped[str] = mapped_column(Text, ForeignKey("listening_scripts.id"), nullable=False)
    p2_id: Mapped[str] = mapped_column(Text, ForeignKey("listening_scripts.id"), nullable=False)
    p3_id: Mapped[str] = mapped_column(Text, ForeignKey("listening_scripts.id"), nullable=False)
    p4_id: Mapped[str] = mapped_column(Text, ForeignKey("listening_scripts.id"), nullable=False)

    __table_args__ = (*pack_checks(),)


class VocabPackEntry(PackMixin, Base):
    """Shipped vocab content (R2-8). Opting a deck in copies rows into ``vocab_entries``."""

    __tablename__ = "vocab_pack_entries"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    lemma: Mapped[str] = mapped_column(Text, nullable=False)
    pos: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'other'"))
    deck: Mapped[str] = mapped_column(Text, nullable=False)
    entry_json: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        *pack_checks(),
        Index("ix_vocab_pack_entries_deck", "deck", "retired"),
    )


# --------------------------------------------------------------------------------------
# 4. Sessions & attempts
# --------------------------------------------------------------------------------------


class PracticeSession(Base):
    """The generic envelope. Module tables share this primary key."""

    __tablename__ = "practice_sessions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    module: Mapped[str] = mapped_column(Text, nullable=False)
    activity: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())
    ended_at: Mapped[str | None] = mapped_column(Text)
    duration_s: Mapped[int | None] = mapped_column(Integer)
    summary_json: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "module IN ('speaking','writing','reading','listening','vocab','drill','placement')",
            name="module",
        ),
        Index("ix_practice_sessions_feed", "profile_id", text("started_at DESC")),
        Index("ix_practice_sessions_mod", "profile_id", "module", text("started_at DESC")),
    )


class SpeakingSession(Base):
    __tablename__ = "speaking_sessions"

    id: Mapped[str] = mapped_column(
        Text, ForeignKey("practice_sessions.id", ondelete="CASCADE"), primary_key=True
    )
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    part: Mapped[int | None] = mapped_column(Integer)
    card_set_id: Mapped[str | None] = mapped_column(Text, ForeignKey("card_sets.id"))
    state: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'active'"))
    transcript_json: Mapped[str | None] = mapped_column(Text)
    metrics_json: Mapped[str | None] = mapped_column(Text)
    overall_band: Mapped[float | None] = mapped_column(REAL)
    criteria_json: Mapped[str | None] = mapped_column(Text)
    pron_summary_json: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "mode IN ('placement','mock','practice','micro')", name="mode"
        ),
        CheckConstraint("part BETWEEN 1 AND 3", name="part"),
        CheckConstraint(
            "status IN ('active','complete','aborted','failed')", name="status"
        ),
        band_check("overall_band"),
    )


class SpeakingTurn(Base):
    __tablename__ = "speaking_turns"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        Text, ForeignKey("speaking_sessions.id", ondelete="CASCADE"), nullable=False
    )
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    t_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    dur_ms: Mapped[int | None] = mapped_column(Integer)
    segments_json: Mapped[str | None] = mapped_column(Text)
    audio_path: Mapped[str | None] = mapped_column(Text)
    metrics_json: Mapped[str | None] = mapped_column(Text)
    # NB: declared last — binding the name ``text`` in the class body would shadow sa.text().
    text: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint("role IN ('user','assistant')", name="role"),
        UniqueConstraint("session_id", "turn_index", name="uq_speaking_turns_session_turn"),
    )


class WritingSubmission(Base):
    __tablename__ = "writing_submissions"

    id: Mapped[str] = mapped_column(
        Text, ForeignKey("practice_sessions.id", ondelete="CASCADE"), primary_key=True
    )
    prompt_id: Mapped[str] = mapped_column(
        Text, ForeignKey("writing_prompts.id"), nullable=False
    )
    parent_submission_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("writing_submissions.id")
    )
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'draft'"))
    essay_text: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    outline_text: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    seconds_elapsed: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    overtime_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    paste_events: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    integrity_flag: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[str | None] = mapped_column(Text)
    overall_band: Mapped[float | None] = mapped_column(REAL)

    __table_args__ = (
        CheckConstraint("mode IN ('exam','practice')", name="mode"),
        CheckConstraint(
            "status IN ('draft','submitted','scored','failed')", name="status"
        ),
        band_check("overall_band"),
        Index("ix_writing_submissions_prompt", "prompt_id"),
        Index("ix_writing_submissions_parent", "parent_submission_id"),
    )


class WritingEvaluation(Base):
    __tablename__ = "writing_evaluations"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    submission_id: Mapped[str] = mapped_column(
        Text, ForeignKey("writing_submissions.id", ondelete="CASCADE"), nullable=False
    )
    # → llm_evaluations.id — intentionally no FK (polymorphic subject, §5 cleanup note).
    llm_evaluation_id: Mapped[str] = mapped_column(Text, nullable=False)
    band_ta: Mapped[float] = mapped_column(REAL, nullable=False)
    band_cc: Mapped[float] = mapped_column(REAL, nullable=False)
    band_lr: Mapped[float] = mapped_column(REAL, nullable=False)
    band_gra: Mapped[float] = mapped_column(REAL, nullable=False)
    overall_band: Mapped[float] = mapped_column(REAL, nullable=False)
    annotations_json: Mapped[str] = mapped_column(Text, nullable=False)
    vocab_suggestions_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        band_check("band_ta"),
        band_check("band_cc"),
        band_check("band_lr"),
        band_check("band_gra"),
        band_check("overall_band"),
        Index("ix_writing_evals_sub", "submission_id", text("created_at DESC")),
    )


class ReadingAttempt(Base):
    __tablename__ = "reading_attempts"

    id: Mapped[str] = mapped_column(
        Text, ForeignKey("practice_sessions.id", ondelete="CASCADE"), primary_key=True
    )
    test_id: Mapped[str | None] = mapped_column(Text, ForeignKey("reading_tests.id"))
    passage_id: Mapped[str | None] = mapped_column(Text, ForeignKey("reading_passages.id"))
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'in_progress'")
    )
    raw_score: Mapped[int | None] = mapped_column(Integer)
    total_questions: Mapped[int | None] = mapped_column(Integer)
    band: Mapped[float | None] = mapped_column(REAL)
    duration_s: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    state_json: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("mode IN ('exam','practice')", name="mode"),
        CheckConstraint(
            "status IN ('in_progress','submitted','abandoned')", name="status"
        ),
        band_check("band"),
        CheckConstraint("(test_id IS NULL) <> (passage_id IS NULL)", name="target"),
    )


class ReadingAnswer(Base):
    __tablename__ = "reading_answers"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    attempt_id: Mapped[str] = mapped_column(
        Text, ForeignKey("reading_attempts.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[str] = mapped_column(
        Text, ForeignKey("reading_questions.id"), nullable=False
    )
    qtype: Mapped[str] = mapped_column(Text, nullable=False)
    given: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    normalized: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    correct: Mapped[int] = mapped_column(Integer, nullable=False)
    trap_analysis_json: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        bool_check("correct"),
        UniqueConstraint("attempt_id", "question_id", name="uq_reading_answers_attempt_question"),
        Index("ix_reading_answers_type", "qtype", "correct"),
        Index("ix_reading_answers_q", "question_id"),
    )


class DrillResult(Base):
    __tablename__ = "drill_results"

    id: Mapped[str] = mapped_column(
        Text, ForeignKey("practice_sessions.id", ondelete="CASCADE"), primary_key=True
    )
    module: Mapped[str] = mapped_column(Text, nullable=False)
    drill_kind: Mapped[str] = mapped_column(Text, nullable=False)
    qtype: Mapped[str | None] = mapped_column(Text)
    n_items: Mapped[int] = mapped_column(Integer, nullable=False)
    n_correct: Mapped[int] = mapped_column(Integer, nullable=False)
    params_json: Mapped[str | None] = mapped_column(Text)
    details_json: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("module IN ('reading','listening','vocab')", name="module"),
        Index("ix_drill_results_kind", "module", "drill_kind", "qtype"),
    )


class ListeningAttempt(Base):
    __tablename__ = "listening_attempts"

    id: Mapped[str] = mapped_column(
        Text, ForeignKey("practice_sessions.id", ondelete="CASCADE"), primary_key=True
    )
    test_id: Mapped[str | None] = mapped_column(Text, ForeignKey("listening_tests.id"))
    script_id: Mapped[str | None] = mapped_column(Text, ForeignKey("listening_scripts.id"))
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'in_progress'")
    )
    raw_score: Mapped[int | None] = mapped_column(Integer)
    total_questions: Mapped[int | None] = mapped_column(Integer)
    band: Mapped[float | None] = mapped_column(REAL)
    duration_s: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    submitted_at: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "mode IN ('exam','practice','dictation','accent_drill')", name="mode"
        ),
        CheckConstraint(
            "status IN ('in_progress','submitted','abandoned')", name="status"
        ),
        band_check("band"),
        CheckConstraint("(test_id IS NULL) <> (script_id IS NULL)", name="target"),
    )


class ListeningAnswer(Base):
    __tablename__ = "listening_answers"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    attempt_id: Mapped[str] = mapped_column(
        Text, ForeignKey("listening_attempts.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[str] = mapped_column(
        Text, ForeignKey("listening_questions.id"), nullable=False
    )
    qtype: Mapped[str] = mapped_column(Text, nullable=False)
    given: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    normalized: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    correct: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        bool_check("correct"),
        UniqueConstraint(
            "attempt_id", "question_id", name="uq_listening_answers_attempt_question"
        ),
        Index("ix_listening_answers_type", "qtype", "correct"),
        Index("ix_listening_answers_q", "question_id"),
    )


# --------------------------------------------------------------------------------------
# 5. Evaluations
# --------------------------------------------------------------------------------------


class LlmEvaluation(Base):
    """One row per scoring/analysis LLM call — the calibration audit trail (14)."""

    __tablename__ = "llm_evaluations"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    subject_kind: Mapped[str] = mapped_column(Text, nullable=False)
    subject_id: Mapped[str] = mapped_column(Text, nullable=False)  # polymorphic; no FK
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    model_id: Mapped[str] = mapped_column(Text, nullable=False)
    provider_id: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_version: Mapped[str] = mapped_column(Text, nullable=False)
    temperature: Mapped[float] = mapped_column(REAL, nullable=False)
    raw_response: Mapped[str] = mapped_column(Text, nullable=False)
    parsed_json: Mapped[str | None] = mapped_column(Text)
    overall_band: Mapped[float | None] = mapped_column(REAL)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        CheckConstraint(
            "subject_kind IN ('speaking_session','writing_submission','reading_attempt',"
            "'listening_attempt','vocab_entry','placement')",
            name="subject_kind",
        ),
        CheckConstraint(
            "purpose IN ('score','rescore','trap_analysis','coach','generation_validation')",
            name="purpose",
        ),
        CheckConstraint(
            "status IN ('ok','parse_failed','api_failed')", name="status"
        ),
        band_check("overall_band"),
        Index("ix_llm_evals_subject", "subject_kind", "subject_id", text("created_at DESC")),
        Index("ix_llm_evals_calib", "prompt_version", "model_id", "status"),
    )


# --------------------------------------------------------------------------------------
# 6. Vocabulary
# --------------------------------------------------------------------------------------


class VocabEntry(Base):
    __tablename__ = "vocab_entries"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    headword: Mapped[str] = mapped_column(Text, nullable=False)
    lemma: Mapped[str] = mapped_column(Text, nullable=False)
    pos: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'other'"))
    is_phrase: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    ipa: Mapped[str | None] = mapped_column(Text)
    definition: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    own_context_sentence: Mapped[str | None] = mapped_column(Text)
    own_context_origin: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'seed'")
    )
    example_sentences_json: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'[]'")
    )
    collocations_json: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'[]'")
    )
    topic_tags_json: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'[]'")
    )
    cefr_level: Mapped[str | None] = mapped_column(Text)
    audio_ref: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'suggested'"))
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        CheckConstraint(
            "pos IN ('noun','verb','adj','adv','prep','phrase','collocation','other')", name="pos"
        ),
        bool_check("is_phrase"),
        CheckConstraint(
            "own_context_origin IN ('seed','learner')", name="own_context_origin"
        ),
        CheckConstraint(
            "cefr_level IN ('A1','A2','B1','B2','C1','C2')", name="cefr_level"
        ),
        CheckConstraint(
            "status IN ('suggested','active','suspended','known')", name="status"
        ),
        UniqueConstraint("profile_id", "lemma", "pos", name="uq_vocab_entries_profile_lemma_pos"),
        Index("ix_vocab_entries_browse", "profile_id", "status"),
        Index("ix_vocab_entries_lemma", "profile_id", "lemma"),
    )


class VocabSource(Base):
    """Full provenance history: one row per (re-)encounter."""

    __tablename__ = "vocab_sources"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    entry_id: Mapped[str] = mapped_column(
        Text, ForeignKey("vocab_entries.id", ondelete="CASCADE"), nullable=False
    )
    module: Mapped[str] = mapped_column(Text, nullable=False)
    session_id: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        CheckConstraint(
            "module IN ('speaking','writing','reading','listening','pronunciation','seed',"
            "'manual')",
            name="module",
        ),
        Index("ix_vocab_sources_entry", "entry_id"),
    )


class SrsCard(Base):
    """One card per SCHEDULED entry (no row until a suggestion is accepted — R2-5)."""

    __tablename__ = "srs_cards"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    entry_id: Mapped[str] = mapped_column(
        Text, ForeignKey("vocab_entries.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    state: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    step: Mapped[int | None] = mapped_column(Integer)
    stability: Mapped[float | None] = mapped_column(REAL)
    difficulty: Mapped[float | None] = mapped_column(REAL)
    due_at: Mapped[str] = mapped_column(Text, nullable=False)
    last_review_at: Mapped[str | None] = mapped_column(Text)
    reps: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    lapses: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    fsrs_json: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint("state IN (0,1,2,3)", name="state"),
        Index("ix_srs_cards_due", "due_at"),
    )


class SrsReviewLog(Base):
    """Append-only review history (stats + future FSRS parameter optimization)."""

    __tablename__ = "srs_review_logs"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    card_id: Mapped[str] = mapped_column(
        Text, ForeignKey("srs_cards.id", ondelete="CASCADE"), nullable=False
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    review_type: Mapped[str] = mapped_column(Text, nullable=False)
    reviewed_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())
    elapsed_ms: Mapped[int | None] = mapped_column(Integer)
    state_before: Mapped[int] = mapped_column(Integer, nullable=False)
    stability_before: Mapped[float | None] = mapped_column(REAL)
    difficulty_before: Mapped[float | None] = mapped_column(REAL)

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 4", name="rating"),
        CheckConstraint(
            "review_type IN ('flip','cloze','use_in_sentence','collocation','audio_recall',"
            "'speaking_drill')",
            name="review_type",
        ),
        Index("ix_srs_review_logs_card", "card_id", "reviewed_at"),
        Index("ix_srs_review_logs_time", "reviewed_at"),
    )


# --------------------------------------------------------------------------------------
# 7. Pronunciation
# --------------------------------------------------------------------------------------


class PronScore(Base):
    """Source-polymorphic per-word score (R2-6). Scores are INTEGER 0–100, never floats."""

    __tablename__ = "pron_scores"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(Text, nullable=False)
    session_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("speaking_sessions.id", ondelete="CASCADE")
    )
    turn_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("speaking_turns.id", ondelete="CASCADE")
    )
    passage_id: Mapped[str | None] = mapped_column(Text)
    audio_path: Mapped[str | None] = mapped_column(Text)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    word: Mapped[str] = mapped_column(Text, nullable=False)
    word_index: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[int | None] = mapped_column(Integer)
    expected_ipa: Mapped[str | None] = mapped_column(Text)
    heard_approx: Mapped[str | None] = mapped_column(Text)
    t_start_ms: Mapped[int | None] = mapped_column(Integer)
    t_end_ms: Mapped[int | None] = mapped_column(Integer)
    phone_detail_json: Mapped[str | None] = mapped_column(Text)
    issues_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        CheckConstraint(
            "source IN ('speaking_turn','read_aloud','shadowing','minimal_pair')", name="source"
        ),
        CheckConstraint(
            "method IN ('proxy-v1','local-gop','azure','speechace')", name="method"
        ),
        CheckConstraint("score BETWEEN 0 AND 100", name="score"),
        Index("ix_pron_scores_session", "session_id", "turn_id"),
        Index("ix_pron_scores_word", "profile_id", "word", "created_at"),
    )


class PronDrillAttempt(Base):
    __tablename__ = "pron_drill_attempts"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    drill_type: Mapped[str] = mapped_column(Text, nullable=False)
    item_id: Mapped[str] = mapped_column(Text, nullable=False)
    contrast: Mapped[str | None] = mapped_column(Text)
    correct: Mapped[int] = mapped_column(Integer, nullable=False)
    response_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        CheckConstraint(
            "drill_type IN ('minimal_pair_ab','word_stress_tap')", name="drill_type"
        ),
        bool_check("correct"),
        Index("ix_pron_drills_contrast", "profile_id", "contrast", "created_at"),
    )


# --------------------------------------------------------------------------------------
# 8. Curriculum & progress
# --------------------------------------------------------------------------------------


class PlacementResult(Base):
    __tablename__ = "placement_results"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    taken_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())
    estimates_json: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index("ix_placement_results_profile", "profile_id", text("taken_at DESC")),
    )


class StudyPlan(Base):
    __tablename__ = "study_plans"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    goal_band: Mapped[float] = mapped_column(REAL, nullable=False)
    exam_date: Mapped[str | None] = mapped_column(Text)
    horizon_weeks: Mapped[int] = mapped_column(Integer, nullable=False)
    weights_json: Mapped[str] = mapped_column(Text, nullable=False)
    rationale_json: Mapped[str | None] = mapped_column(Text)
    superseded_by: Mapped[str | None] = mapped_column(Text, ForeignKey("study_plans.id"))
    generated_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        CheckConstraint("goal_band BETWEEN 4 AND 9", name="goal_band"),
        Index("ix_study_plans_profile", "profile_id", text("generated_at DESC")),
    )


class PlanSession(Base):
    __tablename__ = "plan_sessions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    plan_id: Mapped[str] = mapped_column(
        Text, ForeignKey("study_plans.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[str] = mapped_column(Text, nullable=False)
    phase: Mapped[str] = mapped_column(Text, nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    blocks_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'scheduled'"))
    minutes_logged: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    current_block: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (
        CheckConstraint("phase IN ('build','taper')", name="phase"),
        CheckConstraint(
            "status IN ('scheduled','in_progress','completed','partial','skipped')", name="status"
        ),
        Index("ix_plan_sessions_day", "plan_id", "date"),
    )


class BandEstimate(Base):
    """Append-only estimator log. ``current_band_estimates`` is the latest row per (profile,skill)."""

    __tablename__ = "band_estimates"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    skill: Mapped[str] = mapped_column(Text, nullable=False)
    estimate_raw: Mapped[float | None] = mapped_column(REAL)
    band: Mapped[float] = mapped_column(REAL, nullable=False)
    range_low: Mapped[float | None] = mapped_column(REAL)
    range_high: Mapped[float | None] = mapped_column(REAL)
    confidence: Mapped[str] = mapped_column(Text, nullable=False)
    n_eff: Mapped[float] = mapped_column(REAL, nullable=False, server_default=text("0"))
    attempts_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    criteria_json: Mapped[str | None] = mapped_column(Text)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    model_id: Mapped[str | None] = mapped_column(Text)
    newest_attempt_at: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())

    __table_args__ = (
        CheckConstraint(
            "skill IN ('speaking','writing','reading','listening','overall')", name="skill"
        ),
        band_check("band"),
        band_check("range_low"),
        band_check("range_high"),
        CheckConstraint(
            "confidence IN ('insufficient','low','medium','high')", name="confidence"
        ),
        CheckConstraint(
            "method IN ('estimator','placement','self_assessed','manual')", name="method"
        ),
        Index("ix_band_estimates_trend", "profile_id", "skill", "created_at"),
    )


class AdaptiveEvent(Base):
    __tablename__ = "adaptive_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    rule_id: Mapped[str] = mapped_column(Text, nullable=False)
    fired_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())
    evidence_json: Mapped[str] = mapped_column(Text, nullable=False)
    action_json: Mapped[str] = mapped_column(Text, nullable=False)
    dismissed_at: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("ix_adaptive_events_feed", "profile_id", text("fired_at DESC")),)


class DailyActivity(Base):
    """Heatmap + streak source of truth. Day boundary is the 4 AM local rollover."""

    __tablename__ = "daily_activity"

    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    date: Mapped[str] = mapped_column(Text, primary_key=True)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    goal_met: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    is_rest_day: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    streak_repaired: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    __table_args__ = (
        bool_check("goal_met"),
        bool_check("is_rest_day"),
        bool_check("streak_repaired"),
    )


class Milestone(Base):
    __tablename__ = "milestones"

    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    milestone_id: Mapped[str] = mapped_column(Text, primary_key=True)
    achieved_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())


class ReadinessItem(Base):
    __tablename__ = "readiness_items"

    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    item_id: Mapped[str] = mapped_column(Text, primary_key=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    checked: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    checked_at: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("kind IN ('auto','manual')", name="kind"),
        bool_check("checked"),
    )


class ActivityLog(Base):
    """Append-only misc event feed. Never joined for correctness — safe to prune."""

    __tablename__ = "activity_log"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    ref_kind: Mapped[str | None] = mapped_column(Text)
    ref_id: Mapped[str | None] = mapped_column(Text)
    meta_json: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("ix_activity_log_feed", "profile_id", text("at DESC")),)


# --------------------------------------------------------------------------------------
# 9. Media cache index
# --------------------------------------------------------------------------------------


class MediaFile(Base):
    """Index over hash-addressed cache files. User recordings are NOT in this table."""

    __tablename__ = "media_files"

    hash: Mapped[str] = mapped_column(Text, primary_key=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    rel_path: Mapped[str] = mapped_column(Text, nullable=False)
    bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    pinned: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())
    last_access_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=now_default()
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('listening_render','tts_line','vocab_audio','pron_ref','pack_media')",
            name="kind",
        ),
        bool_check("pinned"),
        Index("ix_media_evict", "pinned", "kind", "last_access_at"),
    )


# --------------------------------------------------------------------------------------
# 10. Grammar & Usage (grammar DESIGN.md §0.4 D1)
# --------------------------------------------------------------------------------------
#
# Grammar could not borrow the vocabulary SRS tables:
#
# * ``srs_cards.entry_id`` is a **unique FK to ``vocab_entries``**, so a grammar card can
#   never be an ``srs_cards`` row;
# * ``srs_review_logs.review_type`` is CheckConstraint-ed to the six vocabulary exercise
#   kinds, so logging a ``choose_form`` there raises IntegrityError on the first review.
#
# So grammar gets its own parallel pair, with the **FSRS columns named exactly as
# ``srs_cards`` names them** — that is what lets ``bandready.srs.scheduler`` run unmodified
# over a ``grammar_cards`` row instead of forking the FSRS maths.


class GrammarPoint(PackMixin, Base):
    """One teachable point = one unit = one lesson = one card.

    Every field the learner ever sees lives inside ``point_json``:
    ``loader.TABLE_COLUMNS`` copies only the columns it lists, so an extra top-level row
    key is silently dropped at import.
    """

    __tablename__ = "grammar_points"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    unit_id: Mapped[str] = mapped_column(Text, nullable=False)
    sequence_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    cefr_level: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'B1'"))
    role: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'form'"))
    topic_id: Mapped[str | None] = mapped_column(Text, ForeignKey("topics.id"))
    point_json: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        *pack_checks(),
        CheckConstraint("role IN ('form','choice','accuracy')", name="role"),
        CheckConstraint("cefr_level IN ('A1','A2','B1','B2','C1','C2')", name="cefr_level"),
        Index("ix_grammar_points_seq", "sequence_index", "retired"),
    )


class GrammarItem(Base):
    """Flattened projection of ``grammar_points.point_json.items[]``.

    Deliberately **not** an FK target from ``grammar_review_logs``: the loader rebuilds
    this table on every import, and an item dropped by a later pack version must leave the
    learner's history readable rather than abort the import.
    """

    __tablename__ = "grammar_items"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    point_id: Mapped[str] = mapped_column(
        Text, ForeignKey("grammar_points.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    stage: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    register: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'both'"))
    confusion_set: Mapped[str | None] = mapped_column(Text)
    twin_id: Mapped[str | None] = mapped_column(Text)
    error_codes_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    topic_id: Mapped[str | None] = mapped_column(Text)
    item_json: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index("ix_grammar_items_pick", "point_id", "stage", "kind"),
        Index("ix_grammar_items_codes", "kind", "confusion_set"),
    )


class GrammarCard(Base):
    """Ladder state + FSRS state for one point, for one profile.

    The two blocks below are the module's authority boundary made physical: everything in
    the ladder block is written by ``bandready.grammar.practice`` and never by FSRS;
    everything in the FSRS block is written by ``bandready.srs.scheduler`` and never by the
    Ladder.
    """

    __tablename__ = "grammar_cards"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    point_id: Mapped[str] = mapped_column(Text, ForeignKey("grammar_points.id"), nullable=False)

    # --- ladder state (this module owns these) -----------------------------------------
    stage: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    stage_successes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    stage_days_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    seen_items_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    last_wild_failure_at: Mapped[str | None] = mapped_column(Text)
    leech: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    # --- FSRS state (identical column names to srs_cards) ------------------------------
    state: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    step: Mapped[int | None] = mapped_column(Integer)
    stability: Mapped[float | None] = mapped_column(REAL)
    difficulty: Mapped[float | None] = mapped_column(REAL)
    due_at: Mapped[str] = mapped_column(Text, nullable=False)
    last_review_at: Mapped[str | None] = mapped_column(Text)
    reps: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    lapses: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    fsrs_json: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        UniqueConstraint("profile_id", "point_id", name="uq_grammar_cards_profile_point"),
        CheckConstraint("state IN (0,1,2,3)", name="state"),
        CheckConstraint("stage BETWEEN 0 AND 5", name="stage"),
        Index("ix_grammar_cards_due", "profile_id", "due_at"),
    )


class GrammarReviewLog(Base):
    """Every retrieval, and every real-world confirmation or contradiction of one.

    ``item_id`` is **loose text, not an FK**. Three things are written into it and the
    prefix says which: ``gi_…`` an authored item id; ``real:<module>:<id>`` a correct use
    detected in a real submission; ``wild:<module>:<id>`` the same error code coming back
    in a real submission.
    """

    __tablename__ = "grammar_review_logs"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    card_id: Mapped[str] = mapped_column(
        Text, ForeignKey("grammar_cards.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[str | None] = mapped_column(Text)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    review_type: Mapped[str] = mapped_column(Text, nullable=False)
    outcome: Mapped[str] = mapped_column(Text, nullable=False)
    stage_before: Mapped[int] = mapped_column(Integer, nullable=False)
    error_codes_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    reviewed_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=now_default())
    elapsed_ms: Mapped[int | None] = mapped_column(Integer)
    state_before: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    stability_before: Mapped[float | None] = mapped_column(REAL)
    difficulty_before: Mapped[float | None] = mapped_column(REAL)

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 4", name="rating"),
        Index("ix_grammar_review_logs_card", "card_id", "reviewed_at"),
        Index("ix_grammar_review_logs_time", "reviewed_at"),
    )

"""SQL views and the vocab FTS5 index — raw DDL, verbatim from 11-data-model.md §6/§8.

Alembic cannot autogenerate views, virtual tables or triggers, so this module owns the DDL and
the migration calls into it. Every helper is DROP-then-CREATE, so it is safe to re-run after a
batch-alter rebuilds one of the underlying tables (11 §12).
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection

__all__ = [
    "CURRENT_BAND_ESTIMATES_SQL",
    "FTS_TRIGGER_SQL",
    "SCORED_ATTEMPTS_SQL",
    "VIEW_NAMES",
    "VOCAB_FTS_SQL",
    "create_views",
    "create_vocab_fts",
    "drop_views",
    "drop_vocab_fts",
]

# --------------------------------------------------------------------------------------
# Views
# --------------------------------------------------------------------------------------

#: 11 §8.2 — latest snapshot per (profile, skill). ULID ids sort by creation time, so
#: max(id) is the newest row; the view can therefore never drift from the append-only log.
CURRENT_BAND_ESTIMATES_SQL = """
CREATE VIEW current_band_estimates AS
SELECT *
FROM band_estimates
WHERE id IN (SELECT max(id) FROM band_estimates GROUP BY profile_id, skill)
"""

#: 11 §8.3 — uniform estimator input over the four module attempt tables. Only finished,
#: banded attempts appear. ``mode`` carries the canonical placement|mock|practice|micro enum.
SCORED_ATTEMPTS_SQL = """
CREATE VIEW scored_attempts AS
SELECT ss.id             AS attempt_id,
       ps.profile_id     AS profile_id,
       'speaking'        AS skill,
       ss.mode           AS mode,
       ss.overall_band   AS band,
       ss.criteria_json  AS criteria_json,
       COALESCE(ps.ended_at, ps.started_at) AS at
FROM   speaking_sessions ss
JOIN   practice_sessions ps ON ps.id = ss.id
WHERE  ss.status = 'complete' AND ss.overall_band IS NOT NULL

UNION ALL

SELECT ws.id, ps.profile_id, 'writing',
       CASE WHEN ps.module = 'placement' THEN 'placement'
            WHEN ws.mode   = 'exam'      THEN 'mock'
            ELSE 'practice' END,
       ws.overall_band,
       (SELECT json_object('TA', we.band_ta, 'CC', we.band_cc,
                           'LR', we.band_lr, 'GRA', we.band_gra)
        FROM   writing_evaluations we
        WHERE  we.submission_id = ws.id
        ORDER  BY we.created_at DESC LIMIT 1),
       COALESCE(ws.submitted_at, ps.ended_at, ps.started_at)
FROM   writing_submissions ws
JOIN   practice_sessions ps ON ps.id = ws.id
WHERE  ws.status = 'scored' AND ws.overall_band IS NOT NULL

UNION ALL

SELECT ra.id, ps.profile_id, 'reading',
       CASE WHEN ps.module = 'placement' THEN 'placement'
            WHEN ra.mode = 'exam' AND ra.test_id IS NOT NULL THEN 'mock'
            ELSE 'practice' END,
       ra.band,
       NULL,
       COALESCE(ra.submitted_at, ps.ended_at, ps.started_at)
FROM   reading_attempts ra
JOIN   practice_sessions ps ON ps.id = ra.id
WHERE  ra.status = 'submitted' AND ra.band IS NOT NULL

UNION ALL

SELECT la.id, ps.profile_id, 'listening',
       CASE WHEN ps.module = 'placement' THEN 'placement'
            WHEN la.mode = 'exam' AND la.test_id IS NOT NULL THEN 'mock'
            WHEN la.mode IN ('dictation','accent_drill') THEN 'micro'
            ELSE 'practice' END,
       la.band,
       NULL,
       COALESCE(la.submitted_at, ps.ended_at, ps.started_at)
FROM   listening_attempts la
JOIN   practice_sessions ps ON ps.id = la.id
WHERE  la.status = 'submitted' AND la.band IS NOT NULL
"""

#: Creation order matters only for readability — views do not depend on each other.
VIEW_NAMES: tuple[str, ...] = ("current_band_estimates", "scored_attempts")

_VIEW_SQL: tuple[str, ...] = (CURRENT_BAND_ESTIMATES_SQL, SCORED_ATTEMPTS_SQL)


def drop_views(conn: Connection) -> None:
    """Drop both views if present (no-op on a fresh database)."""
    for name in VIEW_NAMES:
        conn.execute(text(f"DROP VIEW IF EXISTS {name}"))


def create_views(conn: Connection) -> None:
    """(Re)create both views. Safe to call repeatedly — drops first."""
    drop_views(conn)
    for sql in _VIEW_SQL:
        conn.execute(text(sql))


# --------------------------------------------------------------------------------------
# FTS5 bank search (11 §6)
# --------------------------------------------------------------------------------------

VOCAB_FTS_SQL = """
CREATE VIRTUAL TABLE vocab_fts USING fts5(
  headword, definition,
  content='vocab_entries', content_rowid='rowid', tokenize='unicode61'
)
"""

FTS_TRIGGER_SQL: tuple[str, ...] = (
    """
CREATE TRIGGER vocab_fts_ai AFTER INSERT ON vocab_entries BEGIN
  INSERT INTO vocab_fts(rowid, headword, definition)
  VALUES (new.rowid, new.headword, new.definition);
END
""",
    """
CREATE TRIGGER vocab_fts_ad AFTER DELETE ON vocab_entries BEGIN
  INSERT INTO vocab_fts(vocab_fts, rowid, headword, definition)
  VALUES ('delete', old.rowid, old.headword, old.definition);
END
""",
    """
CREATE TRIGGER vocab_fts_au AFTER UPDATE OF headword, definition ON vocab_entries BEGIN
  INSERT INTO vocab_fts(vocab_fts, rowid, headword, definition)
  VALUES ('delete', old.rowid, old.headword, old.definition);
  INSERT INTO vocab_fts(rowid, headword, definition)
  VALUES (new.rowid, new.headword, new.definition);
END
""",
)

_FTS_TRIGGER_NAMES: tuple[str, ...] = ("vocab_fts_ai", "vocab_fts_ad", "vocab_fts_au")


def drop_vocab_fts(conn: Connection) -> None:
    for name in _FTS_TRIGGER_NAMES:
        conn.execute(text(f"DROP TRIGGER IF EXISTS {name}"))
    conn.execute(text("DROP TABLE IF EXISTS vocab_fts"))


def create_vocab_fts(conn: Connection) -> None:
    """(Re)create the FTS5 external-content index over vocab_entries and its sync triggers."""
    drop_vocab_fts(conn)
    conn.execute(text(VOCAB_FTS_SQL))
    for sql in FTS_TRIGGER_SQL:
        conn.execute(text(sql))
    # Rebuild from the content table so the index is correct even on a repair run.
    conn.execute(text("INSERT INTO vocab_fts(vocab_fts) VALUES ('rebuild')"))

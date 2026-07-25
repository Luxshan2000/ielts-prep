"""Band prediction — 10-curriculum-progress.md §6.

The estimator reads **exclusively** from the ``scored_attempts`` SQL view (11 §8.3) plus
the synthetic placement seed rows described below, applies exponential recency decay and
per-mode base weights, gates the result on an effective sample size, and appends
``band_estimates`` rows (11 §8.2). Reads are served by the ``current_band_estimates``
view, so the "current" cache can never drift from the log.

    w_i      = base_i * 0.5 ** (age_days_i / 14)
    base_i   = 2.0 placement|mock · 1.0 practice · 0.5 micro
    estimate = Σ(w_i·band_i) / Σ(w_i)
    n_eff    = Σ(w_i)

Placement seeds: 10 §3 says placement counts as "one attempt per skill with weight ×2".
The sampler does not fabricate per-skill ``practice_sessions`` rows, so the latest
``placement_results`` row is projected into synthetic attempts with ``mode='placement'``
— but only for skills that have no real ``mode='placement'`` row, so a speaking sampler
that *did* run as a real session is never counted twice.
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from ulid import ULID

_log = logging.getLogger("bandready.curriculum.estimate")

SKILLS: tuple[str, ...] = ("listening", "reading", "writing", "speaking")
PRODUCTIVE_SKILLS: tuple[str, ...] = ("writing", "speaking")

HALF_LIFE_DAYS = 14.0
STALE_DAYS = 21.0
FRESH_DAYS = 7.0

MODE_BASE: dict[str, float] = {
    "placement": 2.0,
    "mock": 2.0,
    "practice": 1.0,
    "micro": 0.5,
}

# 10 §2 — self-rating fallback bands when a skill has no evidence at all.
SELF_LEVEL_BAND: dict[str, float] = {
    "beginner": 4.5,
    "intermediate": 5.5,
    "upper": 6.5,
    "advanced": 7.5,
}

CONFIDENCE_ORDER: tuple[str, ...] = ("insufficient", "low", "medium", "high")
CONFIDENCE_RANGE: dict[str, float] = {
    "insufficient": 1.0,
    "low": 1.0,
    "medium": 0.5,
    "high": 0.5,
}
# 10 §6.2 — "high" is tightened internally for plan weighting only.
PLANNING_RANGE_HIGH = 0.25

# Criterion keys, upper-cased, per skill (10 §6.1).
CRITERIA_BY_SKILL: dict[str, tuple[str, ...]] = {
    "speaking": ("FC", "LR", "GRA", "P"),
    "writing": ("TA", "CC", "LR", "GRA"),
}

TS_FORMATS = (
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d %H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
)


# --------------------------------------------------------------------------------------
# Rounding — ONE shared implementation app-wide (R2-4)
# --------------------------------------------------------------------------------------

try:  # pragma: no cover — the scoring package is owned by another module
    from bandready.scoring.bands import round_ielts  # type: ignore
except Exception:  # noqa: BLE001 — not landed yet; keep the identical local rule

    def round_ielts(x: float) -> float:
        """Nearest half band, with the official upward tie rule (.25→up, .75→up)."""
        if x is None:  # type: ignore[unreachable]
            raise TypeError("round_ielts() needs a number")
        return max(0.0, min(9.0, math.floor(float(x) * 2 + 0.5) / 2))


def round_half(x: float) -> float:
    """Alias kept local so skill displays and the overall mean use the same rule."""
    return round_ielts(x)


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------


def utcnow() -> datetime:
    return datetime.now(UTC)


def parse_ts(value: str | None) -> datetime | None:
    """Parse the app's ISO-8601 timestamps (and plain dates) into aware UTC datetimes."""
    if not value:
        return None
    raw = str(value).strip()
    for fmt in TS_FORMATS:
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _loads(raw: Any) -> Any:
    if raw is None or isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


# The module scorers emit long criterion names (05's `task_achievement`) or short ones
# (04's `fc`/`pron`). One canonical set feeds the radar, the estimator and the rules.
CRITERION_ALIASES: dict[str, str] = {
    "TA": "TA", "TR": "TA", "TASK_ACHIEVEMENT": "TA", "TASK_RESPONSE": "TA",
    "CC": "CC", "COHERENCE_COHESION": "CC", "COHERENCE_AND_COHESION": "CC",
    "LR": "LR", "LEXICAL_RESOURCE": "LR",
    "GRA": "GRA", "GRAMMATICAL_RANGE_ACCURACY": "GRA",
    "GRAMMATICAL_RANGE_AND_ACCURACY": "GRA", "GRAMMAR": "GRA",
    "FC": "FC", "FLUENCY_COHERENCE": "FC", "FLUENCY_AND_COHERENCE": "FC",
    "P": "P", "PRON": "P", "PRONUNCIATION": "P",
}


def canonical_criterion(key: str) -> str | None:
    return CRITERION_ALIASES.get(str(key).strip().upper().replace("-", "_").replace(" ", "_"))


def normalize_criteria(raw: Any) -> dict[str, float]:
    """Accept every wire shape: ``{"GRA": 6.0}``, ``{"gra": {"band": 6}}``, long names."""
    parsed = _loads(raw)
    if not isinstance(parsed, dict):
        return {}
    out: dict[str, float] = {}
    for key, value in parsed.items():
        if str(key).startswith("_"):
            continue
        canonical = canonical_criterion(key)
        if canonical is None:
            continue
        band: Any = value
        if isinstance(value, dict):
            band = value.get("band", value.get("score"))
        if isinstance(band, bool) or band is None:
            continue
        try:
            out[canonical] = float(band)
        except (TypeError, ValueError):
            continue
    return out


# --------------------------------------------------------------------------------------
# Value objects
# --------------------------------------------------------------------------------------


@dataclass(slots=True)
class Attempt:
    attempt_id: str
    skill: str
    mode: str
    band: float
    at: datetime
    criteria: dict[str, float] = field(default_factory=dict)

    @property
    def base_weight(self) -> float:
        return MODE_BASE.get(self.mode, 1.0)


@dataclass(slots=True)
class SkillEstimate:
    skill: str
    band: float
    estimate_raw: float | None
    range_low: float
    range_high: float
    confidence: str
    n_eff: float
    attempts_used: int
    newest_attempt_at: str | None
    criteria: dict[str, float] = field(default_factory=dict)
    method: str = "estimator"
    stale: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "skill": self.skill,
            "band": self.band if self.confidence != "insufficient" else None,
            "band_raw": self.estimate_raw,
            "estimate_raw": self.estimate_raw,
            "range_low": self.range_low,
            "range_high": self.range_high,
            "confidence": self.confidence,
            "n_eff": round(self.n_eff, 3),
            "attempts_used": self.attempts_used,
            "newest_attempt_at": self.newest_attempt_at,
            "criteria": self.criteria or None,
            "method": self.method,
            "stale": self.stale,
            # 10 §6.4: never render a band without its range.
            "display": (
                "—"
                if self.confidence == "insufficient"
                else f"{self.band:.1f} (likely {self.range_low:.1f}–{self.range_high:.1f})"
            ),
        }

    def planning_band(self) -> float:
        """The band the plan generator weights on (always a number, never None)."""
        return self.band


# --------------------------------------------------------------------------------------
# Reading attempts
# --------------------------------------------------------------------------------------

_SCORED_ATTEMPTS_SQL = text(
    "SELECT attempt_id, skill, mode, band, criteria_json, at "
    "FROM scored_attempts WHERE profile_id = :pid"
)


def load_attempts(session: Any, profile_id: str) -> list[Attempt]:
    """Every banded attempt for the profile, newest last, including placement seeds."""
    attempts: list[Attempt] = []
    for row in session.execute(_SCORED_ATTEMPTS_SQL, {"pid": profile_id}).mappings():
        at = parse_ts(row["at"])
        band = row["band"]
        if at is None or band is None:
            continue
        skill = str(row["skill"])
        if skill not in SKILLS:
            continue
        attempts.append(
            Attempt(
                attempt_id=str(row["attempt_id"]),
                skill=skill,
                mode=str(row["mode"] or "practice"),
                band=float(band),
                at=at,
                criteria=normalize_criteria(row["criteria_json"]),
            )
        )
    attempts.extend(_placement_seed_attempts(session, profile_id, attempts))
    attempts.sort(key=lambda a: a.at)
    return attempts


def _placement_seed_attempts(
    session: Any, profile_id: str, existing: list[Attempt]
) -> list[Attempt]:
    """Project the latest ``placement_results`` row into synthetic ×2 attempts."""
    row = session.execute(
        text(
            "SELECT id, taken_at, estimates_json FROM placement_results "
            "WHERE profile_id = :pid ORDER BY taken_at DESC, id DESC LIMIT 1"
        ),
        {"pid": profile_id},
    ).mappings().first()
    if row is None:
        return []
    payload = _loads(row["estimates_json"])
    if not isinstance(payload, dict):
        return []
    estimates = payload.get("estimates") if isinstance(payload.get("estimates"), dict) else payload
    taken_at = parse_ts(row["taken_at"]) or utcnow()
    already = {a.skill for a in existing if a.mode == "placement"}

    seeds: list[Attempt] = []
    for skill, value in (estimates or {}).items():
        if skill not in SKILLS or skill in already:
            continue
        if isinstance(value, dict):
            band = value.get("band")
            evidence = value.get("evidence") or {}
            criteria = normalize_criteria(evidence.get("criteria") if isinstance(evidence, dict) else None)
            skipped = bool(value.get("skipped"))
        else:
            band, criteria, skipped = value, {}, False
        if band is None or skipped:
            # A skipped section falls back to self-assessment, which is NOT an attempt.
            continue
        try:
            band_f = float(band)
        except (TypeError, ValueError):
            continue
        seeds.append(
            Attempt(
                attempt_id=f"{row['id']}:{skill}",
                skill=skill,
                mode="placement",
                band=band_f,
                at=taken_at,
                criteria=criteria,
            )
        )
    return seeds


# --------------------------------------------------------------------------------------
# The estimator
# --------------------------------------------------------------------------------------


def decay_weight(attempt: Attempt, now: datetime) -> float:
    age_days = max(0.0, (now - attempt.at).total_seconds() / 86400.0)
    return attempt.base_weight * (0.5 ** (age_days / HALF_LIFE_DAYS))


def _downgrade(confidence: str) -> str:
    idx = CONFIDENCE_ORDER.index(confidence)
    return CONFIDENCE_ORDER[max(0, idx - 1)]


def confidence_for(n_eff: float, newest: datetime | None, now: datetime) -> tuple[str, bool]:
    """(confidence, stale) per 10 §6.2 including the staleness downgrade."""
    age_days = float("inf") if newest is None else (now - newest).total_seconds() / 86400.0
    if n_eff < 2:
        conf = "insufficient"
    elif n_eff < 4:
        conf = "low"
    elif n_eff < 8:
        conf = "medium"
    else:
        conf = "high" if age_days <= FRESH_DAYS else "medium"
    stale = age_days > STALE_DAYS
    if stale:
        conf = _downgrade(conf)
    return conf, stale


def estimate_skill(
    skill: str,
    attempts: list[Attempt],
    now: datetime | None = None,
    self_level: str | None = None,
) -> SkillEstimate:
    """Recency-weighted rolling estimate for one skill (10 §6.1/§6.2)."""
    now = now or utcnow()
    rows = [a for a in attempts if a.skill == skill]
    if not rows:
        band = SELF_LEVEL_BAND.get(self_level or "intermediate", 5.5)
        return SkillEstimate(
            skill=skill,
            band=band,
            estimate_raw=None,
            range_low=max(0.0, band - 1.0),
            range_high=min(9.0, band + 1.0),
            confidence="insufficient",
            n_eff=0.0,
            attempts_used=0,
            newest_attempt_at=None,
            method="self_assessed",
        )

    weights = [decay_weight(a, now) for a in rows]
    total = sum(weights)
    if total <= 0:  # every attempt is astronomically old — treat as no evidence
        total = 1e-9
    raw = sum(w * a.band for w, a in zip(weights, rows, strict=True)) / total
    # Two mocks taken "just now" weigh 2.0 each; without this rounding the seconds of
    # decay between the attempt row and this call push n_eff to 3.99998 and drop the
    # learner a whole confidence level at the 4.0 gate boundary.
    n_eff = round(total, 3)
    band = round_half(raw)
    newest = max(a.at for a in rows)
    confidence, stale = confidence_for(n_eff, newest, now)
    half = CONFIDENCE_RANGE[confidence]

    criteria: dict[str, float] = {}
    for key in CRITERIA_BY_SKILL.get(skill, ()):  # only productive skills carry criteria
        pairs = [(w, a.criteria[key]) for w, a in zip(weights, rows, strict=True) if key in a.criteria]
        if not pairs:
            continue
        total = sum(w for w, _ in pairs)
        if total <= 0:
            continue
        criteria[key] = round_half(sum(w * v for w, v in pairs) / total)

    return SkillEstimate(
        skill=skill,
        band=band,
        estimate_raw=round(raw, 4),
        range_low=max(0.0, round(band - half, 2)),
        range_high=min(9.0, round(band + half, 2)),
        confidence=confidence,
        n_eff=n_eff,
        attempts_used=len(rows),
        newest_attempt_at=iso(newest),
        criteria=criteria,
        method="estimator",
        stale=stale,
    )


def overall_estimate(per_skill: dict[str, SkillEstimate]) -> SkillEstimate:
    """Official IELTS averaging over the four half-band skill displays (10 §6.3)."""
    bands = [per_skill[s].band for s in SKILLS if s in per_skill]
    mean = sum(bands) / len(bands) if bands else 0.0
    band = round_ielts(mean)
    confidences = [per_skill[s].confidence for s in SKILLS if s in per_skill]
    confidence = min(confidences, key=CONFIDENCE_ORDER.index) if confidences else "insufficient"
    half = CONFIDENCE_RANGE[confidence]
    n_eff = sum(per_skill[s].n_eff for s in SKILLS if s in per_skill)
    newest = [per_skill[s].newest_attempt_at for s in SKILLS if per_skill.get(s) and per_skill[s].newest_attempt_at]
    return SkillEstimate(
        skill="overall",
        band=band,
        estimate_raw=round(mean, 4),
        range_low=max(0.0, round(band - half, 2)),
        range_high=min(9.0, round(band + half, 2)),
        confidence=confidence,
        n_eff=n_eff,
        attempts_used=sum(per_skill[s].attempts_used for s in SKILLS if s in per_skill),
        newest_attempt_at=max(newest) if newest else None,
        method="estimator",
        stale=any(per_skill[s].stale for s in SKILLS if s in per_skill),
    )


def compute_estimates(
    session: Any,
    profile_id: str,
    now: datetime | None = None,
    self_level: str | None = None,
) -> dict[str, SkillEstimate]:
    """Per-skill estimates plus ``overall`` — pure computation, writes nothing."""
    now = now or utcnow()
    if self_level is None:
        self_level = _profile_self_level(session, profile_id)
    attempts = load_attempts(session, profile_id)
    per_skill = {
        skill: estimate_skill(skill, attempts, now=now, self_level=self_level) for skill in SKILLS
    }
    per_skill["overall"] = overall_estimate(per_skill)
    return per_skill


def _profile_self_level(session: Any, profile_id: str) -> str | None:
    row = session.execute(
        text("SELECT self_level FROM profiles WHERE id = :pid"), {"pid": profile_id}
    ).first()
    return str(row[0]) if row and row[0] else None


# --------------------------------------------------------------------------------------
# Persistence — append-only band_estimates
# --------------------------------------------------------------------------------------


def _latest_row(session: Any, profile_id: str, skill: str) -> dict[str, Any] | None:
    row = session.execute(
        text(
            "SELECT band, confidence, n_eff, criteria_json FROM current_band_estimates "
            "WHERE profile_id = :pid AND skill = :skill"
        ),
        {"pid": profile_id, "skill": skill},
    ).mappings().first()
    return dict(row) if row else None


def _unchanged(previous: dict[str, Any] | None, est: SkillEstimate) -> bool:
    if previous is None:
        return False
    return (
        abs(float(previous["band"]) - est.band) < 1e-9
        and str(previous["confidence"]) == est.confidence
        and abs(float(previous["n_eff"] or 0.0) - est.n_eff) < 0.01
        and (_loads(previous.get("criteria_json")) or {}) == (est.criteria or {})
    )


def store_estimates(
    session: Any,
    profile_id: str,
    estimates: dict[str, SkillEstimate],
    model_id: str | None = None,
    force: bool = False,
) -> list[str]:
    """Append one ``band_estimates`` row per changed skill. Returns the new row ids."""
    written: list[str] = []
    for skill in (*SKILLS, "overall"):
        est = estimates.get(skill)
        if est is None:
            continue
        if not force and _unchanged(_latest_row(session, profile_id, skill), est):
            continue
        row_id = f"be_{ULID()}"
        session.execute(
            text(
                "INSERT INTO band_estimates (id, profile_id, skill, estimate_raw, band, "
                "range_low, range_high, confidence, n_eff, attempts_used, criteria_json, "
                "method, model_id, newest_attempt_at) VALUES (:id, :pid, :skill, :raw, :band, "
                ":lo, :hi, :conf, :neff, :used, :crit, :method, :model, :newest)"
            ),
            {
                "id": row_id,
                "pid": profile_id,
                "skill": skill,
                "raw": est.estimate_raw,
                "band": est.band,
                "lo": est.range_low,
                "hi": est.range_high,
                "conf": est.confidence,
                "neff": round(est.n_eff, 4),
                "used": est.attempts_used,
                "crit": json.dumps(est.criteria) if est.criteria else None,
                "method": est.method if est.method in ("estimator", "placement", "self_assessed", "manual") else "estimator",
                "model": model_id,
                "newest": est.newest_attempt_at,
            },
        )
        written.append(row_id)
    return written


def recompute(
    session: Any,
    profile_id: str,
    now: datetime | None = None,
    model_id: str | None = None,
    force: bool = False,
) -> dict[str, SkillEstimate]:
    """Compute and persist. Call after every scored attempt (10 §6.4)."""
    estimates = compute_estimates(session, profile_id, now=now)
    store_estimates(session, profile_id, estimates, model_id=model_id, force=force)
    return estimates


def current_estimates(session: Any, profile_id: str) -> dict[str, SkillEstimate]:
    """Read the ``current_band_estimates`` view; recompute lazily when it is empty."""
    rows = session.execute(
        text(
            "SELECT skill, estimate_raw, band, range_low, range_high, confidence, n_eff, "
            "attempts_used, criteria_json, method, newest_attempt_at "
            "FROM current_band_estimates WHERE profile_id = :pid"
        ),
        {"pid": profile_id},
    ).mappings().all()
    if not rows:
        return recompute(session, profile_id)

    now = utcnow()
    out: dict[str, SkillEstimate] = {}
    for row in rows:
        newest = parse_ts(row["newest_attempt_at"])
        stale = newest is not None and (now - newest).total_seconds() / 86400.0 > STALE_DAYS
        out[str(row["skill"])] = SkillEstimate(
            skill=str(row["skill"]),
            band=float(row["band"]),
            estimate_raw=row["estimate_raw"],
            range_low=float(row["range_low"] if row["range_low"] is not None else row["band"]),
            range_high=float(row["range_high"] if row["range_high"] is not None else row["band"]),
            confidence=str(row["confidence"]),
            n_eff=float(row["n_eff"] or 0.0),
            attempts_used=int(row["attempts_used"] or 0),
            newest_attempt_at=row["newest_attempt_at"],
            criteria=_loads(row["criteria_json"]) or {},
            method=str(row["method"]),
            stale=stale,
        )
    for skill in SKILLS:
        out.setdefault(
            skill,
            estimate_skill(skill, [], now=now, self_level=_profile_self_level(session, profile_id)),
        )
    out.setdefault("overall", overall_estimate(out))
    return out


def planning_bands(session: Any, profile_id: str) -> dict[str, float]:
    """The four numbers the plan generator weights on."""
    estimates = current_estimates(session, profile_id)
    return {skill: estimates[skill].planning_band() for skill in SKILLS}


def weakest_criteria(
    estimates: dict[str, SkillEstimate], limit: int = 3
) -> list[dict[str, Any]]:
    """Lowest criterion bands across the productive skills (dashboard callouts, §7)."""
    items: list[dict[str, Any]] = []
    for skill in PRODUCTIVE_SKILLS:
        est = estimates.get(skill)
        if est is None:
            continue
        for criterion, band in (est.criteria or {}).items():
            items.append({"skill": skill, "criterion": criterion, "band": band})
    items.sort(key=lambda i: (i["band"], i["skill"], i["criterion"]))
    return items[:limit]


def trajectory(
    session: Any, profile_id: str, skill: str, weeks: int = 12
) -> list[dict[str, Any]]:
    """Weekly points for the band-trajectory chart (§7): one point per ISO week."""
    since = iso(utcnow() - timedelta(weeks=max(1, weeks)))
    rows = session.execute(
        text(
            "SELECT band, range_low, range_high, confidence, created_at, model_id "
            "FROM band_estimates WHERE profile_id = :pid AND skill = :skill "
            "AND created_at >= :since ORDER BY created_at"
        ),
        {"pid": profile_id, "skill": skill, "since": since},
    ).mappings().all()

    by_week: dict[str, dict[str, Any]] = {}
    for row in rows:
        created = parse_ts(row["created_at"]) or utcnow()
        year, week, _ = created.isocalendar()
        key = f"{year}-W{week:02d}"
        by_week[key] = {
            "week": key,
            "at": row["created_at"],
            # 10 §7: an "insufficient" week renders as a gap, never an interpolated line.
            "band": None if row["confidence"] == "insufficient" else float(row["band"]),
            "range_low": row["range_low"],
            "range_high": row["range_high"],
            "confidence": row["confidence"],
            "model_id": row["model_id"],
        }
    return [by_week[k] for k in sorted(by_week)]

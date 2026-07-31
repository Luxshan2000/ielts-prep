"""The syllabus: 154 points, their prerequisite graph, and the learner's place on it.

This module answers *what may be learned next and why not yet*. It owns no scheduling and
no grading — it reads ``grammar_points`` and turns it into the structure the Path (F1), the
point screen (F2) and the contrast boards (F6) render.

The zero-knowledge guarantee (grammar `DESIGN.md` §2.10 checks a–c) is enforced here as
well as at pack-validation time, because a graph that has gone circular must fail loudly in
the module that walks it, not silently produce a Path with nothing unlocked:

* every ``prerequisites[]`` id resolves;
* every prerequisite has a strictly lower ``sequence_index`` (bar the authored
  whitelist);
* the graph is acyclic.

:func:`check_graph` returns those problems as data so a test and a CLI can both use it.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from bandready.grammar.tables import GrammarPoint

_log = logging.getLogger("bandready.grammar.syllabus")

__all__ = [
    "PLACEMENT_NODES",
    "PREREQ_STAGE",
    "UNIT_TITLES",
    "UNIT_TRACKS",
    "Point",
    "board",
    "boards",
    "check_graph",
    "confusion_sets",
    "deepest_unmet_prerequisite",
    "load_points",
    "path_states",
    "point_public",
    "points_fixing",
    "teaching_payload",
    "topological_order",
    "unmet_prerequisites",
]

#: A prerequisite counts as met once its card is at **Choose** or above. Stage 3 is where
#: the learner can pick the form, not merely build it — anything less and the next point
#: is being taught on top of something that is not yet a decision (§1.3 route 2).
PREREQ_STAGE = 3

#: The five convergence nodes the 20-item "find my level" placement is built from (F1).
#: Named here rather than in the route because they are a property of the syllabus.
PLACEMENT_NODES: tuple[str, ...] = (
    "gr_aux_system",
    "gr_past_participle",
    "gr_clause_types",
    "gr_unreal_past",
    "gr_countability",
)

#: Learner-facing state names for the Path. Exactly the five in F1.
PATH_STATES: tuple[str, ...] = ("locked", "next", "in_progress", "practised", "mastered")

#: The 17 units, named as what the learner will be able to DO, and the track each sits in
#: (DESIGN §4.2's allocation). ``unit_id`` is a grouping for navigation only — the card, the
#: lesson and the schedulable atom are all the *point* — but the Path needs a heading a
#: beginner can read, and "u06" is not one.
UNIT_TITLES: dict[str, str] = {
    "u01": "Building a sentence",
    "u02": "Talking about now, and about what is always true",
    "u03": "Talking about the past",
    "u04": "Talking about what has not happened yet",
    "u05": "Nouns: how many, how much, and which one",
    "u06": "Linking a past action to now",
    "u07": "Saying how sure, how necessary, how allowed",
    "u08": "Putting the important thing first: the passive",
    "u09": "Joining two ideas into one sentence",
    "u10": "Talking about what is not the case",
    "u11": "Adding information about a noun",
    "u12": "What follows a verb",
    "u13": "Reporting what somebody said",
    "u14": "Comparing and describing change",
    "u15": "The accuracy points that cost the most marks",
    "u16": "Making a paragraph hold together",
    "u17": "The last few, and when not to use them",
}

#: Which track a unit belongs to. Track A is the foundation a beginner starts from; B is the
#: band-6 spine; C is the high-risk material that only pays once everything else is secure.
UNIT_TRACKS: dict[str, str] = {
    "u01": "A", "u02": "A", "u03": "A", "u04": "A", "u05": "A",
    "u06": "B", "u07": "B", "u08": "B", "u09": "B", "u10": "B",
    "u11": "B", "u12": "B", "u13": "B", "u14": "B", "u15": "B", "u16": "B",
    "u17": "C",
}


# --------------------------------------------------------------------------------------
# The parsed point
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Point:
    """One row of ``grammar_points`` with ``point_json`` already parsed.

    Every consumer reads through this rather than through the raw blob, so a missing
    optional field is answered once, here, with the schema's absent-by-default rule
    (§0.3) instead of at forty call sites.
    """

    id: str
    unit_id: str
    sequence_index: int
    title: str
    cefr_level: str
    role: str
    topic_id: str | None
    data: dict[str, Any] = field(repr=False, default_factory=dict)

    # -- point_json passthroughs ------------------------------------------------------
    @property
    def grammar_name(self) -> str:
        return str(self.data.get("grammar_name") or self.title)

    @property
    def prerequisites(self) -> list[str]:
        return [str(p) for p in (self.data.get("prerequisites") or [])]

    @property
    def priority(self) -> int:
        try:
            return int(self.data.get("priority") or 3)
        except (TypeError, ValueError):
            return 3

    @property
    def insertable(self) -> bool:
        return bool(self.data.get("insertable"))

    @property
    def register(self) -> str:
        return str(self.data.get("register") or "both")

    @property
    def risk_tier(self) -> str:
        return str(self.data.get("risk_tier") or "A")

    @property
    def error_surface(self) -> int:
        try:
            return int(self.data.get("error_surface") or 1)
        except (TypeError, ValueError):
            return 1

    @property
    def confusion_set(self) -> str | None:
        value = self.data.get("confusion_set")
        return str(value) if value else None

    @property
    def structure_slug(self) -> str | None:
        value = self.data.get("structure_slug")
        return str(value) if value else None

    @property
    def signal_blocklist(self) -> list[str]:
        return [str(s) for s in (self.data.get("signal_blocklist") or [])]

    @property
    def fixes_errors(self) -> list[str]:
        return [str(c) for c in (self.data.get("fixes_errors") or [])]

    @property
    def estimated_minutes(self) -> int:
        try:
            return int(self.data.get("estimated_minutes") or 15)
        except (TypeError, ValueError):
            return 15

    @property
    def teach(self) -> dict[str, Any]:
        block = self.data.get("teach")
        return dict(block) if isinstance(block, dict) else {}

    @property
    def contrast(self) -> dict[str, Any]:
        block = self.data.get("contrast")
        return dict(block) if isinstance(block, dict) else {}

    @property
    def board_id(self) -> str | None:
        value = self.contrast.get("board_id")
        return str(value) if value else None

    @property
    def errors(self) -> list[dict[str, Any]]:
        return [e for e in (self.data.get("errors") or []) if isinstance(e, dict)]

    @property
    def pays_in(self) -> list[dict[str, Any]]:
        return [p for p in (self.data.get("pays_in") or []) if isinstance(p, dict)]

    @property
    def used_in(self) -> list[dict[str, Any]]:
        return [u for u in (self.data.get("used_in") or []) if isinstance(u, dict)]

    @property
    def criteria(self) -> list[str]:
        return [str(c) for c in (self.data.get("criteria") or [])]

    @property
    def items(self) -> list[dict[str, Any]]:
        return [i for i in (self.data.get("items") or []) if isinstance(i, dict)]

    def item(self, item_id: str) -> dict[str, Any] | None:
        return next((i for i in self.items if str(i.get("id")) == item_id), None)

    def has_item(self, kind: str, stage: int) -> bool:
        return any(
            str(i.get("kind")) == kind and int(i.get("stage") or 0) == stage for i in self.items
        )


def _parse(row: Any) -> Point:
    raw = row.point_json
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            _log.warning("grammar point %s has unreadable point_json", row.id)
            data = {}
    else:
        data = dict(raw or {})
    return Point(
        id=str(row.id),
        unit_id=str(row.unit_id),
        sequence_index=int(row.sequence_index),
        title=str(row.title),
        cefr_level=str(row.cefr_level or "B1"),
        role=str(row.role or "form"),
        topic_id=str(row.topic_id) if row.topic_id else None,
        data=data if isinstance(data, dict) else {},
    )


# --------------------------------------------------------------------------------------
# Loading, with a cheap cache
# --------------------------------------------------------------------------------------

_CACHE: dict[str, Any] = {"signature": None, "points": {}}


def _signature(session: Session) -> tuple[int, str]:
    """(row count, max id) — enough to notice a pack import without hashing 154 blobs."""
    row = session.execute(
        select(func.count(GrammarPoint.id), func.max(GrammarPoint.id))
    ).one()
    return int(row[0] or 0), str(row[1] or "")


def load_points(session: Session, *, refresh: bool = False) -> dict[str, Point]:
    """Every non-retired point, keyed by id, in ``sequence_index`` order.

    Parsing 154 JSON blobs on every request would be a waste, so the result is memoised
    against a (count, max-id) signature — a pack import changes one or the other.
    """
    signature = _signature(session)
    if refresh or _CACHE["signature"] != signature:
        rows = (
            session.execute(
                select(GrammarPoint)
                .where(GrammarPoint.retired == 0)
                .order_by(GrammarPoint.sequence_index)
            )
            .scalars()
            .all()
        )
        _CACHE["points"] = {p.id: p for p in (_parse(r) for r in rows)}
        _CACHE["signature"] = signature
    return dict(_CACHE["points"])


def reset_cache() -> None:
    """Drop the memoised syllabus (tests, and the importer, call this)."""
    _CACHE["signature"] = None
    _CACHE["points"] = {}


# --------------------------------------------------------------------------------------
# The graph
# --------------------------------------------------------------------------------------


def topological_order(points: dict[str, Point]) -> list[str]:
    """Kahn's algorithm over ``prerequisites[]``.

    Raises ``ValueError`` naming the points still in the graph when it does not drain —
    that message is what a content author needs to see, not "cycle detected".
    """
    indegree: dict[str, int] = {pid: 0 for pid in points}
    dependents: dict[str, list[str]] = defaultdict(list)
    for pid, point in points.items():
        for prereq in point.prerequisites:
            if prereq in points:
                indegree[pid] += 1
                dependents[prereq].append(pid)

    queue = deque(
        sorted((pid for pid, deg in indegree.items() if deg == 0), key=lambda p: points[p].sequence_index)
    )
    order: list[str] = []
    while queue:
        pid = queue.popleft()
        order.append(pid)
        for child in dependents[pid]:
            indegree[child] -= 1
            if indegree[child] == 0:
                queue.append(child)
    if len(order) != len(points):
        stuck = sorted(set(points) - set(order))
        raise ValueError(
            "the grammar prerequisite graph has a cycle; these points never became "
            f"reachable: {', '.join(stuck)}"
        )
    return order


def check_graph(points: dict[str, Point]) -> list[str]:
    """Every structural problem in the graph, as human-readable lines.

    An empty list is the zero-knowledge guarantee: a learner who starts at
    ``sequence_index`` 1 and works down never meets a point whose prerequisite they have
    not been offered.
    """
    problems: list[str] = []

    seen_sequences: dict[int, str] = {}
    for pid, point in sorted(points.items(), key=lambda kv: kv[1].sequence_index):
        clash = seen_sequences.get(point.sequence_index)
        if clash is not None:
            problems.append(
                f"{pid}: sequence_index {point.sequence_index} is already used by {clash}"
            )
        seen_sequences[point.sequence_index] = pid

        for prereq in point.prerequisites:
            target = points.get(prereq)
            if target is None:
                problems.append(f"{pid}: prerequisite {prereq!r} does not resolve to a point")
                continue
            if target.sequence_index >= point.sequence_index:
                problems.append(
                    f"{pid} (seq {point.sequence_index}) requires {prereq} "
                    f"(seq {target.sequence_index}), which is taught later or at the same time"
                )
        if pid in point.prerequisites:
            problems.append(f"{pid}: is its own prerequisite")

    try:
        topological_order(points)
    except ValueError as exc:
        problems.append(str(exc))

    # A confusion set with one member is not a contrast — the point is mis-roled (§2.8).
    for name, members in confusion_sets(points).items():
        if len(members) < 2:
            problems.append(
                f"confusion set {name!r} has only one member ({members[0]}); "
                "a contrast needs at least two"
            )

    # Every contrast.with[] id must resolve, or F6's board renders half a comparison.
    for pid, point in points.items():
        for rival in point.contrast.get("with") or []:
            if str(rival) not in points:
                problems.append(f"{pid}: contrast.with {rival!r} does not resolve to a point")
    return problems


def unmet_prerequisites(
    point: Point, stages: dict[str, int], points: dict[str, Point]
) -> list[str]:
    """Direct prerequisites not yet at :data:`PREREQ_STAGE`, in teaching order."""
    unmet = [
        prereq
        for prereq in point.prerequisites
        if prereq in points and stages.get(prereq, -1) < PREREQ_STAGE
    ]
    return sorted(unmet, key=lambda p: points[p].sequence_index)


def deepest_unmet_prerequisite(
    point_id: str, stages: dict[str, int], points: dict[str, Point]
) -> str | None:
    """The point the learner must actually start with to reach ``point_id``.

    Entry route 1 (§1.3) hands the learner the point that fixes the error they just made.
    When that point is locked, handing them the *direct* prerequisite is still a locked
    door — this walks down to the first point whose own prerequisites are all met, which
    is the one they can begin today. Returns ``None`` when ``point_id`` is itself ready.
    """
    start = points.get(point_id)
    if start is None:
        return None
    if not unmet_prerequisites(start, stages, points):
        return None

    seen: set[str] = set()

    def walk(pid: str) -> str | None:
        if pid in seen:
            return None  # defensive: check_graph proves this cannot happen
        seen.add(pid)
        point = points.get(pid)
        if point is None:
            return None
        blocking = unmet_prerequisites(point, stages, points)
        if not blocking:
            return pid
        for prereq in blocking:
            found = walk(prereq)
            if found is not None:
                return found
        return None

    return walk(point_id)


def points_fixing(points: dict[str, Point], code: str) -> list[Point]:
    """Points whose ``fixes_errors[]`` names ``code``, in teaching order."""
    return sorted(
        (p for p in points.values() if code in p.fixes_errors),
        key=lambda p: p.sequence_index,
    )


def confusion_sets(points: dict[str, Point]) -> dict[str, list[str]]:
    """``{set name: [member point ids]}`` in teaching order."""
    sets: dict[str, list[str]] = defaultdict(list)
    for point in sorted(points.values(), key=lambda p: p.sequence_index):
        if point.confusion_set:
            sets[point.confusion_set].append(point.id)
    return dict(sets)


def siblings(points: dict[str, Point], point: Point) -> list[Point]:
    """Other members of this point's confusion set — the §1.9 contrast constraint."""
    if not point.confusion_set:
        return []
    return [
        p
        for p in points.values()
        if p.confusion_set == point.confusion_set and p.id != point.id
    ]


# --------------------------------------------------------------------------------------
# The Path (F1)
# --------------------------------------------------------------------------------------


def path_states(
    points: dict[str, Point],
    stages: dict[str, int],
    *,
    mastered: set[str] | None = None,
) -> list[dict[str, Any]]:
    """One row per point: its state, and — when locked — *what* is blocking it.

    F1's rule is that nothing is ever hidden. A locked point still shows its can-do line
    and names the point that unlocks it, because "you cannot see this yet" is the one
    message a beginner reads as "this app is not for me".
    """
    mastered = mastered or set()
    ordered = sorted(points.values(), key=lambda p: p.sequence_index)
    next_up_assigned = False
    rows: list[dict[str, Any]] = []
    for point in ordered:
        stage = stages.get(point.id)
        blocking = unmet_prerequisites(point, stages, points)
        if point.id in mastered:
            state = "mastered"
        elif stage is None:
            state = "locked" if blocking else "next"
        elif stage >= 4:
            state = "practised"
        else:
            state = "in_progress"

        is_next_up = False
        if not next_up_assigned and state in ("next", "in_progress"):
            is_next_up = True
            next_up_assigned = True

        rows.append(
            {
                "id": point.id,
                "unit_id": point.unit_id,
                "sequence_index": point.sequence_index,
                "title": point.title,
                "grammar_name": point.grammar_name,
                "cefr_level": point.cefr_level,
                "role": point.role,
                "priority": point.priority,
                "risk_tier": point.risk_tier,
                "error_surface": point.error_surface,
                "estimated_minutes": point.estimated_minutes,
                "confusion_set": point.confusion_set,
                "board_id": point.board_id,
                "state": state,
                "is_next_up": is_next_up,
                "stage": stage,
                "prerequisites": point.prerequisites,
                "blocked_by": [
                    {"id": pid, "title": points[pid].title} for pid in blocking
                ],
                "start_here": (
                    deepest_unmet_prerequisite(point.id, stages, points) if blocking else None
                ),
            }
        )
    return rows


# --------------------------------------------------------------------------------------
# Wire shapes
# --------------------------------------------------------------------------------------


def point_public(point: Point) -> dict[str, Any]:
    """The point's metadata, without the teaching payload or the item bank."""
    return {
        "id": point.id,
        "unit_id": point.unit_id,
        "sequence_index": point.sequence_index,
        "title": point.title,
        "grammar_name": point.grammar_name,
        "cefr_level": point.cefr_level,
        "role": point.role,
        "topic_id": point.topic_id,
        "priority": point.priority,
        "register": point.register,
        "risk_tier": point.risk_tier,
        "error_surface": point.error_surface,
        "confusion_set": point.confusion_set,
        "structure_slug": point.structure_slug,
        "board_id": point.board_id,
        "fixes_errors": point.fixes_errors,
        "criteria": point.criteria,
        "estimated_minutes": point.estimated_minutes,
        "prerequisites": point.prerequisites,
    }


def teaching_payload(point: Point, *, reveal_notice: bool = False) -> dict[str, Any]:
    """Everything F2 renders, and nothing that gives away an item's key.

    ``items[]`` is deliberately absent: items reach the client one at a time, through the
    session builder, with their keys stripped. A point screen that shipped the whole bank
    would ship every answer with it.

    ``discovery.candidate_rules`` **is** withheld until the point has been opened: it is a
    rule-induction quiz with a deliberate keyword trap, and a learner who can see which
    candidate is marked ``right`` has been handed the answer to the one screen whose whole
    purpose is that they work it out.

    ``notice_set`` is **not** withheld, and that is a deliberate departure from the
    four skills' gating rule. It is the S0 structured input: six sentences with a question
    about the *world*, answered on the lesson screen before anything is scheduled, feeding
    no card and moving no rung. Its key and its ``why`` are the teaching — a learner who
    answers "the road is still closed" and is shown nothing has been given a quiz, not an
    explanation. The rule that answers stay server-side applies to items that are graded and
    logged; every one of those still ships blind, one at a time, through the session builder.
    """
    teach = dict(point.teach)
    if not reveal_notice:
        discovery = teach.get("discovery")
        if isinstance(discovery, dict):
            teach["discovery"] = {
                **discovery,
                "candidate_rules": [
                    {"text": rule.get("text")}
                    for rule in (discovery.get("candidate_rules") or [])
                    if isinstance(rule, dict)
                ],
            }
    return {
        **point_public(point),
        "teach": teach,
        "contrast": point.contrast,
        "errors": point.errors,
        "pays_in": point.pays_in,
        "used_in": point.used_in,
        "item_count": len(point.items),
        "risk_note": (
            "This structure is worth having, but it breaks in more ways than it helps "
            "if it is not secure. Do not take it into the exam until it is."
            if point.risk_tier == "C"
            else None
        ),
    }


def boards(points: dict[str, Point]) -> list[dict[str, Any]]:
    """Every contrast board id with its member points (F6)."""
    by_board: dict[str, list[Point]] = defaultdict(list)
    for point in sorted(points.values(), key=lambda p: p.sequence_index):
        if point.board_id:
            by_board[point.board_id].append(point)
    return [
        {
            "board_id": board_id,
            "title": members[0].contrast.get("question") or members[0].title,
            "points": [p.id for p in members],
            "confusion_set": members[0].confusion_set,
        }
        for board_id, members in sorted(by_board.items())
    ]


def board(points: dict[str, Point], board_id: str) -> dict[str, Any] | None:
    """One contrast board, assembled from every point that declares it (F6).

    A board is not a reference page. It answers one question — the one the learner keeps
    getting wrong — with the deciding question, three worked pairs, and the note that says
    what the other choice *would have meant*.
    """
    members = [
        p
        for p in sorted(points.values(), key=lambda p: p.sequence_index)
        if p.board_id == board_id
    ]
    if not members:
        return None
    primary = members[0].contrast
    return {
        "board_id": board_id,
        "question": primary.get("question"),
        "fork": primary.get("fork") or [],
        "minimal_pair": primary.get("minimal_pair") or {},
        "wrong_choice_note": primary.get("wrong_choice_note"),
        "edge_case": primary.get("edge_case") or {},
        "stronger_test": primary.get("stronger_test"),
        "worked_pairs": primary.get("worked_pairs") or [],
        "confusion_set": members[0].confusion_set,
        "points": [
            {
                "id": p.id,
                "title": p.title,
                "grammar_name": p.grammar_name,
                "rule_line": p.teach.get("rule_line"),
                "false_rule": p.teach.get("false_rule"),
            }
            for p in members
        ],
    }

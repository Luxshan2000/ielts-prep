/**
 * The path — the screen that decides whether this module gets used at all.
 *
 * A learner who knows no grammar has to be able to land here and press one
 * button. So the top of this screen is a single card with one primary action and
 * a plain sentence saying what happens when it is pressed; the syllabus below it
 * is the whole road, visible from the start, with every lesson in one of five
 * states and every locked one saying *what it is waiting for* rather than just
 * being greyed out (DESIGN §6 F1).
 *
 * Three things on this screen are honesty rather than decoration, and they should
 * not be cut for space:
 *
 * - the **duration**, stated in weeks, because a learner who thinks grammar takes
 *   three weeks quits in week four;
 * - the **whole list**, because a progress bar that hides its denominator is a
 *   progress bar nobody believes;
 * - the note that some points — third-person `-s`, articles, past endings — keep
 *   producing errors for months after they are learned. That is how acquisition
 *   works, and a learner who is not told concludes the module is broken.
 *
 * The hard problem is 154 of them. Four things carry that weight, and none of
 * them hides a lesson:
 *
 * 1. **The map.** One bar, seventeen segments, one per unit, each filled by how
 *    much of it is done, with a marker on the part the next lesson is in. It is
 *    the only place the whole 154 is a single object you can point at.
 * 2. **Parts, numbered.** "Part 3 of 17" beside a unit title turns a scroll into
 *    a walk with a known length.
 * 3. **A reason on every locked row.** The server resolves each blocker to a
 *    title and names the deepest one, so a locked row reads "opens after X" and
 *    offers the lesson that actually opens it. The word "Locked", 153 times, was
 *    the thing that made this list feel like a wall.
 * 4. **Filters over states, with counts.** "Ready to start · 4" answers the only
 *    question a returning learner has.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  GraduationCap,
  Lock,
  Play,
  Stethoscope,
  Target,
} from "lucide-react";
import { Badge, Button, ErrorState, Skeleton } from "@/components/ui";
import { SearchInput } from "@/components/ui/SearchInput";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { LEVEL_LABEL, ROLE_LABEL, TRACK_LABEL, TRACK_NOTE, formatStudyTime } from "../labels";
import { useGrammarStore } from "../store";
import type { PathPoint, PathUnit } from "../types";
import { StageBar, StateBadge } from "./primitives";

const DONE_STATES = new Set<PathPoint["state"]>(["practised", "mastered"]);

function unitPoints(unit: PathUnit, byId: Map<string, PathPoint>): PathPoint[] {
  return (unit.point_ids ?? []).map((id) => byId.get(id)).filter((p): p is PathPoint => !!p);
}

/** Whichever level most of a unit's lessons sit at, in words rather than a code. */
function unitLevel(points: PathPoint[]): string | null {
  const tally = new Map<string, number>();
  for (const point of points) {
    const label = LEVEL_LABEL[String(point.cefr_level ?? "").toUpperCase()];
    if (label) tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [label, count] of tally) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

// ------------------------------------------------------------- start card ----

function StartCard() {
  const navigate = useNavigate();
  const path = useGrammarStore((s) => s.path);
  const summary = path?.summary;
  const nextId = summary?.next_point_id ?? null;
  const points = path?.points ?? [];
  const nextPoint = nextId ? points.find((p) => p.id === nextId) ?? null : null;
  const due = summary?.due_now ?? 0;
  const harvested = summary?.harvested_codes ?? 0;
  const started = summary?.started ?? 0;
  const total = summary?.total_points ?? points.length;
  const finished = total > 0 && (summary?.mastered ?? 0) >= total;

  return (
    <section className="rounded-xl border border-primary/40 bg-primary/8 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            {finished
              ? "You have been through the whole path"
              : started === 0
                ? "Start at the beginning"
                : "Pick up where you left off"}
          </h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {finished
              ? "Every lesson has been used correctly in your own writing or speaking. What is left is keeping it there, which is what the practice queue is for."
              : started === 0
                ? "You do not need to know anything to begin. The first lesson assumes nothing, and each one after it only uses what you have already been taught."
                : nextPoint
                  ? "Your next lesson is ready. Nothing in it depends on anything you have not done."
                  : "Everything you have started is scheduled. A new lesson is the useful thing to do next."}
          </p>
          {nextPoint && (
            <p className="mt-3 text-sm font-medium text-foreground">
              Next: {nextPoint.title}
              <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                {/* The denominator is the point: one lesson of 154 is a step, not a drop. */}
                lesson {nextPoint.sequence_index} of {total}
                {nextPoint.estimated_minutes ? ` · about ${nextPoint.estimated_minutes} minutes` : ""}
              </span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {due > 0 && (
            <Button onClick={() => navigate("/grammar/practice")} size="lg">
              <Play className="h-4 w-4" />
              Practise {due} due
            </Button>
          )}
          <Button
            variant={due > 0 ? "outline" : "primary"}
            size="lg"
            disabled={!nextPoint}
            onClick={() => nextPoint && navigate(`/grammar/point/${encodeURIComponent(nextPoint.id)}`)}
          >
            <GraduationCap className="h-4 w-4" />
            {started === 0 ? "Start the first lesson" : "Open the next lesson"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate("/grammar?tab=progress")}
          className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-foreground">
              Fix what's costing me marks
            </span>
            <span className="block text-[12px] leading-relaxed text-muted-foreground">
              {harvested > 0
                ? `${harvested} mistake ${harvested === 1 ? "type has" : "types have"} come back from your own writing and speaking. Start from those instead of from lesson one.`
                : "Once you have written or spoken something in the other modules, the mistakes you actually make build your path."}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/grammar/practice?mode=placement")}
          className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Compass className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-foreground">Find where to start</span>
            <span className="block text-[12px] leading-relaxed text-muted-foreground">
              A short set of questions across the five points everything else hangs off. It moves your
              starting place. It does not give you a level.
            </span>
          </span>
        </button>
      </div>

      {summary?.pace_note && (
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">{summary.pace_note}</p>
      )}
    </section>
  );
}

// --------------------------------------------------------------- the map ----

interface UnitView {
  unit: PathUnit;
  /** Every point in the unit, before any filter — the map must not lie about size. */
  all: PathPoint[];
  index: number;
  done: number;
  started: number;
  minutes: number;
  hasNext: boolean;
}

/**
 * The whole path as one object.
 *
 * Seventeen segments, each as wide as its unit is long, filled by how much of it
 * is finished. It answers "where am I in this" in one glance — the question the
 * seventeen collapsed headers underneath cannot answer at any scroll position.
 */
function PathMap({ views, onJump }: { views: UnitView[]; onJump: (unitId: string) => void }) {
  const totalPoints = views.reduce((n, v) => n + v.all.length, 0);
  const totalDone = views.reduce((n, v) => n + v.done, 0);
  const totalStarted = views.reduce((n, v) => n + v.started, 0);
  const minutesLeft = views.reduce(
    (n, v) => n + v.all.filter((p) => !DONE_STATES.has(p.state)).reduce((m, p) => m + (p.estimated_minutes ?? 0), 0),
    0,
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">Where you are</h2>
        <p className="text-[12px] text-muted-foreground">
          {totalDone > 0
            ? `${totalDone} of ${totalPoints} lessons finished · ${totalStarted - totalDone} on the way`
            : totalStarted > 0
              ? `${totalStarted} of ${totalPoints} lessons opened, none finished yet`
              : `Nothing started yet · ${totalPoints} lessons in the path`}
        </p>
      </div>

      <ul className="mt-3 flex w-full items-end gap-0.5">
        {views.map((view) => {
          const size = view.all.length || 1;
          const donePct = Math.round((view.done / size) * 100);
          // Work in progress gets its own paler share, so a part somebody is halfway
          // through never looks identical to one they have never opened.
          const openPct = Math.round((Math.max(0, view.started - view.done) / size) * 100);
          return (
            <li key={view.unit.unit_id} className="min-w-0" style={{ flex: `${view.all.length} 1 0%` }}>
              <button
                type="button"
                onClick={() => onJump(view.unit.unit_id)}
                title={`Part ${view.index}: ${view.unit.title}`}
                aria-label={`Part ${view.index} of ${views.length}, ${view.unit.title}, ${view.done} of ${view.all.length} finished`}
                className="block w-full rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
              >
                <span
                  className={cn(
                    "block h-2 text-center text-[9px] leading-none",
                    view.hasNext ? "text-primary" : "text-transparent",
                  )}
                  aria-hidden="true"
                >
                  {view.hasNext ? "▼" : ""}
                </span>
                <span
                  className={cn(
                    "mt-0.5 flex overflow-hidden rounded-sm",
                    view.hasNext ? "h-3.5 bg-primary/25" : "h-2.5 bg-muted",
                  )}
                >
                  <span className="block h-full bg-primary" style={{ width: `${donePct}%` }} />
                  <span className="block h-full bg-primary/40" style={{ width: `${openPct}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Each block is one part of the syllabus, as wide as it is long. The marked one holds your next
        lesson. Click any of them to jump there.
        {totalDone > 0 ? ` About ${formatStudyTime(minutesLeft)} of teaching is still ahead of you.` : ""}
      </p>
    </section>
  );
}

// ------------------------------------------------------------- point row ----

function PointRow({
  point,
  byId,
  total,
}: {
  point: PathPoint;
  byId: Map<string, PathPoint>;
  total: number;
}) {
  const navigate = useNavigate();
  const locked = point.state === "locked";
  const blockers = point.blocked_by ?? [];
  const opener = point.start_here ? byId.get(point.start_here) ?? null : null;
  const openerIsBlocker = opener ? blockers.some((b) => b.id === opener.id) : false;
  const open = (id: string) => navigate(`/grammar/point/${encodeURIComponent(id)}`);

  return (
    <li>
      <div
        className={cn(
          "group flex flex-col gap-2 rounded-lg border px-3 py-2.5 transition-colors sm:flex-row sm:items-center sm:gap-4",
          locked
            ? "border-border/60 bg-muted/30"
            : point.is_next_up
              ? "border-primary/50 bg-primary/8"
              : "border-border bg-background hover:border-primary/50",
        )}
      >
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => open(point.id)}
            className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {point.sequence_index}
                <span className="sr-only"> of {total}</span>
              </span>
              <span
                className={cn(
                  "text-[13px] font-medium",
                  locked ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {point.title}
              </span>
              {point.is_next_up && <Badge tone="primary">Next up</Badge>}
              {point.wild_failure && <Badge tone="warning">Came back wrong in a real answer</Badge>}
              {point.leech && !point.wild_failure && <Badge tone="warning">Keeps slipping</Badge>}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {point.grammar_name && <span>{point.grammar_name}</span>}
              <span aria-hidden="true">·</span>
              <span>{ROLE_LABEL[point.role as keyof typeof ROLE_LABEL] ?? point.role}</span>
              {point.estimated_minutes ? <span>· {point.estimated_minutes} min</span> : null}
            </span>
          </button>

          {/* The prerequisite chips are their own buttons, beside the row button
              rather than inside it — a locked lesson has to say what it is
              waiting for AND let you go there, and interactive content cannot
              nest inside a button. */}
          {locked && blockers.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>Opens after</span>
              {blockers.map((blocker) => (
                <button
                  key={blocker.id}
                  type="button"
                  onClick={() => open(blocker.id)}
                  className="rounded bg-muted px-1.5 py-0.5 text-left text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {blocker.title}
                </button>
              ))}
            </p>
          )}

          {/* The nearest blocker is rarely the one to go and do. `start_here` is
              the deepest unmet prerequisite — the lesson that actually starts
              this branch moving. It is worth a line only when it is somewhere
              the learner is not already being sent: the card at the top of the
              screen owns the next-up lesson. */}
          {locked && opener && !openerIsBlocker && !opener.is_next_up && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              To get here, start at{" "}
              <button
                type="button"
                onClick={() => open(opener.id)}
                className="rounded text-left font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                lesson {opener.sequence_index}: {opener.title}
              </button>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:w-44">
          {!locked && point.stage != null && point.stage > 0 && (
            <StageBar stage={point.stage} compact className="hidden sm:flex" />
          )}
          {/* A locked row already says what it is waiting for, one line up. A
              second "Locked" chip beside it, 153 times, is what made this list
              read as a wall. */}
          {!locked && <StateBadge state={point.state} />}
        </div>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ units ----

function UnitBlock({
  view,
  points,
  byId,
  total,
  open,
  onToggle,
}: {
  view: UnitView;
  points: PathPoint[];
  byId: Map<string, PathPoint>;
  total: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { unit, all, index, done, minutes } = view;
  // Eleven of the seventeen units are track B, so a chip on all of them says
  // nothing. Only the two exceptions are worth marking: what everything rests on,
  // and what is not safe to reach for early.
  const track = unit.track === "A" || unit.track === "C" ? unit.track : null;
  const level = unitLevel(all);

  if (points.length === 0) return null;

  return (
    <section id={`grammar-unit-${unit.unit_id}`} className="scroll-mt-4 rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background rounded-xl"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Part {index}
            </span>
            <span className="text-sm font-semibold text-foreground">{unit.title}</span>
            {track && (
              <span title={TRACK_NOTE[track]}>
                <Badge tone={track === "C" ? "warning" : "outline"}>{TRACK_LABEL[track]}</Badge>
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
            {pluralize(all.length, "lesson")} · about {formatStudyTime(minutes)}
            {level ? ` · mostly ${level} level` : ""}
            {view.hasNext ? " · your next lesson is in here" : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[11px] text-muted-foreground">
            {done > 0
              ? `${done} of ${all.length} done`
              : view.started > 0
                ? `${view.started} of ${all.length} opened`
                : "Not started"}
          </span>
          <span className="mt-1 flex h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full bg-primary"
              style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }}
            />
            <span
              className="block h-full bg-primary/40"
              style={{
                width: `${all.length ? (Math.max(0, view.started - done) / all.length) * 100 : 0}%`,
              }}
            />
          </span>
        </span>
      </button>
      {open && (
        <ul className="space-y-1.5 px-3 pb-3">
          {points.map((point) => (
            <PointRow key={point.id} point={point} byId={byId} total={total} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- filters ----

type FilterId = "all" | "ready" | "in_progress" | "attention" | "done";

const FILTERS: { id: FilterId; label: string; empty: string }[] = [
  { id: "all", label: "Everything", empty: "" },
  {
    id: "ready",
    label: "Ready to start",
    empty: "Nothing is open yet. Finish the lesson the path is pointing at and the next ones unlock.",
  },
  {
    id: "in_progress",
    label: "In progress",
    empty: "No lesson is part-way through. Open one and it will appear here until it is practised.",
  },
  {
    id: "attention",
    label: "Needs another look",
    empty:
      "Nothing is slipping. A lesson lands here when it keeps coming out wrong, or when it broke in something you actually wrote or said.",
  },
  { id: "done", label: "Finished", empty: "No lesson is finished yet. This fills as you practise." },
];

function inFilter(point: PathPoint, filter: FilterId): boolean {
  switch (filter) {
    case "ready":
      return point.state === "next";
    case "in_progress":
      return point.state === "in_progress";
    case "attention":
      return !!point.leech || !!point.wild_failure;
    case "done":
      return DONE_STATES.has(point.state);
    default:
      return true;
  }
}

// ----------------------------------------------------------------- screen ----

export function PathScreen() {
  const path = useGrammarStore((s) => s.path);
  const loading = useGrammarStore((s) => s.pathLoading);
  const error = useGrammarStore((s) => s.pathError);
  const loadPath = useGrammarStore((s) => s.loadPath);
  const [filter, setFilter] = useState("");
  const [state, setState] = useState<FilterId>("all");
  /** Units the learner has opened or shut by hand — everything else follows the path. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadPath();
  }, [loadPath]);

  const byId = useMemo(
    () => new Map((path?.points ?? []).map((point) => [point.id, point])),
    [path],
  );

  const units = useMemo(() => {
    if (!path) return [];
    const declared = path.units ?? [];
    if (declared.length > 0) return declared;
    // A server that ships points without unit rows still gets a grouped path.
    const seen = new Map<string, PathUnit>();
    for (const point of path.points) {
      const existing = seen.get(point.unit_id);
      if (existing) existing.point_ids.push(point.id);
      else seen.set(point.unit_id, { unit_id: point.unit_id, title: point.unit_id, point_ids: [point.id] });
    }
    return Array.from(seen.values());
  }, [path]);

  const views: UnitView[] = useMemo(
    () =>
      units.map((unit, i) => {
        const all = unitPoints(unit, byId);
        return {
          unit,
          all,
          index: i + 1,
          done: all.filter((p) => DONE_STATES.has(p.state)).length,
          started: all.filter((p) => p.state !== "locked" && p.state !== "next").length,
          minutes: all.reduce((m, p) => m + (p.estimated_minutes ?? 0), 0),
          hasNext: all.some((p) => p.is_next_up),
        };
      }),
    [units, byId],
  );

  // A search or a filter re-decides which parts are worth having open, so the
  // learner's earlier expand/collapse choices are dropped rather than left on top
  // of it hiding matches.
  useEffect(() => {
    setToggled({});
  }, [filter, state]);

  const jump = useCallback((unitId: string) => {
    setToggled((prev) => ({ ...prev, [unitId]: true }));
    // The section exists by the time the click lands; the open flag above only
    // changes what is inside it, so it is safe to scroll on the same tick.
    requestAnimationFrame(() => {
      document.getElementById(`grammar-unit-${unitId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  if (loading && !path) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState error={error} title="The learning path could not be loaded" onRetry={() => void loadPath(true)} />
    );
  }

  const needle = filter.trim().toLowerCase();
  const matches = (point: PathPoint) =>
    inFilter(point, state) &&
    (!needle ||
      point.title.toLowerCase().includes(needle) ||
      (point.grammar_name ?? "").toLowerCase().includes(needle));

  const allPoints = path?.points ?? [];
  const counts: Record<FilterId, number> = {
    all: allPoints.length,
    ready: allPoints.filter((p) => inFilter(p, "ready")).length,
    in_progress: allPoints.filter((p) => inFilter(p, "in_progress")).length,
    attention: allPoints.filter((p) => inFilter(p, "attention")).length,
    done: allPoints.filter((p) => inFilter(p, "done")).length,
  };

  const narrowed = state !== "all" || !!needle;
  const shown = allPoints.filter(matches).length;

  return (
    <div className="space-y-5 pb-10">
      <StartCard />

      {views.length > 0 && <PathMap views={views} onJump={jump} />}

      <div className="space-y-2">
        <SearchInput
          value={filter}
          onChange={setFilter}
          placeholder="Find a lesson: “passive”, “articles”"
          aria-label="Find a lesson"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const count = counts[f.id];
            const active = state === f.id;
            return (
              <button
                key={f.id}
                type="button"
                disabled={count === 0 && f.id !== "all"}
                aria-pressed={active}
                onClick={() => setState(f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                  count === 0 && f.id !== "all" && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                {f.label}
                <span className="ml-1.5 tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {narrowed && shown === 0 ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-medium text-foreground">
            {needle ? `No lesson matches “${filter.trim()}”.` : "Nothing is in that group yet."}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {needle
              ? "Lessons are named by what you can do with them rather than by the grammar term. Try “past” or “joining”."
              : FILTERS.find((f) => f.id === state)?.empty}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setFilter("");
              setState("all");
            }}
          >
            Show the whole path
          </Button>
        </section>
      ) : (
        <div className="space-y-3">
          {views.map((view) => {
            const points = unitPoints(view.unit, byId).filter(matches);
            const followsPath = narrowed || view.hasNext;
            return (
              <UnitBlock
                key={view.unit.unit_id}
                view={view}
                points={points}
                byId={byId}
                total={allPoints.length}
                open={toggled[view.unit.unit_id] ?? followsPath}
                onToggle={() =>
                  setToggled((prev) => ({
                    ...prev,
                    [view.unit.unit_id]: !(prev[view.unit.unit_id] ?? followsPath),
                  }))
                }
              />
            );
          })}
        </div>
      )}

      <section className="rounded-xl border border-border bg-muted/40 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Target className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Two things worth knowing before you start
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Some of these (the `-s` on he/she/it, the articles, the past endings) will keep coming out
          wrong for months after you have learned them. That is not you failing and it is not this
          module failing. Teaching moves how often you get them right; it does not change the order in
          which they become automatic.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          And a lesson is not finished when you have read it. “Practised” means you can build it and
          choose it. “Mastered” means you have used it correctly in your own writing or speaking, weeks
          after you first met it. That gap is normal.
        </p>
      </section>
    </div>
  );
}

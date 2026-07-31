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
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  GraduationCap,
  Lock,
  Play,
  Search,
  Stethoscope,
  Target,
} from "lucide-react";
import { Badge, Button, ErrorState, Input, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROLE_LABEL } from "../labels";
import { useGrammarStore } from "../store";
import type { PathPoint, PathUnit } from "../types";
import { StageBar, StateBadge } from "./primitives";

const OPEN_STATES = new Set<PathPoint["state"]>(["next", "in_progress"]);

function unitPoints(unit: PathUnit, byId: Map<string, PathPoint>): PathPoint[] {
  return unit.point_ids.map((id) => byId.get(id)).filter((p): p is PathPoint => !!p);
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

  return (
    <section className="rounded-xl border border-primary/40 bg-primary/8 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            {started === 0 ? "Start at the beginning" : "Pick up where you left off"}
          </h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {started === 0
              ? "You do not need to know anything to begin. The first lesson assumes nothing, and each one after it only uses what you have already been taught."
              : nextPoint
                ? "Your next lesson is ready. Nothing in it depends on anything you have not done."
                : "Everything you have started is scheduled. A new lesson is the useful thing to do next."}
          </p>
          {nextPoint && (
            <p className="mt-3 text-sm font-medium text-foreground">
              Next: {nextPoint.title}
              <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                {nextPoint.estimated_minutes ? `about ${nextPoint.estimated_minutes} minutes` : ""}
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
              Twenty questions across the five points everything else hangs off. It moves your starting
              place — it does not give you a level.
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

// -------------------------------------------------------------- point row ----

function PointRow({ point, byId }: { point: PathPoint; byId: Map<string, PathPoint> }) {
  const navigate = useNavigate();
  const locked = point.state === "locked";
  const blockers = (point.blocked_by ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is PathPoint => !!p);

  return (
    <li>
      <div
        className={cn(
          "group flex flex-col gap-2 rounded-lg border px-3 py-2.5 transition-colors sm:flex-row sm:items-center sm:gap-4",
          locked ? "border-border/60 bg-muted/30" : "border-border bg-background hover:border-primary/50",
        )}
      >
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => navigate(`/grammar/point/${encodeURIComponent(point.id)}`)}
            className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{point.sequence_index}</span>
              <span
                className={cn(
                  "text-[13px] font-medium",
                  locked ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {point.title}
              </span>
              {point.wild_failure && <Badge tone="warning">Came back wrong in a real answer</Badge>}
              {point.leech && !point.wild_failure && <Badge tone="warning">Keeps slipping</Badge>}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {point.grammar_name && <span>{point.grammar_name}</span>}
              <span>·</span>
              <span>{ROLE_LABEL[point.role as keyof typeof ROLE_LABEL] ?? point.role}</span>
              {point.estimated_minutes ? <span>· {point.estimated_minutes} min</span> : null}
              {point.cefr_level ? <span>· {point.cefr_level}</span> : null}
            </span>
          </button>

          {/* The prerequisite chips are their own buttons, beside the row button
              rather than inside it — a locked lesson has to say what it is
              waiting for AND let you go there, and interactive content cannot
              nest inside a button. */}
          {locked && blockers.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Needs:
              {blockers.map((blocker) => (
                <button
                  key={blocker.id}
                  type="button"
                  onClick={() => navigate(`/grammar/point/${encodeURIComponent(blocker.id)}`)}
                  className="rounded bg-muted px-1.5 py-0.5 text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {blocker.title}
                </button>
              ))}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:w-56">
          {point.state !== "locked" && point.stage > 0 && (
            <StageBar stage={point.stage} compact className="hidden sm:flex" />
          )}
          <StateBadge state={point.state} />
        </div>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ units ----

function UnitBlock({
  unit,
  points,
  byId,
  defaultOpen,
}: {
  unit: PathUnit;
  points: PathPoint[];
  byId: Map<string, PathPoint>;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const mastered = points.filter((p) => p.state === "mastered").length;
  const touched = points.filter((p) => p.state !== "locked" && p.state !== "next").length;

  if (points.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background rounded-xl"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{unit.title}</span>
          {unit.summary && (
            <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
              {unit.summary}
            </span>
          )}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {touched}/{points.length} started
          {mastered > 0 ? ` · ${mastered} mastered` : ""}
        </span>
      </button>
      {open && (
        <ul className="space-y-1.5 px-3 pb-3">
          {points.map((point) => (
            <PointRow key={point.id} point={point} byId={byId} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ----------------------------------------------------------------- screen ----

export function PathScreen() {
  const path = useGrammarStore((s) => s.path);
  const loading = useGrammarStore((s) => s.pathLoading);
  const error = useGrammarStore((s) => s.pathError);
  const loadPath = useGrammarStore((s) => s.loadPath);
  const [filter, setFilter] = useState("");

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

  const needle = filter.trim().toLowerCase();
  const matches = (point: PathPoint) =>
    !needle ||
    point.title.toLowerCase().includes(needle) ||
    (point.grammar_name ?? "").toLowerCase().includes(needle);

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

  const summary = path?.summary;
  const firstOpenUnit = units.find((unit) =>
    unitPoints(unit, byId).some((point) => OPEN_STATES.has(point.state)),
  );

  return (
    <div className="space-y-5 pb-10">
      <StartCard />

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Lessons in the path", value: summary.total_points },
            { label: "Started", value: summary.started },
            { label: "Practised", value: summary.practised },
            { label: "Mastered", value: summary.mastered },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-lg font-semibold tabular-nums text-foreground">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a lesson — “passive”, “if”, “articles”"
            aria-label="Find a lesson"
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-3">
        {units.map((unit) => {
          const points = unitPoints(unit, byId).filter(matches);
          return (
            <UnitBlock
              key={unit.unit_id}
              unit={unit}
              points={points}
              byId={byId}
              defaultOpen={!!needle || unit.unit_id === firstOpenUnit?.unit_id}
            />
          );
        })}
      </div>

      <section className="rounded-xl border border-border bg-muted/40 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Target className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Two things worth knowing before you start
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Some of these — the `-s` on he/she/it, the articles, the past endings — will keep coming out
          wrong for months after you have learned them. That is not you failing and it is not this
          module failing. Teaching moves how often you get them right; it does not change the order in
          which they become automatic.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          And a lesson is not finished when you have read it. “Practised” means you can build it and
          choose it. “Mastered” means you have used it correctly in your own writing or speaking, weeks
          after you first met it. That gap is the honest shape of learning a language.
        </p>
      </section>
    </div>
  );
}

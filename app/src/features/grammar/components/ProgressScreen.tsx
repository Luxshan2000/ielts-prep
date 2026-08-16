/**
 * Progress — and the headline is not a percentage.
 *
 * "Grammar 68%" tells an adult with an exam date nothing they can act on. What
 * they can act on is *which mistakes are costing them marks right now*, each one
 * a button that builds a drill from every lesson that carries it — a far better
 * selector than "the present perfect unit", because a learner's problem is rarely
 * confined to one unit (DESIGN §6 F4).
 *
 * The second number is the one that keeps people going: **the codes that have
 * gone quiet.** *"Comma splices: seven in your first week, none in the last
 * two."* That is a true statement about the learner's competence, and it is worth
 * more than any streak counter.
 *
 * The third section is what makes this personal rather than generic: the mistakes
 * that came back from the learner's own writing and speaking. When the skills
 * modules cannot yet emit codes, that section says so plainly instead of showing
 * an empty box (DESIGN D6 — the module must be fully usable without it).
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ActivitySquare,
  ArrowRight,
  Ear,
  FileText,
  Mic,
  MoveDown,
  PenLine,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { codeLabel, familyLabel, stageName } from "../labels";
import { useGrammarStore } from "../store";
import type { ErrorCodeStat, HarvestedError, RangeStructure } from "../types";
import { Section } from "./primitives";

const MODULE_ICON: Record<string, typeof PenLine> = {
  writing: PenLine,
  speaking: Mic,
  reading: FileText,
  listening: Ear,
};

const RANGE_TONE: Record<RangeStructure["state"], string> = {
  unmet: "border-border bg-muted/40 text-muted-foreground",
  learning: "border-warning/40 bg-warning/8 text-foreground",
  controlled: "border-primary/40 bg-primary/8 text-foreground",
  mastered: "border-success/40 bg-success/12 text-foreground",
};

const RANGE_LABEL: Record<RangeStructure["state"], string> = {
  unmet: "not met yet",
  learning: "learning it",
  controlled: "can use it",
  mastered: "reliable",
};

// ------------------------------------------------------------ code lines ----

function CostingRow({ stat }: { stat: ErrorCodeStat }) {
  const navigate = useNavigate();
  const blocked = !!stat.blocked_by_point_id;

  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground">{codeLabel(stat.code)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {familyLabel(stat.code)} · {stat.count} {stat.count === 1 ? "time" : "times"}
            {stat.from_skills ? ` · ${stat.from_skills} in a real answer` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {stat.point_id && !blocked && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/grammar/point/${encodeURIComponent(stat.point_id ?? "")}`)}
            >
              The lesson
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => navigate(`/grammar/practice?code=${encodeURIComponent(stat.code)}`)}
            disabled={stat.drillable === 0}
          >
            Drill it
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {blocked && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          This comes from{" "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2"
            onClick={() => navigate(`/grammar/point/${encodeURIComponent(stat.blocked_by_point_id ?? "")}`)}
          >
            {stat.blocked_by_title ?? "an earlier lesson"}
          </button>
          , which you have not done yet. Do that one and this stops happening on its own.
        </p>
      )}
    </li>
  );
}

function QuietRow({ stat }: { stat: ErrorCodeStat }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/8 p-3">
      <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{codeLabel(stat.code)}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {stat.was ?? 0} earlier, {stat.count} since. That is a real change in what you can do.
        </p>
      </div>
    </li>
  );
}

function HarvestRow({ error }: { error: HarvestedError }) {
  const navigate = useNavigate();
  const Icon = MODULE_ICON[error.module] ?? FileText;
  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        error.wild_failure ? "border-warning/40 bg-warning/8" : "border-border bg-background",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-[13px] font-medium text-foreground">{codeLabel(error.code)}</span>
        <Badge tone="outline">from your {error.module}</Badge>
        {error.wild_failure && <Badge tone="warning">You had this one, then it slipped back</Badge>}
      </div>
      {error.learner_text && (
        <p className="mt-2 rounded bg-muted px-2 py-1 text-[13px] italic leading-relaxed text-muted-foreground">
          “{error.learner_text}”
        </p>
      )}
      {error.fixed_text && (
        <p className="mt-1 rounded bg-success/12 px-2 py-1 text-[13px] leading-relaxed text-foreground">
          {error.fixed_text}
        </p>
      )}
      {error.point_id && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => navigate(`/grammar/point/${encodeURIComponent(error.point_id ?? "")}`)}
        >
          {error.point_title ?? "The lesson that fixes it"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- screen ----

export function ProgressScreen() {
  const navigate = useNavigate();
  const progress = useGrammarStore((s) => s.progress);
  const loading = useGrammarStore((s) => s.progressLoading);
  const error = useGrammarStore((s) => s.progressError);
  const loadProgress = useGrammarStore((s) => s.loadProgress);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  if (loading && !progress) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <ErrorState error={error} title="Your progress could not be loaded" onRetry={() => void loadProgress()} />;
  }

  if (!progress) return null;

  const costing = progress.costing ?? [];
  const quiet = progress.quiet ?? [];
  const shaky = progress.shaky ?? [];
  const solid = progress.solid ?? [];
  const harvested = progress.harvested ?? [];
  const range = progress.range ?? [];
  const nothingYet = costing.length === 0 && quiet.length === 0 && shaky.length === 0 && solid.length === 0;

  if (nothingYet) {
    return (
      <EmptyState
        icon={ActivitySquare}
        title="Nothing to report yet"
        description="Do one lesson and one practice set. From then on this screen shows the mistakes that are actually costing you marks, and the ones that have stopped happening."
        action={<Button onClick={() => navigate("/grammar")}>Open the path</Button>}
      />
    );
  }

  return (
    <div className="space-y-5 pb-10">
      {costing.length > 0 && (
        <Section
          title={`${costing.length} ${costing.length === 1 ? "mistake is" : "mistakes are"} costing you`}
          hint="Each one builds a set from every lesson that carries it, not only the lesson it came from."
          emphasis
        >
          <ul className="space-y-2">
            {costing.map((stat) => (
              <CostingRow key={stat.code} stat={stat} />
            ))}
          </ul>
        </Section>
      )}

      {quiet.length > 0 && (
        <Section title="These have gone quiet" hint="Mistakes you used to make and have stopped making.">
          <ul className="space-y-2">
            {quiet.map((stat) => (
              <QuietRow key={stat.code} stat={stat} />
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="From your own writing and speaking"
        hint="The mistakes you made in a real answer, and the lesson each one points at."
      >
        {harvested.length > 0 ? (
          <ul className="space-y-2">
            {harvested.map((item) => (
              <HarvestRow key={item.id} error={item} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {progress.harvest_available === false
              ? "Nothing has arrived here yet. When the writing and speaking feedback starts naming the mistakes it finds, they will land here, with your own sentence, the fix, and one tap into the lesson that stops it happening again."
              : "Nothing from your own answers yet. Write a Task 2 or record a Part 3 answer and the mistakes it finds will show up here."}
          </p>
        )}
      </Section>

      {(shaky.length > 0 || solid.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Shaky" hint="Met, not held. These come back sooner than the rest.">
            {shaky.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing is slipping right now.</p>
            ) : (
              <ul className="space-y-1.5">
                {shaky.map((point) => (
                  <li key={point.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/grammar/point/${encodeURIComponent(point.id)}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1 text-[13px] text-foreground">{point.title}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {point.wild_failure && <MoveDown className="h-3.5 w-3.5 text-warning" aria-hidden="true" />}
                        <span className="text-[11px] text-muted-foreground">{stageName(point.stage)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Solid" hint="Built, chosen and used. These look after themselves now.">
            {solid.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nothing here yet. A point lands here after you have used it correctly in your own words.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {solid.map((point) => (
                  <li key={point.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/grammar/point/${encodeURIComponent(point.id)}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1 text-[13px] text-foreground">{point.title}</span>
                      {point.mastered && <Sparkles className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {range.length > 0 && (
        <Section
          title="Your range"
          hint="The structures you can reach for. Band 7 asks for more clean complex sentences, not for fewer mistakes."
        >
          <div className="flex flex-wrap gap-2">
            {range.map((structure) => (
              <button
                key={structure.slug}
                type="button"
                disabled={!structure.point_id}
                onClick={() =>
                  structure.point_id && navigate(`/grammar/point/${encodeURIComponent(structure.point_id)}`)
                }
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  RANGE_TONE[structure.state],
                  structure.point_id && "hover:border-primary/60",
                )}
              >
                <span className="block font-medium">{structure.label}</span>
                <span className="block text-[11px] opacity-80">{RANGE_LABEL[structure.state]}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            A learner who believes band 7 means “no mistakes” writes short, safe sentences and lands at
            6, because range is marked too. The useful move is to use more of these, cleanly, rather
            than fewer of them.
          </p>
        </Section>
      )}
    </div>
  );
}

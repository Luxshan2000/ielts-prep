/**
 * "The map" tab — what to do with this passage in the first two minutes.
 *
 * Two shapes, because two kinds of text want two different first passes. An
 * Academic passage (and a General Training Section 3) wants a paragraph map: a
 * four-word label per paragraph, written before any question is read. A GT Section
 * 1 or 2 wants nothing of the sort — those texts have visible structure and their
 * marks are lost to answer-form errors, so the surface becomes a checklist of the
 * fields the questions will turn on.
 *
 * The learner writes their labels first and the authored map is revealed only
 * afterwards. The comparison is the teaching; a map read before it is written is
 * somebody else's summary.
 */

import { useEffect, useMemo, useState } from "react";
import { Clock, Compass, Gauge, Map as MapIcon, RotateCcw } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { Callout, LocateButton, SectionHead } from "./primitives";
import { LEVERS } from "./labels";
import { mapKey, useCoachStore } from "./store";
import type { CoachPassage, PassageTeaching } from "./types";

const MAX_LABEL_WORDS = 4;

/** Trim a label to four words — the cap is what makes it a label, not a summary. */
function capWords(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= MAX_LABEL_WORDS) return value.replace(/\s{2,}/g, " ").trimStart();
  return words.slice(0, MAX_LABEL_WORDS).join(" ");
}

function countWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

export interface MapPanelProps {
  passageId: string;
  passage: CoachPassage;
  teaching: PassageTeaching | null;
  onLocate: (paragraphId: string, quote?: string | null) => void;
}

export function MapPanel({ passageId, passage, teaching, onLocate }: MapPanelProps) {
  const drafts = useCoachStore((s) => s.mapDrafts);
  const revealed = useCoachStore((s) => s.mapRevealed[passageId] ?? false);
  const setMapLabel = useCoachStore((s) => s.setMapLabel);
  const revealMap = useCoachStore((s) => s.revealMap);
  const resetMap = useCoachStore((s) => s.resetMap);

  const paragraphIds = useMemo(() => {
    const out: string[] = [];
    for (const block of passage.texts ?? []) {
      for (const para of block.paragraphs ?? []) out.push(String(para.id));
    }
    return out;
  }, [passage]);

  const plan = teaching?.skim_plan ?? null;
  const budget = Math.max(0, Number(plan?.budget_s ?? 0));
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((value) => (value === null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // The clock stops itself at zero; the boxes lock and the questions are next.
  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  // Moving to a different passage starts the exercise over.
  useEffect(() => {
    setRemaining(null);
    setRunning(false);
  }, [passageId]);

  const locked = remaining === 0;
  const isFieldScan = (plan?.kind ?? "") === "field_scan";

  if (!plan) {
    return (
      <EmptyState
        icon={MapIcon}
        title="This passage has no skim plan"
        description="The two-minute map is authored per passage. Passages from an older content pack carry the text and the questions but not the plan for reading them."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
            Before the questions
            {teaching?.time_budget_min ? (
              <Badge tone="outline">{teaching.time_budget_min} min for this passage</Badge>
            ) : null}
            {budget > 0 && <Badge tone="default">{budget}s for the first pass</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Read first
              </p>
              <p className="mt-1 text-[13px] leading-6 text-foreground">{plan.read_first}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Do not read yet
              </p>
              <p className="mt-1 text-[13px] leading-6 text-foreground">{plan.skip}</p>
            </div>
          </div>

          {budget > 0 && !isFieldScan && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant={running ? "outline" : "primary"}
                onClick={() => {
                  if (running) {
                    setRunning(false);
                    return;
                  }
                  setRemaining(budget);
                  setRunning(true);
                }}
              >
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {running ? "Stop the clock" : remaining === null ? "Start the clock" : "Restart"}
              </Button>
              {remaining !== null && (
                <span
                  role="timer"
                  aria-live="off"
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[13px] tabular",
                    locked
                      ? "border-warning/50 bg-warning/10 text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {locked ? "Time — boxes locked" : formatDuration(remaining)}
                </span>
              )}
              <span className="text-[12px] text-muted-foreground">
                Four words per paragraph. A label, not a summary.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {isFieldScan ? (
        <FieldScan fields={plan.fields ?? []} />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Your paragraph map</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {paragraphIds.map((paragraphId) => {
                const authored = (plan.map ?? []).find(
                  (row) => String(row.paragraph) === paragraphId,
                );
                const value = drafts[mapKey(passageId, paragraphId)] ?? "";
                const words = countWords(value);
                return (
                  <li key={paragraphId} className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLocate(paragraphId)}
                      aria-label={`Show paragraph ${paragraphId} in the passage`}
                      className={cn(
                        "h-7 w-7 shrink-0 rounded-md border border-border text-[13px] font-bold tabular",
                        "text-primary transition-colors hover:bg-accent",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      {paragraphId}
                    </button>
                    <input
                      type="text"
                      value={value}
                      disabled={locked}
                      aria-label={`Your label for paragraph ${paragraphId}`}
                      placeholder="what this paragraph does"
                      onChange={(event) =>
                        setMapLabel(passageId, paragraphId, capWords(event.target.value))
                      }
                      className={cn(
                        "min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5",
                        "text-[13px] text-foreground placeholder:text-muted-foreground/60",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:opacity-60",
                      )}
                    />
                    <span
                      className={cn(
                        "w-10 shrink-0 text-right text-[11px] tabular",
                        words >= MAX_LABEL_WORDS ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      {words}/{MAX_LABEL_WORDS}
                    </span>
                    {revealed && (
                      <span className="w-full pl-9 text-[12px] leading-5 sm:w-auto sm:pl-0">
                        <span className="text-muted-foreground">pack: </span>
                        <span className="font-medium text-foreground">
                          {authored?.label ?? "—"}
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              {!revealed ? (
                <Button size="sm" onClick={() => revealMap(passageId)}>
                  Compare with the pack's map
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resetMap(passageId, paragraphIds)}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear and try again
                </Button>
              )}
              <span className="text-[12px] text-muted-foreground">
                {revealed
                  ? "Where the two differ, read that paragraph again and decide which label survives."
                  : "Write yours first — a map you read instead of writing is somebody else's."}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <DifficultyCard teaching={teaching} onLocate={onLocate} />
    </div>
  );
}

function FieldScan({ fields }: { fields: string[] }) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>What to hunt for</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Callout tone="teach">
          Do not draw a paragraph map here. This text already shows you its structure; the marks go
          instead to the details — dates, prices, who qualifies, what is excluded. Find the fields
          below before you read a single question.
        </Callout>
        <ul className="grid gap-2 sm:grid-cols-2">
          {fields.map((field) => (
            <li key={field}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-[13px] hover:bg-accent">
                <input
                  type="checkbox"
                  checked={ticked[field] ?? false}
                  onChange={(event) =>
                    setTicked((prev) => ({ ...prev, [field]: event.target.checked }))
                  }
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className={cn(ticked[field] && "text-muted-foreground line-through")}>
                  {field}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DifficultyCard({
  teaching,
  onLocate,
}: {
  teaching: PassageTeaching | null;
  onLocate: (paragraphId: string, quote?: string | null) => void;
}) {
  const rationale = teaching?.difficulty_rationale ?? null;
  const metrics = teaching?.metrics ?? null;
  if (!rationale && !metrics) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
          Why this passage is as hard as it is
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rationale && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {(rationale.levers ?? []).map((lever) => (
                <Badge key={lever} tone="outline">
                  {LEVERS[lever] ?? lever}
                </Badge>
              ))}
            </div>
            {rationale.note && (
              <p className="text-[13px] leading-6 text-muted-foreground">{rationale.note}</p>
            )}
            {rationale.hardest_paragraph && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/8 p-3">
                <span className="text-[13px] leading-6 text-foreground">
                  <span className="font-semibold">Hardest paragraph: {rationale.hardest_paragraph}.</span>{" "}
                  {rationale.why_hardest}
                </span>
                <LocateButton
                  label="Read it again"
                  paragraph={rationale.hardest_paragraph}
                  onLocate={() => onLocate(String(rationale.hardest_paragraph))}
                />
              </div>
            )}
          </>
        )}

        {metrics && (
          <div className="space-y-2">
            <SectionHead
              title="Measured"
              hint="Difficulty is a property of the text, not an opinion about it."
            />
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Academic words" value={metrics.awl_pct} suffix="%" />
              <Metric label="Mean sentence" value={metrics.mean_sentence_length} suffix=" words" />
              <Metric label="Longest sentence" value={metrics.longest_sentence} suffix=" words" />
              <Metric label="Attributed opinions" value={metrics.attributed_opinions} />
            </dl>
            {metrics.abstraction && (
              <p className="text-[12px] text-muted-foreground">
                The subject matter is{" "}
                <span className="font-medium text-foreground">{metrics.abstraction}</span>
                {metrics.abstraction === "contested"
                  ? " — expect the writer to take a position, which is what Yes/No/Not Given tests."
                  : metrics.abstraction === "process"
                    ? " — expect stages and sequence rather than opinion."
                    : " — expect facts and figures rather than argument."}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | null | undefined;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular text-foreground">
        {value === null || value === undefined ? "—" : `${value}${suffix}`}
      </dd>
    </div>
  );
}

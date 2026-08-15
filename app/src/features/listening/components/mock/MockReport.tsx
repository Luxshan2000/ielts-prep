/**
 * `/listening/mock/report/:mockId` — the loop from testing back into learning.
 *
 * **Raw score leads and the band follows**, in that order, because the middle of the
 * listening table is a swamp: 18 to 22 is a single five-mark-wide band 5.5. A learner who
 * goes from 19 to 22 has improved by fifteen per cent, and a band-first report tells them
 * nothing happened. Above 30 the bands are two marks wide, so the top is a cliff and the
 * same one-mark change means something completely different there.
 *
 * Then the splits, in the order that makes them usable rather than the order that makes
 * them easy to compute:
 *
 *   per part — because "Parts 3 and 4 are the hard ones" is not a diagnosis. Part 3
 *     punishes losing track of who thinks what; Part 4 punishes losing your place, and
 *     those need completely different practice;
 *   per type — weakest first, since that is the one to drill;
 *   form against comprehension — kept apart on purpose. A misspelt answer was *heard*.
 *     It needs three weeks of orthography, not six months of listening, and folding it
 *     into "wrong" sends the learner to redo a skill they already have;
 *   cascades — the best analytic the module has. One miss that took the next two with it
 *     is not three comprehension failures, it is one miss plus a failure to rejoin.
 *
 * It ends in the coach, on the four parts just sat, whose transcripts are open *because*
 * the paper was sat.
 */

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  GraduationCap,
  LayoutList,
  SpellCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import { accentLabel } from "../../labels";
import { BAND_NOTE, PART_DIAGNOSIS } from "./script";
import { useMockStore, type MockReportDoc } from "./store";

export function MockReport() {
  const { attemptId: mockId = "" } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const session = useMockStore((s) => s.session);
  const report = useMockStore((s) => s.report);
  const loading = useMockStore((s) => s.loading);
  const error = useMockStore((s) => s.error);
  const load = useMockStore((s) => s.load);

  useEffect(() => {
    if (session?.mock_id !== mockId) void load(mockId);
  }, [load, mockId, session?.mock_id]);

  const doc: MockReportDoc | null = report ?? session?.report ?? null;

  if (loading && !doc) {
    return (
      <PageShell
        title="Mock listening report"
        description="Collecting the marked paper."
        back={{ to: "/listening", label: "Listening" }}
      >
        <SkeletonCard lines={6} />
      </PageShell>
    );
  }

  if (error || !doc) {
    return (
      <PageShell
        title="Mock listening report"
        back={{ to: "/listening/mock", label: "the mock room" }}
      >
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={AlertTriangle}
              title="No report for this sitting"
              description={
                error ??
                "This paper has not been marked. An abandoned sitting is never marked, because a partial paper does not measure anything."
              }
              action={
                <Button onClick={() => navigate("/listening/mock")}>Back to the mock room</Button>
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const score = doc.score;
  const form = doc.answer_form ?? { marks_lost_to_form: 0 };
  const cascades = doc.cascades ?? { count: 0 };
  const weakest = doc.per_type?.[0] ?? null;

  return (
    <PageShell
      maxWidth="max-w-5xl"
      title={doc.title}
      description={doc.modelled}
      back={{ to: "/listening", label: "Listening" }}
      actions={
        <Button variant="outline" size="sm" onClick={() => navigate("/listening/mock")}>
          Sit another
        </Button>
      }
    >
      <div className="space-y-5">
        {doc.auto_submitted && (
          <p className="rounded-xl border border-warning/40 bg-warning/8 p-3 text-[13px] leading-6 text-muted-foreground">
            The clock ran out and the paper was submitted as it stood. That is what happens in the
            room too — the window does not wait.
          </p>
        )}

        {/* ------------------------------------------------------- the score --- */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Raw score
                </p>
                <p className="text-4xl font-semibold tabular-nums">
                  {score.raw_score}
                  <span className="text-xl text-muted-foreground">/{score.total_questions}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Band{score.band_is_estimate ? " (estimate)" : ""}
                </p>
                <p className="text-2xl font-semibold tabular-nums text-muted-foreground">
                  {score.band ?? "—"}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{score.note}</p>
            <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
              {score.one_table_note}
            </p>
            {score.band_is_estimate && (
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                This paper was short of forty questions, so the band is projected
                {score.projected_raw_40 !== null
                  ? ` from a projected ${score.projected_raw_40}/40`
                  : ""}{" "}
                and is an estimate rather than a conversion.
              </p>
            )}
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- per part --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutList className="h-4 w-4 text-primary" aria-hidden="true" />
              Part by part
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {doc.per_part.map((part) => (
                <li
                  key={part.script_id}
                  className="space-y-1.5 rounded-xl border border-border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">
                      Part {part.part} — {part.title}
                    </span>
                    <span className="flex items-center gap-2">
                      {part.accent_set && (
                        <Badge tone="outline">{accentLabel(part.accent_set)}</Badge>
                      )}
                      <span className="text-[13px] font-semibold tabular-nums">
                        {part.correct}/{part.total}
                      </span>
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={part.total}
                    aria-valuenow={part.correct}
                    aria-label={`Part ${part.part}: ${part.correct} of ${part.total} correct`}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full",
                        (part.pct ?? 0) >= 70 ? "bg-success" : "bg-warning",
                      )}
                      style={{ width: `${part.pct ?? 0}%` }}
                    />
                  </div>
                  <p className="text-[12px] leading-5 text-muted-foreground">
                    {PART_DIAGNOSIS[part.part] ?? ""}
                  </p>
                  {part.played === 0 && (
                    <p className="text-[12px] font-medium text-warning">
                      This part was never played, so its questions were answered blind.
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[12px] leading-5 text-muted-foreground">{doc.per_part_note}</p>
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- per type --- */}
        {doc.per_type.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" aria-hidden="true" />
                By question type — weakest first
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {doc.per_type.map((type) => (
                  <li key={type.qtype} className="space-y-1 rounded-lg border border-border p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13px] font-medium">{type.label}</span>
                      <span className="text-[13px] font-semibold tabular-nums">
                        {type.correct}/{type.total}
                      </span>
                    </div>
                    {type.rule && (
                      <p className="text-[12px] leading-5 text-muted-foreground">{type.rule}</p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------- form vs comprehension --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SpellCheck className="h-4 w-4 text-warning" aria-hidden="true" />
              Marks you heard and still lost
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-semibold tabular-nums">
              {form.marks_lost_to_form ?? 0}
              <span className="ml-2 text-[13px] font-normal text-muted-foreground">
                lost to spelling, plurals or the word limit
              </span>
            </p>
            <p className="text-[13px] leading-6 text-muted-foreground">
              {typeof form.note === "string"
                ? form.note
                : "These are form losses, not listening losses. You heard them. They need an answer-form fix and they are the cheapest marks on the paper to get back — three weeks of work, not six months."}
            </p>
            {Array.isArray(form.items) && form.items.length > 0 && (
              <ul className="space-y-1 pt-1">
                {form.items.map((item) => (
                  <li key={item.number} className="text-[13px]">
                    <span className="tabular-nums text-muted-foreground">Q{item.number}: </span>
                    <span className="text-warning line-through">{item.given}</span>
                    <span className="mx-1.5 text-muted-foreground">→</span>
                    <span className="font-medium text-success">{item.expected}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- cascades --- */}
        {(cascades.count ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-warning" aria-hidden="true" />
                Runs of misses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-[13px] leading-6 text-foreground">
                {cascades.count} place{cascades.count === 1 ? "" : "s"} where a miss took the next
                question with it.
              </p>
              {Array.isArray(cascades.runs) && cascades.runs.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {cascades.runs.map((run, index) => (
                    <li key={index}>
                      <Badge tone="warning">
                        Q{run.from}–{run.to}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[12px] leading-5 text-muted-foreground">
                {typeof cascades.note === "string"
                  ? cascades.note
                  : "A run is not three comprehension failures — it is one miss plus a failure to rejoin. The fix is recovery, not more listening: when a question goes past, let it go and re-anchor on the next printed heading."}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ----------------------------------------------------- next actions --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
              What to do next
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.isArray(doc.next_actions) && doc.next_actions.length > 0 && (
              <ul className="space-y-2">
                {doc.next_actions.slice(0, 3).map((action, index) => (
                  <li key={index} className="rounded-lg border border-border p-3">
                    <p className="text-[13px] font-semibold">
                      {action.title ?? action.label ?? "Next"}
                    </p>
                    {(action.detail ?? action.body) && (
                      <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                        {action.detail ?? action.body}
                      </p>
                    )}
                    {action.script_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() =>
                          navigate(
                            `/listening/coach/${encodeURIComponent(String(action.script_id))}`,
                          )
                        }
                      >
                        Open it in the coach
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-[13px] leading-6 text-muted-foreground">
                Submitting unlocked the transcript and the timeline on all four of these parts. The
                highest-value thing you can do now is replay the exact moments you lost — the coach
                plays the value the speaker withdrew and the value that counted, back to back.
              </p>
              <div className="flex flex-wrap gap-2">
                {doc.per_part.map((part) => (
                  <Button
                    key={part.script_id}
                    size="sm"
                    variant={part.pct !== null && part.pct < 70 ? "primary" : "outline"}
                    onClick={() =>
                      navigate(`/listening/coach/${encodeURIComponent(part.script_id)}`)
                    }
                  >
                    Part {part.part} — {part.correct}/{part.total}
                  </Button>
                ))}
              </div>
              {weakest && (
                <p className="text-[12px] leading-5 text-muted-foreground">
                  Start with {weakest.label.toLowerCase()} — it is where this paper cost you most.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-[12px] leading-5 text-muted-foreground">{BAND_NOTE}</p>
      </div>
    </PageShell>
  );
}

export default MockReport;

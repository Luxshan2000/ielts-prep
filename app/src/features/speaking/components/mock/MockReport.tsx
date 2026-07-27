/**
 * `/speaking/mock/report/:reportId` — the verdict on a whole sitting.
 *
 * This is the mock's own report, not a second copy of the practice report at
 * `/speaking/report/:id`. That screen is a microscope: every turn, every correction,
 * the audio, the vocabulary inbox. This one answers the four questions a candidate
 * has walking out of a test — what band, on what evidence, which part let me down,
 * and what do I do about it this week — and then hands them to the Topic Coach for
 * the cards they just sat. The microscope is one click away for anyone who wants it.
 *
 * Every number here was computed server-side (04 §6.4). The only thing derived in the
 * browser is *where* the evidence fell, and `analysis.ts` is careful about how far
 * that is allowed to go.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Info,
  RotateCcw,
  Volume2,
} from "lucide-react";
import {
  BandScore,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  SkeletonCard,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { ApiError } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";
import { BandTrend } from "../BandTrend";
import { CRITERIA, describeError, descriptorFor } from "../phases";
import {
  fetchReport,
  fetchTranscript,
  type SpeakingReport,
  type TranscriptTurn,
} from "../../store";
import { fetchSetOutline, type SetOutline } from "./api";
import { analyseSitting, nextActions } from "./analysis";
import { NextActions } from "./NextActions";
import { PartBreakdown } from "./PartBreakdown";
import { useMockStore } from "./store";

export function MockReport() {
  const { reportId = "" } = useParams<{ reportId: string }>();
  const navigate = useNavigate();

  const history = useMockStore((s) => s.history);
  const loadHistory = useMockStore((s) => s.loadHistory);

  const [report, setReport] = useState<SpeakingReport | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [outline, setOutline] = useState<SetOutline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  const load = useCallback(async () => {
    if (!reportId) {
      setError("No report id in the address.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const doc = await fetchReport(reportId);
      setReport(doc);
      setReveal(true);
      // Both are best-effort: the band and the criteria stand without them, and the
      // screen degrades to "no part breakdown" rather than to an error.
      const [fetchedTurns, fetchedSet] = await Promise.all([
        fetchTranscript(doc.session_id),
        doc.card_set_id ? fetchSetOutline(doc.card_set_id) : Promise.resolve(null),
      ]);
      setTurns(fetchedTurns);
      setOutline(fetchedSet);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "That mock report doesn't exist. It may have been deleted with its session."
          : describeError(err),
      );
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (history.length === 0) void loadHistory();
  }, [history.length, loadHistory]);

  const analysis = useMemo(
    () => (report ? analyseSitting(report, turns, outline?.cards ?? []) : null),
    [outline, report, turns],
  );

  const actions = useMemo(
    () =>
      report && analysis
        ? nextActions(report, analysis, report.card_set_id, outline?.title ?? null)
        : [],
    [analysis, outline, report],
  );

  // ------------------------------------------------------------------ states ---

  if (loading && report === null) {
    return (
      <PageShell title="Mock test report" description="Opening your assessment…">
        <div className="space-y-5">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-6 pt-5">
              <Skeleton className="h-20 w-20 rounded-2xl" />
              <div className="flex gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-14 rounded-xl" />
                ))}
              </div>
            </CardContent>
          </Card>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={5} />
        </div>
      </PageShell>
    );
  }

  if (error !== null || report === null || analysis === null) {
    return (
      <PageShell
        title="Mock test report"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("/speaking/mock")}>
            <ArrowLeft className="h-4 w-4" />
            Mock room
          </Button>
        }
      >
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={AlertTriangle}
              title="Report unavailable"
              description={error ?? "The report came back empty."}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => void load()}>Try again</Button>
                  <Button variant="outline" onClick={() => navigate("/speaking/mock/history")}>
                    Your past mocks
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const overall = report.overall_band;

  return (
    <PageShell
      title="Mock test report"
      description={[
        report.created_at ? formatDate(report.created_at) : null,
        report.duration_s ? formatDuration(report.duration_s) : null,
        outline?.title ?? null,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/speaking/mock")}>
            <RotateCcw className="h-4 w-4" />
            Take another
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* --------------------------------------------------- the verdict --- */}
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              {overall === null ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold">No overall band</p>
                  <p className="text-[13px] text-muted-foreground">
                    Too little of the test was completed to estimate a band.
                  </p>
                </div>
              ) : (
                <BandScore band={overall} size="lg" label="Whole test" reveal={reveal} />
              )}

              <div className="flex flex-wrap gap-3">
                {CRITERIA.map(({ key, short, label }) => {
                  const band = report.criteria[key]?.band ?? null;
                  return band === null ? (
                    <div
                      key={key}
                      className="flex min-w-[74px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-3 py-2"
                      title={`${label} was not assessed`}
                    >
                      <span className="text-sm font-semibold text-muted-foreground">—</span>
                      <span className="mt-0.5 text-[11px] text-muted-foreground">{short}</span>
                    </div>
                  ) : (
                    <BandScore key={key} band={band} size="sm" label={short} />
                  );
                })}
              </div>

              <BandTrend
                history={history}
                currentSessionId={report.session_id}
                className="ml-auto"
              />
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[13px] leading-6 text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {report.honesty_note}
            </p>

            {report.pronunciation_blind && (
              <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/8 p-3 text-[13px] leading-6 text-muted-foreground">
                <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                Pronunciation couldn't be assessed from this recording, so the whole-test band is
                the mean of the other three criteria only.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------ what each band means --- */}
        <Card>
          <CardHeader>
            <CardTitle>What the marking says</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              {CRITERIA.map(({ key, label }) => {
                const band = report.criteria[key]?.band ?? null;
                const descriptor = descriptorFor(key, band);
                return (
                  <div key={key} className="rounded-xl border border-border p-3.5">
                    <dt className="flex items-baseline justify-between gap-3 text-[13px] font-semibold">
                      {label}
                      <span className="tabular text-muted-foreground">
                        {band === null ? "not assessed" : `band ${band}`}
                      </span>
                    </dt>
                    <dd className="mt-1 text-[13px] leading-6 text-muted-foreground">
                      {descriptor ??
                        "No descriptor applies because this criterion wasn't assessed."}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-3 text-[12px] text-muted-foreground">
              Descriptors are our own paraphrase of the public criteria, written to be read
              quickly — not the official wording.
            </p>
          </CardContent>
        </Card>

        {/* ------------------------------------------------ part by part --- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Part by part</h2>
          <PartBreakdown analysis={analysis} />
        </section>

        {/* -------------------------------------------------- what to do --- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">What to do next</h2>
          <NextActions
            actions={actions}
            cards={outline?.cards ?? []}
            setId={report.card_set_id}
            setTitle={outline?.title ?? null}
          />
        </section>

        {/* ------------------------------------------------------ the rest --- */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Every turn, with the audio</p>
              <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                The full report has the annotated transcript, each answer's recording, the
                fluency metrics behind these numbers, and the vocabulary the examiner picked out.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/speaking/report/${encodeURIComponent(report.report_id)}`)}
              >
                <FileText className="h-4 w-4" />
                Open the full report
              </Button>
              <Button variant="ghost" onClick={() => navigate("/speaking/mock/history")}>
                Past mocks
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="pb-2 text-[11px] text-muted-foreground">
          Report {report.report_id}
          {report.model_id ? ` · marked by ${report.model_id}` : ""}
          {report.prompt_version ? ` · prompt ${report.prompt_version}` : ""}
        </p>
      </div>
    </PageShell>
  );
}

export default MockReport;

/**
 * Speaking feedback report — `/speaking/report/:reportId` (04 §7, 12 §6.2 C).
 *
 * Every band on this screen was recomputed server-side from the criterion bands (R2-4);
 * the renderer only formats. The honesty note is fixed copy and is never hidden.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookmarkPlus,
  Info,
  ListChecks,
  Mic,
  Volume2,
} from "lucide-react";
import {
  BandScore,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  SkeletonCard,
  TabPanel,
  Tabs,
  type TabItem,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { ApiError } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BandTrend } from "./components/BandTrend";
import { CriterionAccordion } from "./components/CriterionAccordion";
import { FluencyStrip } from "./components/FluencyStrip";
import {
  ReportTranscript,
  type ReportTranscriptHandle,
} from "./components/ReportTranscript";
import { TurnAudio } from "./components/TurnAudio";
import { VocabSuggestions } from "./components/VocabSuggestions";
import { CRITERIA, activityLabel, describeError } from "./components/phases";
import {
  fetchReport,
  fetchTranscript,
  fetchTurnRecordings,
  useSpeakingStore,
  type SpeakingReport,
  type TranscriptTurn,
  type TurnRecording,
} from "./store";

type Tab = "transcript" | "moments" | "vocab";

export function FeedbackReport() {
  const { reportId = "" } = useParams<{ reportId: string }>();
  const navigate = useNavigate();

  const history = useSpeakingStore((s) => s.history);
  const loadHistory = useSpeakingStore((s) => s.loadHistory);

  const [report, setReport] = useState<SpeakingReport | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [recordings, setRecordings] = useState<TurnRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("transcript");
  const [reveal, setReveal] = useState(false);

  const transcriptRef = useRef<ReportTranscriptHandle>(null);

  // ------------------------------------------------------------------- load ---

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
      // Transcript and recordings are best-effort: the report stands without them.
      const [fetchedTurns, fetchedRecordings] = await Promise.all([
        fetchTranscript(doc.session_id),
        fetchTurnRecordings(doc.session_id),
      ]);
      setTurns(fetchedTurns);
      setRecordings(fetchedRecordings);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "That report doesn't exist. It may have been deleted with its session."
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

  // ------------------------------------------------------------------ derive ---

  const onQuote = useCallback((quote: string) => {
    setTab("transcript");
    // Let the panel mount before asking it to scroll.
    window.setTimeout(() => transcriptRef.current?.revealQuote(quote), 30);
  }, []);

  const tabs = useMemo<TabItem<Tab>[]>(
    () => [
      { value: "transcript", label: "Transcript" },
      { value: "moments", label: "Best moments", badge: report?.best_moments.length ?? 0 },
      { value: "vocab", label: "Vocabulary", badge: report?.vocab_to_bank.length ?? 0 },
    ],
    [report?.best_moments.length, report?.vocab_to_bank.length],
  );

  // ------------------------------------------------------------------ states ---

  if (loading && report === null) {
    return (
      <PageShell title="Speaking report" description="Loading your assessment…">
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
          <SkeletonCard lines={6} />
        </div>
      </PageShell>
    );
  }

  if (error !== null || report === null) {
    return (
      <PageShell
        title="Speaking report"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("/speaking")}>
            <ArrowLeft className="h-4 w-4" />
            Speaking
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
                  <Button variant="outline" onClick={() => navigate("/speaking")}>
                    Back to Speaking
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
  const label = activityLabel(report.activity ?? report.mode);

  return (
    <PageShell
      title={`Speaking: ${label}`}
      description={[
        report.created_at ? formatDate(report.created_at) : null,
        report.duration_s ? formatDuration(report.duration_s) : null,
        report.model_id ? `marked by ${report.model_id}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/speaking")}>
            <Mic className="h-4 w-4" />
            Practise again
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ---------------------------------------------------------- bands --- */}
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-4">
                {overall === null ? (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">No overall band</p>
                    <p className="text-[13px] text-muted-foreground">
                      Not enough of the test was completed to estimate a band.
                    </p>
                  </div>
                ) : (
                  <BandScore band={overall} size="lg" label="Overall" reveal={reveal} />
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {CRITERIA.map(({ key, short, label: full }) => {
                  const band = report.criteria[key]?.band ?? null;
                  return band === null ? (
                    <div
                      key={key}
                      className="flex min-w-[74px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-3 py-2"
                      title={`${full} was not assessed`}
                    >
                      <span className="text-sm font-semibold text-muted-foreground">-</span>
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

            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[13px] text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {report.honesty_note}
            </p>

            {report.pronunciation_blind && (
              <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/8 p-3 text-[13px] text-muted-foreground">
                <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                Pronunciation couldn't be assessed from this recording, so the overall band is
                the mean of the other three criteria.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------- fluency metrics --- */}
        <Card>
          <CardHeader>
            <CardTitle>How you sounded</CardTitle>
          </CardHeader>
          <CardContent>
            <FluencyStrip metrics={report.metrics} />
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- the criteria --- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">The four criteria</h2>
          <CriterionAccordion
            criteria={report.criteria}
            unanchored={report.unanchored}
            onQuote={turns.length > 0 ? onQuote : undefined}
            pronunciationBlind={report.pronunciation_blind}
          />
        </section>

        {/* ------------------------------------------------- tabs of details --- */}
        <section>
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={tabs}
            aria-label="Report sections"
          />

          <TabPanel value="transcript" active={tab === "transcript"}>
            <ReportTranscript
              ref={transcriptRef}
              sessionId={report.session_id}
              turns={turns}
              errors={report.errors}
            />
            {turns.length === 0 && (
              <>
                <ErrorList errors={report.errors} />
                <RecordingList sessionId={report.session_id} recordings={recordings} />
              </>
            )}
          </TabPanel>

          <TabPanel value="moments" active={tab === "moments"}>
            {report.best_moments.length === 0 ? (
              <EmptyState
                icon={Award}
                title="No highlights recorded"
                description="The examiner didn't single out any moments in this session."
              />
            ) : (
              <ul className="space-y-2">
                {report.best_moments.map((moment, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <Award
                      className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--band-good))]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="text-[14px] leading-6">“{moment}”</p>
                      {turns.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onQuote(moment)}
                          className="-ml-3"
                        >
                          Show in transcript
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabPanel>

          <TabPanel value="vocab" active={tab === "vocab"}>
            <VocabSuggestions sessionId={report.session_id} items={report.vocab_to_bank} />
          </TabPanel>
        </section>

        <p className="pb-2 text-[11px] text-muted-foreground">
          Report {report.report_id}
          {report.prompt_version ? ` · prompt ${report.prompt_version}` : ""}
        </p>
      </div>
    </PageShell>
  );
}

/** Quote-level error cards, used when no turn-by-turn transcript is available. */
function ErrorList({ errors }: { errors: SpeakingReport["errors"] }) {
  if (errors.length === 0) return null;
  return (
    <section className="mt-4 space-y-2">
      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
        Things to fix ({errors.length})
      </h3>
      <ul className="space-y-2">
        {errors.map((error, i) => (
          <li key={i} className="rounded-xl border border-border bg-card p-3.5">
            <p
              className={cn(
                "text-[14px] leading-6",
                "underline decoration-destructive decoration-dashed decoration-2 underline-offset-4",
              )}
            >
              “{error.quote}”
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{error.issue}</p>
            {error.better && (
              <p className="mt-1 text-[13px] text-success">Better: {error.better}</p>
            )}
            {error.anchored === false && (
              <Badge tone="outline" className="mt-2">
                Not found verbatim in your speech
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Audio-only replay list from the recorder manifest, when the transcript is missing. */
function RecordingList({
  sessionId,
  recordings,
}: {
  sessionId: string;
  recordings: TurnRecording[];
}) {
  if (recordings.length === 0) return null;
  return (
    <section className="mt-4 space-y-2">
      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
        Your recordings ({recordings.length})
      </h3>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {recordings.map((turn) => (
          <li key={turn.turn_index} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="text-[13px] font-medium">Turn {turn.turn_index}</span>
            {typeof turn.duration_ms === "number" && (
              <span className="tabular text-[12px] text-muted-foreground">
                {formatDuration(turn.duration_ms / 1000)}
              </span>
            )}
            <TurnAudio
              sessionId={sessionId}
              audioFile={turn.file}
              label="Play"
              className="ml-auto"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default FeedbackReport;

/**
 * `/listening/mock` — the screen that decides whether the mock is taken seriously.
 *
 * It states what is about to happen, states plainly what will not be available, and then
 * offers one button. The temptation is to reassure — "it's only practice" — which is
 * exactly how you get a paper that was half-sat and a report nobody believes.
 *
 * Two things earn their prominence here.
 *
 * The first is that **the audio is synthesized on this machine and must be finished
 * before the clock starts.** A mock that stalls in the middle of Part 3 to render Part 4
 * is teaching the learner to tolerate a pause the exam never gives them, so the sitting
 * opens at `preparing`, the server refuses `start` with a 409 until all four parts exist,
 * and this screen shows what is actually happening: parts ready out of four, the render
 * job's own percentage, and which part is being worked on. Rendering four recordings takes
 * long enough to notice, and a spinner in place of that is a lie the learner pays for by
 * closing the laptop.
 *
 * The second is the choice between the computer and paper windows at the end, because
 * candidates who expect ten extra minutes and get two lose real marks to the surprise.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Headphones,
  Info,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Select,
  SkeletonCard,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { formatDuration } from "@/lib/format";
import { useSessionStore } from "@/stores";
import { BAND_NOTE, CONDITIONS, DELIVERY_OPTIONS, type Delivery } from "./script";
import { RENDER_POLL_MS, useMockStore } from "./store";

export function MockPreflight() {
  const navigate = useNavigate();
  const offline = useSessionStore((s) => s.offline);

  const delivery = useMockStore((s) => s.delivery);
  const setDelivery = useMockStore((s) => s.setDelivery);
  const plan = useMockStore((s) => s.plan);
  const planError = useMockStore((s) => s.planError);
  const loadPlan = useMockStore((s) => s.loadPlan);
  const history = useMockStore((s) => s.history);
  const loadHistory = useMockStore((s) => s.loadHistory);
  const session = useMockStore((s) => s.session);
  const load = useMockStore((s) => s.load);
  const create = useMockStore((s) => s.create);
  const creating = useMockStore((s) => s.creating);
  const createError = useMockStore((s) => s.createError);
  const start = useMockStore((s) => s.start);
  const starting = useMockStore((s) => s.starting);
  const startError = useMockStore((s) => s.startError);
  const abandon = useMockStore((s) => s.abandon);

  const [preparingId, setPreparingId] = useState<string | null>(null);

  useEffect(() => {
    void loadPlan(delivery);
    void loadHistory();
  }, [delivery, loadHistory, loadPlan]);

  /**
   * A sitting already open elsewhere in the ledger. Resuming it is the only honest
   * option: the clock has been running, and starting a second paper would silently
   * abandon the first.
   */
  const openRow = history?.items.find(
    (row) => row.status === "in_progress" || row.status === "ready" || row.status === "preparing",
  );

  // ------------------------------------------------------------ the render poll ---
  // Poll only while the sitting we opened is still short of its four recordings.
  useEffect(() => {
    if (!preparingId) return undefined;
    if (session && session.mock_id === preparingId && session.audio.ready) return undefined;
    const id = setInterval(() => void load(preparingId, { quiet: true }), RENDER_POLL_MS);
    return () => clearInterval(id);
  }, [load, preparingId, session]);

  const onOpen = useCallback(async () => {
    const mockId = await create();
    if (mockId) setPreparingId(mockId);
  }, [create]);

  const onStart = useCallback(async () => {
    if (!preparingId) return;
    const ok = await start(preparingId);
    if (ok) navigate(`/listening/mock/sitting/${preparingId}`);
  }, [navigate, preparingId, start]);

  const preparing = session && preparingId === session.mock_id ? session : null;

  // -------------------------------------------------------------------- views ---

  if (offline) {
    return (
      <PageShell title="Mock listening paper" back={{ to: "/listening", label: "Listening" }}>
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={AlertTriangle}
              title="BandReady's local service isn't responding"
              description="A mock needs it to generate the audio, hold the clock and mark the paper. It may still be starting up — this screen picks up on its own once it answers."
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      maxWidth="max-w-4xl"
      title="Mock listening paper"
      description="Four parts, forty questions, one clock. Each recording plays once and nothing here explains anything until it is over."
      back={{ to: "/listening", label: "Listening" }}
    >
      <div className="space-y-5">
        {/* ------------------------------------------------ a sitting already open --- */}
        {openRow && openRow.mock_id !== preparingId && (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <p className="text-[13px] leading-6 text-foreground">
                <span className="font-semibold">You already have a paper open.</span> Its clock has
                been running since it started, and the recordings it has already used cannot be
                played again. Finish it, or abandon it deliberately.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate(`/listening/mock/sitting/${openRow.mock_id}`)}>
                  Back to the sitting
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void abandon(openRow.mock_id).then(() => void loadHistory());
                  }}
                >
                  Abandon it
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ----------------------------------------------------------- the paper --- */}
        {planError ? (
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                icon={AlertTriangle}
                title="No test in this pack can be sat as a mock"
                description={planError}
                action={<Button onClick={() => void loadPlan(delivery)}>Try again</Button>}
              />
            </CardContent>
          </Card>
        ) : !plan ? (
          <SkeletonCard lines={4} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Headphones className="h-4 w-4 text-primary" aria-hidden="true" />
                {plan.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="outline">{plan.question_count} questions</Badge>
                <Badge tone="outline">{plan.parts.length} parts</Badge>
                {/*
                  `total_s` sums the *rendered* parts only — an unprepared part reports
                  `duration_ms: 0`. Before preparation that made a 24-minute paper announce
                  itself as "about 8:17", which is exactly the number a candidate would plan
                  their sitting around. The server already distinguishes the two cases with
                  `derived_from_audio` (true only when all four parts are ready), so show the
                  measured length when it is real and say plainly that it is not yet known
                  when it is not, rather than presenting a partial sum as the total.
                */}
                <Badge tone="outline">
                  {plan.timing.derived_from_audio
                    ? `about ${formatDuration(Math.round(plan.timing.total_s))}`
                    : "length known once the audio is prepared"}
                </Badge>
                <Badge tone="primary">{plan.timing.window_label} at the end</Badge>
              </div>

              {plan.coherence.warnings.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-warning/40 bg-warning/8 p-3 text-[12px] leading-5 text-muted-foreground">
                  {plan.coherence.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}

              {/* ------------------------------------------------- delivery --- */}
              <Field label="Which format are you sitting?" hint={plan.timing.mnemonic}>
                <Select
                  aria-label="Delivery format"
                  value={delivery}
                  disabled={Boolean(preparing)}
                  options={DELIVERY_OPTIONS}
                  onChange={(value) => setDelivery(value as Delivery)}
                />
              </Field>

              <p className="rounded-lg border border-border bg-muted/50 p-3 text-[12px] leading-5 text-muted-foreground">
                {plan.timing.why_computer}
              </p>

              {/* ------------------------------------------------ the briefing --- */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{plan.briefing.title}</h3>
                <ul className="space-y-1.5">
                  {plan.briefing.points.map((point, index) => (
                    <li key={index} className="flex gap-2 text-[13px] leading-6">
                      <span aria-hidden="true" className="text-muted-foreground">
                        ·
                      </span>
                      <span className="min-w-0 text-muted-foreground">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* --------------------------------------------------- the render bar --- */}
        {preparing && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {preparing.audio.ready ? (
                  <Headphones className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                )}
                {preparing.audio.ready
                  ? "All four recordings are ready"
                  : "Synthesizing the recordings"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-[13px] leading-6 text-muted-foreground">
                {preparing.audio.note}
              </p>

              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={preparing.audio.total_parts}
                aria-valuenow={preparing.audio.ready_parts}
                aria-valuetext={`${preparing.audio.ready_parts} of ${preparing.audio.total_parts} parts rendered`}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${preparing.audio.pct}%` }}
                />
              </div>

              <p aria-live="polite" className="text-[13px] font-medium">
                {preparing.audio.ready_parts} of {preparing.audio.total_parts} parts rendered
                {preparing.audio.job_progress_pct !== null &&
                  !preparing.audio.ready &&
                  ` — this one is ${Math.round(preparing.audio.job_progress_pct)}% done`}
                .
              </p>

              {preparing.audio.job_detail && !preparing.audio.ready && (
                <p className="text-[12px] leading-5 text-muted-foreground">
                  {preparing.audio.job_detail}
                </p>
              )}

              {!preparing.audio.ready && (
                <p className="text-[12px] leading-5 text-muted-foreground">
                  This is speech synthesis on your own machine, so it takes a few minutes the first
                  time and is instant every time after — the recordings are cached. You can leave
                  this screen open; the clock has not started and will not until you press start.
                </p>
              )}

              <ol className="space-y-1">
                {preparing.audio.parts.map((part) => (
                  <li
                    key={part.script_id}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[12px]"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      Part {part.position} — {part.title}
                    </span>
                    <span className={part.ready ? "text-success" : "text-muted-foreground"}>
                      {part.ready
                        ? `ready · ${formatDuration(Math.round(part.duration_ms / 1000))}`
                        : "rendering"}
                    </span>
                  </li>
                ))}
              </ol>

              {preparing.audio.job_error && (
                <p role="alert" className="text-[13px] font-medium text-destructive">
                  {preparing.audio.job_error}
                </p>
              )}

              {startError && (
                <p role="alert" className="text-[13px] font-medium text-destructive">
                  {startError}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Button
                  disabled={!preparing.audio.ready}
                  loading={starting}
                  onClick={() => void onStart()}
                >
                  Start the paper
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    void abandon(preparing.mock_id).then(() => {
                      setPreparingId(null);
                      void loadHistory();
                    });
                  }}
                >
                  Cancel
                </Button>
                <span className="text-[12px] text-muted-foreground">
                  The clock starts when you press start, not before.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------- what is switched off --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
              What a sitting takes away
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              {CONDITIONS.map((condition) => (
                <div key={condition.id}>
                  <dt className="text-[13px] font-semibold text-foreground">{condition.title}</dt>
                  <dd className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                    {condition.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-[12px] leading-5 text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {BAND_NOTE}
        </p>

        {/* ------------------------------------------------------------- open it --- */}
        {!preparing && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button size="lg" disabled={!plan} loading={creating} onClick={() => void onOpen()}>
              <Clock className="h-4 w-4" aria-hidden="true" />
              Open the paper and render its audio
            </Button>
            <span className="text-[12px] text-muted-foreground">
              Opening it shuts the coach. The clock starts separately, once the audio exists.
            </span>
          </div>
        )}

        {createError && (
          <p role="alert" className="text-[13px] font-medium text-destructive">
            {createError}
          </p>
        )}

        {/* ------------------------------------------------------- past sittings --- */}
        {history && history.items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Past sittings</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {history.items.slice(0, 8).map((row) => (
                  <li
                    key={row.mock_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-[13px]"
                  >
                    <span className="min-w-0 truncate">{row.title ?? row.test_id}</span>
                    <span className="flex items-center gap-3">
                      {row.raw_score !== null ? (
                        <>
                          <span className="font-semibold tabular-nums">
                            {row.raw_score}/{row.total_questions}
                          </span>
                          {row.band !== null && <Badge tone="outline">band {row.band}</Badge>}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/listening/mock/report/${row.mock_id}`)}
                          >
                            Report
                          </Button>
                        </>
                      ) : (
                        <Badge tone="default">{row.status}</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {history.delta_raw !== null && history.scored > 1 && (
                <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                  Raw score is the series that moves: you are {history.delta_raw >= 0 ? "up" : "down"}{" "}
                  {Math.abs(history.delta_raw)} marks since your first sitting. Bands in the middle of
                  the table are five marks wide, so they move much later.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}

export default MockPreflight;

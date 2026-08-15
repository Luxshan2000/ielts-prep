/**
 * `/reading/mock` — the screen that decides whether the mock is taken seriously.
 *
 * It states what is about to happen, states plainly what will not be available, and
 * then offers one button. The temptation is to reassure — "it's only practice" —
 * which is exactly how you get an hour that was half-sat and a report nobody
 * believes.
 *
 * The one line that earns its prominence is the transfer-time line. Candidates who
 * expect ten extra minutes at the end, as Listening gives, lose real marks to it.
 */

import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Clock, Info, ShieldAlert, Timer } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Select,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { formatDuration } from "@/lib/format";
import { useSessionStore } from "@/stores";
import type { ReadingFormat } from "../../types";
import {
  BAND_FACTS,
  CONDITIONS,
  FORMAT_LABEL,
  MOCK_SECONDS,
  NO_TRANSFER_LINE,
  pacingPlan,
} from "./script";
import { activeSitting, elapsedOf, remainingOf, useMockStore } from "./store";

const FORMAT_OPTIONS = [
  { value: "academic", label: "Academic — three passages, 40 questions" },
  { value: "general_training", label: "General Training — three sections, 40 questions" },
];

export function MockPreflight() {
  const navigate = useNavigate();
  const offline = useSessionStore((s) => s.offline);

  const format = useMockStore((s) => s.format);
  const setFormat = useMockStore((s) => s.setFormat);
  const records = useMockStore((s) => s.records);
  const loadRecords = useMockStore((s) => s.loadRecords);
  const tests = useMockStore((s) => s.tests);
  const testsStatus = useMockStore((s) => s.testsStatus);
  const loadTests = useMockStore((s) => s.loadTests);
  const starting = useMockStore((s) => s.starting);
  const startError = useMockStore((s) => s.startError);
  const start = useMockStore((s) => s.start);

  useEffect(() => {
    loadRecords();
    void loadTests();
  }, [loadRecords, loadTests]);

  const open = useMemo(() => activeSitting(records), [records]);
  const available = useMemo(
    () => tests.filter((test) => test.format === format).length,
    [format, tests],
  );
  const plan = pacingPlan(format);

  const begin = async () => {
    const attemptId = await start();
    if (attemptId) navigate(`/reading/mock/sitting/${attemptId}`);
  };

  return (
    <PageShell
      title="Mock reading paper"
      description="Three passages, forty questions, sixty minutes, one clock. No help of any kind while it runs."
      back={{ to: "/reading", label: "Reading" }}
    >
      <div className="space-y-6">
        {offline && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/8 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-[13px] text-muted-foreground">
              BandReady's local service isn't responding, so a mock can't start. It may still be
              launching — try again in a few seconds.
            </p>
          </div>
        )}

        {open && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/8 p-3">
            <p className="flex items-center gap-2 text-[13px] text-foreground">
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              You have a paper open — {formatDuration(Math.abs(remainingOf(open)))}{" "}
              {remainingOf(open) >= 0 ? "left on its clock" : "past its hour"}. It has been running
              the whole time.
            </p>
            <Button size="sm" onClick={() => navigate(`/reading/mock/sitting/${open.attemptId}`)}>
              Back to it
            </Button>
          </div>
        )}

        {/* ---------------------------------------------- the hour itself --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" aria-hidden="true" />
              The hour, and how it should be spent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-[14px] font-semibold leading-6 text-foreground">
              {NO_TRANSFER_LINE}
            </p>
            <p className="text-[13px] leading-6 text-muted-foreground">
              On paper you would be writing onto the answer sheet inside those sixty minutes, and
              candidates who plan for extra time at the end lose marks they had already earned. Here
              your answers are recorded as you type, so the risk does not exist — which is precisely
              why it has to be said rather than discovered.
            </p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {plan.map((mins, index) => (
                <li key={index} className="rounded-xl border border-border bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {format === "general_training" ? "Section" : "Passage"} {index + 1}
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold tabular text-foreground">
                    {mins} minutes
                  </p>
                  <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                    {index === 0
                      ? "The cheapest marks in the paper. Do not overspend here."
                      : index === 1
                        ? "Start it by the checkpoint even if the first is unfinished."
                        : "The most expensive marks. This is what the front-loading protects."}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-[12px] tabular text-muted-foreground">
              Checkpoints: {plan[0]}:00 start the second · {plan[0] + plan[1]}:00 start the third ·
              58:00 stop answering and sweep for blanks. Total {formatDuration(MOCK_SECONDS)}.
            </p>
          </CardContent>
        </Card>

        {/* --------------------------------------------- terms of entry ----- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
              What the hour takes away
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {CONDITIONS.map((condition) => (
                <li key={condition.id} className="rounded-xl border border-border bg-card p-3.5">
                  <p className="text-[13px] font-semibold">{condition.title}</p>
                  <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                    {condition.detail}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ------------------------------------------------- module + go ---- */}
        <Card>
          <CardContent className="space-y-4 pt-5">
            <Field
              label="Which paper are you sitting?"
              hint="Pick the module you are entered for — the two papers are marked on different tables."
            >
              <Select
                aria-label="Exam module"
                value={format}
                onChange={(value) => setFormat(value as ReadingFormat)}
                options={FORMAT_OPTIONS}
              />
            </Field>

            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[13px] leading-6 text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {BAND_FACTS[format]}
            </p>

            {testsStatus === "ready" && available === 0 && (
              <p role="alert" className="text-[13px] text-destructive">
                No {FORMAT_LABEL[format]} test is installed, so this paper cannot be sat yet.
              </p>
            )}
            {startError && (
              <p role="alert" className="text-[13px] text-destructive">
                {startError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                loading={starting}
                disabled={starting || offline || (testsStatus === "ready" && available === 0)}
                onClick={() => void begin()}
              >
                Start the hour
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <p className="text-[12px] text-muted-foreground">
                The clock starts when this screen closes, and it does not pause. At zero the paper
                submits itself.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------ history --- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Your past sittings</h2>
          {records.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              None yet. A full paper is an assessment instrument rather than a training one — one
              every two or three days at most, with review and drills in between.
            </p>
          ) : (
            <ul className="space-y-2">
              {records.slice(0, 6).map((record) => (
                <li key={record.attemptId}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground">
                          {record.testTitle}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                          <Badge tone="outline">{FORMAT_LABEL[record.format]}</Badge>
                          <span>{new Date(record.startedAt).toLocaleString()}</span>
                          <span className="tabular">
                            {formatDuration(Math.min(elapsedOf(record), MOCK_SECONDS))} sat
                          </span>
                          {record.status === "abandoned" && <Badge tone="warning">Abandoned</Badge>}
                          {record.status === "sitting" && <Badge tone="primary">Open</Badge>}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            record.status === "sitting"
                              ? `/reading/mock/sitting/${record.attemptId}`
                              : `/reading/mock/report/${record.attemptId}`,
                          )
                        }
                      >
                        {record.status === "sitting" ? "Resume" : "The report"}
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}

export default MockPreflight;

/**
 * `/writing/mock` — the screen that decides whether the mock is taken seriously.
 *
 * A mock is only worth something if it is sat under the conditions it claims to
 * reproduce, and nobody does that by accident. So this screen states exactly what
 * is about to happen, states what will *not* happen, names the weighting honestly
 * before any band exists to argue about, and then offers one button.
 *
 * The temptation on a screen like this is to reassure — "it's only practice" —
 * which is precisely how you get a learner who half-tries for an hour and then
 * distrusts the report.
 */

import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Clock, Info, ShieldAlert } from "lucide-react";
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
import { useSessionStore } from "@/stores";
import { MockHistory } from "./MockHistory";
import { EXPECTATIONS, TASK_OUTLINE, WEIGHTING_NOTE } from "./script";
import { clockLabel } from "./format";
import { remainingOf, useMockStore, type MockModule } from "./store";

const MODULE_OPTIONS = [
  { value: "academic", label: "Academic — Task 1 is a chart, table, process or map" },
  { value: "general", label: "General Training — Task 1 is a letter" },
];

export function MockPreflight() {
  const navigate = useNavigate();
  const offline = useSessionStore((s) => s.offline);

  const module = useMockStore((s) => s.module);
  const setModule = useMockStore((s) => s.setModule);
  const starting = useMockStore((s) => s.starting);
  const startError = useMockStore((s) => s.startError);
  const start = useMockStore((s) => s.start);
  const records = useMockStore((s) => s.records);
  const loadRecords = useMockStore((s) => s.loadRecords);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  /** An hour that was opened and never finished. Resumable, and still running. */
  const unfinished = useMemo(() => records.find((r) => r.status === "sitting") ?? null, [records]);

  const begin = async () => {
    const id = await start();
    if (id) navigate(`/writing/mock/sitting/${id}`);
  };

  return (
    <PageShell
      title="Mock writing paper"
      description="Two tasks, sixty minutes, one clock. No help of any kind while it runs."
      actions={<Badge tone="primary">The only place a combined Writing band is shown</Badge>}
    >
      <div className="space-y-6">
        {offline && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/8 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-[13px] text-muted-foreground">
              The practice engine isn't responding, so a mock can't start. It may still be
              launching — retry in a few seconds.
            </p>
          </div>
        )}

        {unfinished && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/8 p-3">
            <p className="flex items-center gap-2 text-[13px] text-foreground">
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              You have a sitting open — {clockLabel(remainingOf(unfinished))}{" "}
              {remainingOf(unfinished) >= 0 ? "left on its clock" : "past its hour"}. It has been
              running the whole time.
            </p>
            <Button size="sm" onClick={() => navigate(`/writing/mock/sitting/${unfinished.id}`)}>
              Back to it
            </Button>
          </div>
        )}

        {/* ------------------------------------------------ what happens --- */}
        <Card>
          <CardHeader>
            <CardTitle>What is about to happen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="space-y-3">
              {TASK_OUTLINE.map((row, i) => (
                <li key={row.key} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                      {row.title}
                      <span className="inline-flex items-center gap-1 text-[12px] font-normal text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {row.target} · at least {row.minWords} words
                      </span>
                    </p>
                    <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                      {row.what}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[13px] leading-6 text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {WEIGHTING_NOTE}
            </p>
          </CardContent>
        </Card>

        {/* ------------------------------------------- the terms of entry --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
              Before you commit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {EXPECTATIONS.map((item) => (
                <li key={item.id} className="rounded-xl border border-border bg-card p-3.5">
                  <p className="text-[13px] font-semibold">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{item.detail}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* -------------------------------------------------- the module --- */}
        <Card>
          <CardContent className="space-y-4 pt-5">
            <Field
              label="Which paper are you sitting?"
              hint="This only decides Task 1. Task 2 is the same essay paper on both modules."
            >
              <Select
                aria-label="Exam module"
                value={module}
                onChange={(value) => setModule(value as MockModule)}
                options={MODULE_OPTIONS}
              />
            </Field>

            {startError && (
              <p role="alert" className="text-[13px] text-destructive">
                {startError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                loading={starting}
                disabled={starting || offline}
                onClick={() => void begin()}
              >
                Start the hour
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <p className="text-[12px] text-muted-foreground">
                The clock starts the moment this screen closes, and it does not pause.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------ history --- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Your past sittings</h2>
          <MockHistory limit={4} />
        </section>
      </div>
    </PageShell>
  );
}

export default MockPreflight;

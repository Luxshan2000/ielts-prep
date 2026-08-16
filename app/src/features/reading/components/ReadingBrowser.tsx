import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  FileText,
  GraduationCap,
  Layers,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Select,
  SkeletonCard,
  Tabs,
  TabPanel,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { HistoryButton } from "@/components/practice/history";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { cn } from "@/lib/cn";
import { formatMinutes } from "@/lib/format";
import { fetchReadingHistory } from "../history";
import { DRILLABLE_TYPES, qtypeLabel } from "../qtypes";
import { useReadingStore } from "../store";
import type { PassageSummary, TestSummary } from "../types";
import { StartDialog, type StartOptions } from "./StartDialog";

type TabId = "tests" | "passages" | "drills";

const FORMAT_LABEL: Record<string, string> = {
  academic: "Academic",
  general_training: "General Training",
};

const DRILL_SIZES = [5, 10, 20] as const;

function FormatFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      aria-label="Test format"
      className="w-56"
      value={value}
      onChange={onChange}
      options={[
        { value: "all", label: "Both formats" },
        { value: "academic", label: "Academic" },
        { value: "general_training", label: "General Training" },
      ]}
    />
  );
}

function LoadError({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="The reading library could not be loaded"
      description={detail}
      action={<Button onClick={onRetry}>Try again</Button>}
    />
  );
}

function TestCard({ test, onStart }: { test: TestSummary; onStart: () => void }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{FORMAT_LABEL[test.format] ?? test.format}</Badge>
          {test.generated && (
            <Badge tone="warning">
              <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
              Generated
            </Badge>
          )}
          {test.band_target ? <Badge tone="outline">Band {test.band_target}</Badge> : null}
        </div>
        <CardTitle className="mt-2">{test.title}</CardTitle>
        <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
          {test.passages.map((passage, index) => (
            <li key={passage.id} className="truncate">
              {index + 1}. {passage.title}
              {passage.questions ? `, ${passage.questions} questions` : ""}
            </li>
          ))}
        </ul>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 pt-2">
        {/* A paper is 60 minutes long; `formatDuration` would print it as "1:00:00", which
            reads as a stopwatch already running rather than as how long this will take. */}
        <span className="text-[11px] text-muted-foreground tabular">
          {test.total_questions} questions · {formatMinutes(60)}
        </span>
        <Button size="sm" onClick={onStart}>
          Start test
        </Button>
      </CardContent>
    </Card>
  );
}

function PassageCard({
  passage,
  onStart,
}: {
  passage: PassageSummary;
  onStart: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{FORMAT_LABEL[passage.format] ?? passage.format}</Badge>
          <Badge tone="outline">{passage.difficulty}</Badge>
          {passage.generated && <Badge tone="warning">Generated</Badge>}
        </div>
        <CardTitle className="mt-2">{passage.title}</CardTitle>
        {passage.topic && (
          <p className="mt-1 text-[11px] text-muted-foreground">{passage.topic}</p>
        )}
        {passage.question_types.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {passage.question_types.map((type) => qtypeLabel(type)).join(" · ")}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 pt-2">
        <span className="text-[11px] text-muted-foreground tabular">
          {passage.questions} questions
          {passage.word_count ? ` · ${passage.word_count} words` : ""}
        </span>
        <Button size="sm" onClick={onStart}>
          Practise
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The reading library: full tests, single-passage practice and question-type
 * drills. Every list handles loading, empty, error and success honestly — an
 * empty content bank says so and points at the packs screen.
 */
export function ReadingBrowser() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const [tab, setTab] = useState<TabId>(
    tabParam === "passages" || tabParam === "drills" ? tabParam : "tests",
  );
  const [format, setFormat] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [drillType, setDrillType] = useState<string | null>(params.get("qtype"));
  const [drillSize, setDrillSize] = useState<number>(10);
  const [pending, setPending] = useState<
    | { kind: "full"; id: string; title: string }
    | { kind: "passage"; id: string; title: string }
    | null
  >(null);

  const status = useReadingStore((s) => s.catalogStatus);
  const error = useReadingStore((s) => s.catalogError);
  const tests = useReadingStore((s) => s.tests);
  const passages = useReadingStore((s) => s.passages);
  const probes = useReadingStore((s) => s.drillProbes);
  const loadCatalog = useReadingStore((s) => s.loadCatalog);
  const probeDrill = useReadingStore((s) => s.probeDrill);
  const startAttempt = useReadingStore((s) => s.startAttempt);
  const starting = useReadingStore((s) => s.attemptStatus === "loading");
  const startError = useReadingStore((s) => s.attemptError);

  // How much is behind the History button. "History" on its own gives a learner no reason
  // to press it; a failure here just hides the count and never breaks the library.
  const [historyCount, setHistoryCount] = useState<number | null>(null);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    let live = true;
    fetchReadingHistory()
      .then((rows) => {
        if (live) setHistoryCount(rows.length);
      })
      .catch(() => {
        if (live) setHistoryCount(null);
      });
    return () => {
      live = false;
    };
  }, []);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card after it comes back (12 §9).
  useSidecarRecovery(() => void loadCatalog());

  useEffect(() => {
    if (drillType) void probeDrill(drillType);
  }, [drillType, probeDrill]);

  const visibleTests = useMemo(
    () => tests.filter((test) => format === "all" || test.format === format),
    [tests, format],
  );

  const visiblePassages = useMemo(
    () =>
      passages.filter(
        (passage) =>
          (format === "all" || passage.format === format) &&
          (difficulty === "all" || passage.difficulty === difficulty),
      ),
    [passages, format, difficulty],
  );

  /** Types that actually exist in the installed bank, in teaching order. */
  const availableTypes = useMemo(() => {
    const present = new Set<string>();
    for (const passage of passages) for (const type of passage.question_types) present.add(type);
    const ordered = DRILLABLE_TYPES.filter((type) => present.has(type));
    const extras = [...present].filter((type) => !DRILLABLE_TYPES.includes(type)).sort();
    return [...ordered, ...extras];
  }, [passages]);

  function switchTab(next: TabId) {
    setTab(next);
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  }

  async function start(request: Parameters<typeof startAttempt>[0], untimed: boolean) {
    const attemptId = await startAttempt(request, { untimed });
    if (attemptId) {
      setPending(null);
      navigate(`/reading/attempt/${attemptId}`);
    }
  }

  function onStartConfirmed(options: StartOptions) {
    if (!pending) return;
    void start(
      {
        mode: pending.kind,
        test_id: pending.kind === "full" ? pending.id : null,
        passage_id: pending.kind === "passage" ? pending.id : null,
        exam_conditions: options.examConditions,
        timer_s: options.timerS,
      },
      options.timerS === null,
    );
  }

  const probe = drillType ? probes[drillType] : undefined;
  const loading = status === "loading" || status === "idle";

  return (
    <PageShell
      title="Reading"
      description="Full Academic and General Training tests, single-passage practice, and question-type drills."
      /*
        The two rooms either side of the library, in the slot every skill uses for them.
        They are rendered here rather than in the feature layout so that they exist on
        the library screen only: during an attempt — and above all during a mock — a
        visible link to the coach is a visible link to the answers.
      */
      onRefresh={() => void loadCatalog(true)}
      refreshing={status === "loading"}
      refreshLabel="Reload the reading library"
      actions={
        <>
          <HistoryButton to="/reading/history" count={historyCount} />
          <Button variant="outline" size="sm" onClick={() => navigate("/reading/coach")}>
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            Coach
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/reading/mock")}>
            <Timer className="h-4 w-4" aria-hidden="true" />
            Mock paper
          </Button>
        </>
      }
      toolbar={
        <Tabs
          aria-label="Reading practice"
          value={tab}
          onChange={(value) => switchTab(value as TabId)}
          items={[
            { value: "tests", label: "Full tests", badge: tests.length || undefined },
            { value: "passages", label: "Single passages", badge: passages.length || undefined },
            { value: "drills", label: "Question drills" },
          ]}
        />
      }
    >
      {status === "error" && error ? (
        <LoadError detail={error} onRetry={() => void loadCatalog(true)} />
      ) : (
        <>
          <TabPanel value="Full tests" active={tab === "tests"}>
            {/*
              "Full test" and "mock paper" are the same 40 questions, so the difference has
              to be said out loud or a learner picks whichever button is nearer.
            */}
            <p className="mb-3 text-[13px] text-muted-foreground">
              A test here is yours to set up: choose the clock or turn it off, and the coach
              opens the moment you submit. The mock paper is the same length with none of
              that: one fixed hour, no help, and a report on how you spent the time.
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <FormatFilter value={format} onChange={setFormat} />
              <span className="text-[11px] text-muted-foreground tabular">
                {visibleTests.length} of {tests.length} tests
              </span>
            </div>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <SkeletonCard lines={4} />
                <SkeletonCard lines={4} />
              </div>
            ) : visibleTests.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={tests.length === 0 ? "No reading tests installed" : "No tests match that filter"}
                description={
                  tests.length === 0
                    ? "Reading tests arrive with a content pack. Install or import one from Settings → Data, then come back."
                    : "Try the other format, or practise a single passage instead."
                }
                action={
                  tests.length === 0 ? (
                    <Button variant="outline" onClick={() => navigate("/settings")}>
                      Open Settings
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => setFormat("all")}>
                      Clear filter
                    </Button>
                  )
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {visibleTests.map((test) => (
                  <TestCard
                    key={test.id}
                    test={test}
                    onStart={() => setPending({ kind: "full", id: test.id, title: test.title })}
                  />
                ))}
              </div>
            )}
          </TabPanel>

          <TabPanel value="Single passages" active={tab === "passages"}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <FormatFilter value={format} onChange={setFormat} />
              <Select
                aria-label="Difficulty"
                className="w-44"
                value={difficulty}
                onChange={setDifficulty}
                options={[
                  { value: "all", label: "Any difficulty" },
                  { value: "easy", label: "Easy" },
                  { value: "medium", label: "Medium" },
                  { value: "hard", label: "Hard" },
                ]}
              />
              <span className="text-[11px] text-muted-foreground tabular">
                {visiblePassages.length} of {passages.length} passages
              </span>
            </div>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <SkeletonCard lines={3} />
                <SkeletonCard lines={3} />
              </div>
            ) : visiblePassages.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title={
                  passages.length === 0
                    ? "No passages installed"
                    : "No passages match those filters"
                }
                description={
                  passages.length === 0
                    ? "Single-passage practice comes from the same content packs as full tests."
                    : "Widen the format or difficulty filter to see more."
                }
                action={
                  passages.length > 0 ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFormat("all");
                        setDifficulty("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {visiblePassages.map((passage) => (
                  <PassageCard
                    key={passage.id}
                    passage={passage}
                    onStart={() =>
                      setPending({ kind: "passage", id: passage.id, title: passage.title })
                    }
                  />
                ))}
              </div>
            )}
          </TabPanel>

          <TabPanel value="Question drills" active={tab === "drills"}>
            {/*
              `/reading/drills` had nothing pointing at it. It is a different drill from the
              type drills below — it selects by the mistake you keep making rather than by
              question type — so it needs its own door, and saying which is which is the
              whole point of putting them on one screen.
            */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                Short reps on the four things that actually lose marks: judging what the writer
                really claimed, matching a paraphrase to the sentence it came from, finding the
                paragraph fast, and keeping the answer inside the word limit.
              </p>
              <Button variant="outline" onClick={() => navigate("/reading/drills")}>
                Open drills
              </Button>
            </div>

            {loading ? (
              <SkeletonCard lines={5} />
            ) : availableTypes.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No drillable questions yet"
                description="Drills pull questions of one type from across the installed bank. Install a content pack to use them."
              />
            ) : (
              <div className="space-y-5">
                <p className="text-[13px] text-muted-foreground">
                  Pick one question type and answer several in a row: ten True/False/Not Given, for
                  example. Drills are marked the same way as a test but produce no band score.
                </p>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {availableTypes.map((type) => {
                    const selected = drillType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setDrillType(type)}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        <span className="block font-medium">{qtypeLabel(type)}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {selected && probe?.status === "ok"
                            ? `${probe.size} in the bank`
                            : selected && probe?.status === "loading"
                              ? "checking the bank…"
                              : "in this content pack"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {drillType && (
                  <Card>
                    <CardHeader>
                      <CardTitle>{qtypeLabel(drillType)} drill</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {probe?.status === "missing" && (
                        <p className="text-[13px] text-muted-foreground">
                          The bank has no questions of this type right now.
                        </p>
                      )}
                      {probe?.status === "error" && probe.error && (
                        <p className="text-[13px] text-destructive">{probe.error}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] text-muted-foreground">Length</span>
                        {DRILL_SIZES.map((size) => (
                          <button
                            key={size}
                            type="button"
                            aria-pressed={drillSize === size}
                            disabled={probe?.status === "ok" && probe.size < size}
                            onClick={() => setDrillSize(size)}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              "disabled:pointer-events-none disabled:opacity-40",
                              drillSize === size
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {size}
                          </button>
                        ))}
                        <span className="text-[11px] text-muted-foreground tabular">
                          about {formatMinutes(((probe?.secondsPerQuestion ?? 90) * drillSize) / 60)}
                        </span>
                      </div>
                      {startError && <p className="text-[13px] text-destructive">{startError}</p>}
                      <Button
                        loading={starting}
                        disabled={probe?.status === "missing"}
                        onClick={() =>
                          void start(
                            { mode: "drill", qtype: drillType, size: drillSize },
                            false,
                          )
                        }
                      >
                        <Layers className="h-4 w-4" />
                        Start drill
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabPanel>
        </>
      )}

      <StartDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.title ?? "Start"}
        description={
          pending?.kind === "full"
            ? "Three passages, 40 questions. The timer runs down and submits for you at zero."
            : "One passage and its questions, the recommended way to build accuracy before timing yourself."
        }
        defaultTimer={pending?.kind === "full" ? 3600 : 1200}
        starting={starting}
        error={startError}
        onStart={onStartConfirmed}
      />
    </PageShell>
  );
}

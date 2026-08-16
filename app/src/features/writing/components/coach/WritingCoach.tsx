/**
 * The writing coach — `/writing/coach/:promptId`.
 *
 * One prompt, six surfaces: the task, the overview (Academic Task 1 only), the
 * plan, the model answers, the comparison with the learner's own attempt, and the
 * language bank. Two of them are attempt-gated; the rest are preparation material
 * and are always open.
 *
 * The shape deliberately mirrors the speaking Topic Coach, down to the gate copy,
 * so the two halves of the app feel like one product rather than two teams.
 *
 * The comparison needs the learner's marked attempt, which lives somewhere else
 * entirely from the pack content, so the history load is independent of the prompt
 * load: a coach whose attempt lookup fails still opens, with one column empty.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GraduationCap, Lock, PenLine } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
  TabPanel,
  Tabs,
  type TabItem,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { CompareWithModel } from "./CompareWithModel";
import { LanguageBankPanel } from "./LanguageBank";
import { AttemptGate, GATE_REASON, ModelAnswerViewer, NoticeGate } from "./ModelAnswers";
import { OverviewCoach } from "./OverviewCoach";
import { PlanPanel } from "./PlanPanel";
import { SentenceLadder } from "./SentenceLadder";
import { TaskBrief } from "./TaskBrief";
import { hasTeaching } from "./types";
import { isAttempted, useCoachStore } from "./store";
import { useMockStore } from "../mock/store";
import { TASK_LABELS, genreLabel, useWritingStore } from "../../store";

/**
 * The mock has no coaching affordance inside it, but the sidebar is still on the
 * page: without this, a candidate could open the coach in the middle of the hour
 * and read a model answer with the clock running. The speaking module shuts its
 * coach server-side for the duration of a sitting; the writing mock has no
 * server-side record yet, so the equivalent guard lives here, reading the same
 * sitting record the mock itself keeps.
 */
const EXAM_CONDITIONS_REASON =
  "You have a mock paper open. Model answers stay shut until the hour is over. A mock you can read a model during is not a mock.";

type CoachTab = "task" | "overview" | "plan" | "model" | "compare" | "language";

export function WritingCoach() {
  const { promptId = "" } = useParams<{ promptId: string }>();
  const navigate = useNavigate();

  const slot = useCoachStore((s) => s.prompts[promptId]);
  const loadPrompt = useCoachStore((s) => s.loadPrompt);
  const standing = useCoachStore((s) => s.standings[promptId]);
  const loadStanding = useCoachStore((s) => s.loadStanding);
  const gate = useCoachStore((s) => s.gates[promptId]);
  const loadGate = useCoachStore((s) => s.loadGate);
  const clearGates = useCoachStore((s) => s.clearGates);
  const noticed = useCoachStore((s) => s.noticed[promptId] ?? "");
  const setNoticed = useCoachStore((s) => s.setNoticed);
  const passed = useCoachStore((s) => s.passed[promptId] ?? false);
  const pass = useCoachStore((s) => s.pass);
  const overviewDraft = useCoachStore((s) => s.overviewDraft[promptId]);
  const setOverviewDraft = useCoachStore((s) => s.setOverviewDraft);

  const createAttempt = useWritingStore((s) => s.createAttempt);
  const mockRecords = useMockStore((s) => s.records);
  const loadMockRecords = useMockStore((s) => s.loadRecords);
  const [starting, setStarting] = useState(false);
  const [tab, setTab] = useState<CoachTab>("task");

  useEffect(() => {
    void loadPrompt(promptId);
    void loadStanding(promptId);
    loadMockRecords();
  }, [loadMockRecords, loadStanding, loadPrompt, promptId]);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card once it comes back.
  useSidecarRecovery(() => {
    void loadPrompt(promptId, { force: true });
    void loadStanding(promptId);
    void loadGate(promptId);
  });

  const attempts = standing?.attempts ?? [];
  const examConditions = useMemo(
    () => mockRecords.some((record) => record.status === "sitting"),
    [mockRecords],
  );
  /**
   * The server decides. `gate.unlocked` is the sidecar's own answer, taken from the
   * learner's attempt history and from whether a mock is open; the local
   * `isAttempted` reading is only the fallback for the moment before that answer
   * lands, and for a build talking to a sidecar without the coach routes. Either way
   * the gated *content* is absent unless the server sent it, so an optimistic local
   * `true` opens an empty tab, never a model answer.
   */
  const attempted = useMemo(
    () => (gate?.unlocked ?? isAttempted(attempts)) && !examConditions,
    [attempts, examConditions, gate?.unlocked],
  );

  /**
   * The gated document is fetched only outside a sitting, and everything already
   * fetched is dropped the moment one opens. The sidecar has its own exam-conditions
   * guard, but it keys off a *server-side* mock record and the sitting is still
   * client-side (see `../mock/store.ts`), so it would answer this request during the
   * hour. Not asking is the guard that actually holds today.
   */
  useEffect(() => {
    if (examConditions) {
      clearGates();
      return;
    }
    void loadGate(promptId);
  }, [clearGates, examConditions, loadGate, promptId]);

  const write = useCallback(async () => {
    setStarting(true);
    const id = await createAttempt(promptId, "practice");
    setStarting(false);
    if (id) navigate(`/writing/attempt/${id}`);
  }, [createAttempt, navigate, promptId]);

  const status = slot?.status ?? "idle";
  const prompt = slot?.prompt ?? null;

  /**
   * The prompt endpoint carries the open two-thirds of the teaching payload;
   * `gate.teaching` carries the gated third, and only once the server has agreed to
   * release it. Merged in that order so the gated document wins where the two
   * overlap (`plan` gains its `trap`, `overview_brief` gains its content), and so a
   * locked prompt simply keeps the redacted shape it arrived in.
   */
  const teaching = useMemo(() => {
    const open = prompt?.teaching ?? null;
    if (!gate?.teaching) return open;
    return { ...(open ?? {}), ...gate.teaching };
  }, [prompt?.teaching, gate?.teaching]);

  // ---------------------------------------------------------------- loading ---

  if (status === "idle" || status === "loading") {
    return (
      <PageShell title="Writing coach" description="Loading this prompt's teaching material.">
        <div className="space-y-4">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </PageShell>
    );
  }

  // ------------------------------------------------------------------ error ---

  if (status === "error" || !prompt) {
    return (
      <PageShell title="Writing coach">
        <Card>
          <CardContent className="pt-5">
            <ErrorState
              error={slot?.error}
              title="This prompt could not be loaded"
              onRetry={() => void loadPrompt(promptId, { force: true })}
            />
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" onClick={() => navigate("/writing")}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Writing
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // ------------------------------------------------------------ no teaching ---

  if (!hasTeaching(teaching)) {
    return (
      <PageShell
        title="Writing coach"
        description={TASK_LABELS[prompt.task_type] ?? "One prompt, studied."}
      >
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                icon={GraduationCap}
                title="No teaching material on this prompt"
                description="This prompt was authored before the teaching payload existed, or this build's content pack predates it. You can still write it: the marking, the report and the rewrite all work exactly the same."
                action={
                  <Button loading={starting} onClick={() => void write()}>
                    <PenLine className="h-4 w-4" aria-hidden="true" />
                    Write this one
                  </Button>
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <TaskBrief prompt={prompt} teaching={null} />
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  // ------------------------------------------------------------------ ready ---

  const payload = teaching as NonNullable<typeof teaching>;
  const isAcademicTask1 = prompt.task_type === "ac_task1";
  const overviewBrief = payload.overview_brief;
  const hasModels = (payload.model_answers?.length ?? 0) > 0;
  const lockIcon = <Lock className="h-3 w-3" aria-label="Locked" />;

  const tabs: TabItem<CoachTab>[] = [
    { value: "task", label: "The task" },
    ...(isAcademicTask1 && overviewBrief
      ? ([{ value: "overview", label: "The overview" }] as TabItem<CoachTab>[])
      : []),
    { value: "plan", label: "The plan" },
    { value: "model", label: "Model answers", badge: attempted ? undefined : lockIcon },
    { value: "compare", label: "Compare", badge: attempted ? undefined : lockIcon },
    { value: "language", label: "Language bank" },
  ];

  const gateOpen = passed || noticed.trim().length >= 12;
  const gateReason = examConditions ? EXAM_CONDITIONS_REASON : GATE_REASON;

  return (
    <PageShell
      title={payload.teaches ? "Writing coach" : (TASK_LABELS[prompt.task_type] ?? "Writing coach")}
      description={
        payload.teaches ??
        `${TASK_LABELS[prompt.task_type]} · ${genreLabel(prompt.genre)}. Everything this prompt can teach, in one place.`
      }
      actions={
        <div className="flex items-center gap-2">
          {attempted && <Badge tone="success">Attempted</Badge>}
          {examConditions && <Badge tone="warning">Mock in progress</Badge>}
          <Button size="sm" loading={starting} disabled={examConditions} onClick={() => void write()}>
            <PenLine className="h-4 w-4" aria-hidden="true" />
            Write this one
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/writing")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Writing
          </Button>
        </div>
      }
      toolbar={
        <Tabs
          aria-label="Writing coach sections"
          items={tabs}
          value={tab}
          onChange={(v) => setTab(v)}
        />
      }
    >
      {examConditions && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/8 p-3"
        >
          <p className="text-[13px] leading-6 text-muted-foreground">
            A mock paper is open, so the model answers and the comparison are shut until it is
            finished. The task, the plan and the language bank stay available. They were
            available before you started too.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/writing/mock")}>
            Back to the sitting
          </Button>
        </div>
      )}

      <TabPanel value="The task" active={tab === "task"}>
        <TaskBrief
          prompt={prompt}
          teaching={payload}
          onOpenLanguage={() => setTab("language")}
        />
      </TabPanel>

      {isAcademicTask1 && overviewBrief && (
        <TabPanel value="The overview" active={tab === "overview"}>
          <OverviewCoach
            brief={overviewBrief}
            draft={overviewDraft ?? ["", ""]}
            onDraftChange={(index, value) => setOverviewDraft(promptId, index, value)}
            attempted={attempted}
            onWrite={() => void write()}
          />
        </TabPanel>
      )}

      <TabPanel value="The plan" active={tab === "plan"}>
        <PlanPanel teaching={payload} taskType={prompt.task_type} attempted={attempted} />
      </TabPanel>

      <TabPanel value="Model answers" active={tab === "model"}>
        <AttemptGate
          locked={!attempted}
          reason={gateReason}
          onWrite={examConditions ? undefined : () => void write()}
        >
          {!hasModels ? (
            <EmptyState
              icon={GraduationCap}
              title="No model answers on this prompt"
              description="Prompts authored with the teaching payload carry the same answer at bands 6, 7 and 8, annotated against the four criteria."
            />
          ) : !gateOpen ? (
            <NoticeGate
              answers={payload.model_answers ?? []}
              answer={noticed}
              onAnswerChange={(value) => setNoticed(promptId, value)}
              onPass={() => pass(promptId)}
            />
          ) : (
            <div className="space-y-6">
              {noticed.trim() !== "" && (
                <div className="rounded-xl border border-border bg-muted/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    What you noticed
                  </p>
                  <p className="mt-1 text-[13px] leading-6 text-foreground">{noticed}</p>
                </div>
              )}
              <ModelAnswerViewer
                teaching={payload}
                promptId={prompt.id}
                promptTitle={prompt.chart_spec?.title ?? TASK_LABELS[prompt.task_type]}
                taskType={prompt.task_type}
                topicTags={prompt.topic_tags}
                ownBand={standing?.scored?.evaluation?.bands?.ta ?? null}
              />
              {payload.sentence_ladder && <SentenceLadder ladder={payload.sentence_ladder} />}
            </div>
          )}
        </AttemptGate>
      </TabPanel>

      <TabPanel value="Compare" active={tab === "compare"}>
        <AttemptGate
          locked={!attempted}
          reason={gateReason}
          onWrite={examConditions ? undefined : () => void write()}
        >
          {!hasModels ? (
            <EmptyState
              icon={GraduationCap}
              title="Nothing to compare against"
              description="This prompt has no model answers, so there is no second column."
            />
          ) : standing?.loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : standing?.error ? (
            <ErrorState
              error={standing.error}
              title="Your attempts on this prompt could not be loaded"
              onRetry={() => void loadStanding(promptId)}
            />
          ) : (
            <CompareWithModel
              teaching={payload}
              taskType={prompt.task_type}
              attempt={standing?.scored ?? null}
              onRewrite={() => void write()}
            />
          )}
        </AttemptGate>
      </TabPanel>

      <TabPanel value="Language bank" active={tab === "language"}>
        <LanguageBankPanel
          teaching={payload}
          taskType={prompt.task_type}
          promptId={prompt.id}
          promptTitle={prompt.chart_spec?.title ?? TASK_LABELS[prompt.task_type]}
          topicTags={prompt.topic_tags}
        />
      </TabPanel>
    </PageShell>
  );
}

export default WritingCoach;

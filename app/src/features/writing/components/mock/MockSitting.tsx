/**
 * `/writing/mock/sitting/:mockId` — the hour itself.
 *
 * **What is absent from this file is the feature.** There is no coach link, no
 * language bank, no frameworks drawer, no plan ghost text, no overview builder, no
 * error forewarning and no model answer — not hidden behind a flag, not disabled,
 * simply not imported. Nothing in this tree can be revealed by toggling a boolean
 * in devtools, which is the only version of "exam conditions" worth claiming.
 *
 * What *is* here is the real paper's shape:
 *
 *  - both tasks visible and switchable from minute zero, allocation entirely free.
 *    The real room hands the candidate both tasks and lets them spend the hour as
 *    they like, and that freedom is the trap being taught: Task 2 is worth twice
 *    Task 1, so time perfecting Task 1 is the worst trade on the table;
 *  - one clock, which does not pause and does not auto-submit. At zero it turns
 *    destructive and counts upwards, and every second past the hour is recorded;
 *  - planning is allowed, because the real exam allows notes on paper;
 *  - pasting is recorded, never blocked. It is the learner's own tool and their own
 *    integrity flag.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, DoorOpen, FileText, Send } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Modal,
  Progress,
  Skeleton,
  useConfirm,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { PageShell } from "@/components/shell/PageShell";
import { OutlineScratchpad } from "../OutlineScratchpad";
import { PromptPanel } from "../PromptPanel";
import { SaveIndicator, WordCount } from "../EditorStatus";
import { clockLabel } from "./format";
import { ABANDON_CONFIRM, CONDITIONS_LINE, TASK_OUTLINE } from "./script";
import {
  MOCK_SECONDS,
  TASK_ORDER,
  elapsedOf,
  taskWords,
  useMockStore,
  type MockTaskKey,
} from "./store";

const AUTOSAVE_MS = 10_000;

const TASK_LABEL: Record<MockTaskKey, string> = { task1: "Task 1", task2: "Task 2" };

export function MockSitting() {
  const { mockId = "" } = useParams<{ mockId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const active = useMockStore((s) => s.active);
  const opening = useMockStore((s) => s.opening);
  const openError = useMockStore((s) => s.openError);
  const open = useMockStore((s) => s.open);
  const activeTask = useMockStore((s) => s.activeTask);
  const switchTask = useMockStore((s) => s.switchTask);
  const tasks = useMockStore((s) => s.tasks);
  const setEssay = useMockStore((s) => s.setEssay);
  const setOutline = useMockStore((s) => s.setOutline);
  const recordPaste = useMockStore((s) => s.recordPaste);
  const saving = useMockStore((s) => s.saving);
  const savedAt = useMockStore((s) => s.savedAt);
  const saveError = useMockStore((s) => s.saveError);
  const submitting = useMockStore((s) => s.submitting);
  const submitDetail = useMockStore((s) => s.submitDetail);
  const submitError = useMockStore((s) => s.submitError);

  const [outlineOpen, setOutlineOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void open(mockId);
  }, [mockId, open]);

  // ---- the clock: one tick per second, credited to the task on screen -------
  useEffect(() => {
    if (!active || active.status !== "sitting") return;
    const handle = window.setInterval(() => {
      useMockStore.getState().tick();
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(handle);
  }, [active]);

  // ---- autosave every 10 s, on tab-hide, on close and on unmount ------------
  useEffect(() => {
    const handle = window.setInterval(() => void useMockStore.getState().save(), AUTOSAVE_MS);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    const flush = () => void useMockStore.getState().save();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    // Closing the window mid-sitting is the one case where the browser's own
    // "are you sure" is the right guard: ours cannot run after the tab is gone.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (useMockStore.getState().active?.status === "sitting") event.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      flush();
    };
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeTask]);

  const state = tasks[activeTask];
  const prompt = state.prompt;
  const words = useMemo(() => taskWords(state.essay), [state.essay]);
  const minWords = TASK_OUTLINE.find((t) => t.key === activeTask)?.minWords ?? 250;
  const remaining = active ? MOCK_SECONDS - elapsedOf(active) : MOCK_SECONDS;
  const overtime = remaining < 0;
  // `now` is read so the countdown re-renders every second; `elapsedOf` is wall-clock.
  void now;

  const end = useCallback(async () => {
    const ok = await confirm({
      title: "Hand both answers in?",
      message:
        "Both drafts are submitted together and marked in one go. You cannot come back and edit either of them.",
      confirmLabel: "Hand in and mark",
    });
    if (!ok) return;
    const marked = await useMockStore.getState().submit();
    if (marked) navigate(`/writing/mock/report/${mockId}`);
  }, [confirm, mockId, navigate]);

  const quit = useCallback(async () => {
    const ok = await confirm({
      title: "Abandon this sitting?",
      message: ABANDON_CONFIRM,
      confirmLabel: "Abandon the mock",
      destructive: true,
    });
    if (!ok) return;
    await useMockStore.getState().abandon();
    useMockStore.getState().leave();
    navigate("/writing/mock");
  }, [confirm, navigate]);

  // ------------------------------------------------------------- loading ---

  if (opening || (!active && !openError)) {
    return (
      <PageShell title="Mock writing paper" description="Opening the paper.">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      </PageShell>
    );
  }

  if (openError || !active) {
    return (
      <PageShell title="Mock writing paper">
        <ErrorState
          error={openError}
          title="That sitting could not be opened"
          onRetry={() => void open(mockId)}
        />
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => navigate("/writing/mock")}>
            Back to the mock room
          </Button>
        </div>
      </PageShell>
    );
  }

  if (active.status !== "sitting") {
    return (
      <PageShell title="Mock writing paper">
        <EmptyState
          icon={FileText}
          title={active.status === "submitted" ? "This sitting is finished" : "This sitting was abandoned"}
          description={
            active.status === "submitted"
              ? "Both answers were handed in. The report has the time split, the two band sets and the estimate."
              : "The hour was ended early. Both drafts are still in your attempt history."
          }
          action={
            <Button
              onClick={() =>
                navigate(
                  active.status === "submitted" ? `/writing/mock/report/${mockId}` : "/writing/mock",
                )
              }
            >
              {active.status === "submitted" ? "Open the report" : "Back to the mock room"}
            </Button>
          }
        />
      </PageShell>
    );
  }

  // --------------------------------------------------------------- sitting ---

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background/90 px-3 py-2 backdrop-blur">
        <span
          role="timer"
          aria-live="off"
          className={cn(
            "inline-flex items-baseline gap-1.5 rounded-md px-2.5 py-1 text-[17px] font-semibold tabular",
            overtime ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground",
          )}
        >
          {overtime && (
            <AlertTriangle className="h-4 w-4 self-center" aria-hidden="true" />
          )}
          {clockLabel(remaining)}
          <span className="text-[12px] font-normal opacity-70">
            {overtime ? "past the hour" : "left"}
          </span>
        </span>

        {/* Free movement between the two tasks, from minute zero. Roving tabindex
            plus arrow keys, per the WAI-ARIA tab pattern — without the key handler
            the second task would be unreachable from the keyboard entirely. */}
        <div
          role="tablist"
          aria-label="The two tasks"
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const index = TASK_ORDER.indexOf(activeTask);
            const step = event.key === "ArrowRight" ? 1 : TASK_ORDER.length - 1;
            switchTask(TASK_ORDER[(index + step) % TASK_ORDER.length]);
          }}
          className="flex items-center gap-1 rounded-lg bg-muted p-1"
        >
          {TASK_ORDER.map((key) => {
            const selected = key === activeTask;
            const count = taskWords(tasks[key].essay);
            const min = TASK_OUTLINE.find((t) => t.key === key)?.minWords ?? 250;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => switchTask(key)}
                className={cn(
                  "rounded-md px-3 py-1 text-[13px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TASK_LABEL[key]}
                <span
                  className={cn(
                    "ml-1.5 tabular text-[12px]",
                    count < min ? "text-warning" : "text-success",
                  )}
                >
                  {count}/{min}
                </span>
              </button>
            );
          })}
        </div>

        <Badge tone="primary">Exam conditions</Badge>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SaveIndicator saving={saving} dirty={state.dirty} savedAt={savedAt} error={saveError} />
          <WordCount words={words} minWords={minWords} />
          <Button variant="ghost" size="sm" onClick={() => void quit()} disabled={submitting}>
            <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Abandon
          </Button>
          <Button size="sm" loading={submitting} onClick={() => void end()}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Hand in both
          </Button>
        </div>
      </header>

      {saveError && (
        <p
          role="alert"
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-[12px] text-destructive"
        >
          {saveError} Your text is still here and the next autosave will retry.
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {prompt && (
          <aside className="scrollbar-thin hidden w-[22rem] shrink-0 overflow-y-auto border-r border-border p-4 lg:block xl:w-[26rem]">
            <PromptPanel prompt={prompt} />
          </aside>
        )}

        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[76ch] space-y-4 px-4 py-6">
            {/* The prompt again on narrow screens: a drawer would be one more thing
                to discover under time pressure, and there is nothing to hide. */}
            {prompt && (
              <div className="rounded-xl border border-border bg-card p-3.5 lg:hidden">
                <PromptPanel prompt={prompt} />
              </div>
            )}

            <label htmlFor={`mock-essay-${activeTask}`} className="sr-only">
              Your {TASK_LABEL[activeTask]} answer
            </label>
            <textarea
              ref={textareaRef}
              id={`mock-essay-${activeTask}`}
              value={state.essay}
              onChange={(event) => setEssay(activeTask, event.target.value)}
              onBlur={() => void useMockStore.getState().save(activeTask)}
              onPaste={(event) => {
                const pasted = event.clipboardData?.getData("text") ?? "";
                if (pasted) recordPaste(activeTask, taskWords(pasted));
              }}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              placeholder={
                prompt?.task_type === "gt_task1" ? "Dear …" : "Begin your answer here."
              }
              className={cn(
                "min-h-[58vh] w-full resize-none rounded-lg border-0 bg-transparent p-0 text-[16px] leading-8 text-foreground",
                "placeholder:text-muted-foreground/70 focus:outline-none focus-visible:outline-none",
              )}
            />

            {/* Planning is allowed — the real exam gives you paper. What it does not
                give you is a worked plan, so this pad is empty and stays empty. */}
            <OutlineScratchpad
              value={state.outline}
              onChange={(value) => setOutline(activeTask, value)}
              open={outlineOpen}
              onToggle={() => setOutlineOpen((v) => !v)}
            />

            <p className="pb-6 text-[11px] leading-5 text-muted-foreground">
              {CONDITIONS_LINE} Autosaved every 10 seconds. Pasting is allowed and counted:{" "}
              {state.pasteEvents > 0
                ? `${state.pasteEvents} paste${state.pasteEvents === 1 ? "" : "s"} on this task.`
                : "no pastes on this task."}
            </p>
          </div>
        </div>
      </div>

      <Modal open={submitting} onClose={() => undefined} size="sm">
        <div className="space-y-4 p-6">
          <div>
            <p className="text-sm font-semibold text-foreground">Marking both answers</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Two calls to your configured examiner model, one per task. This stays on your
              machine unless you configured a remote provider.
            </p>
          </div>
          <Progress value={null} detail={submitDetail ?? "working…"} label="Examiner" />
        </div>
      </Modal>

      {submitError && !submitting && (
        <Modal
          open
          onClose={() => navigate(`/writing/mock/report/${mockId}`)}
          size="sm"
          title="One of the two answers could not be marked"
          footer={
            <Button onClick={() => navigate(`/writing/mock/report/${mockId}`)}>
              Open what there is
            </Button>
          }
        >
          <p className="p-5 text-[13px] leading-6 text-muted-foreground">
            {submitError} The report opens on whatever was marked; there is no combined estimate
            without both.
          </p>
        </Modal>
      )}
    </div>
  );
}

export default MockSitting;

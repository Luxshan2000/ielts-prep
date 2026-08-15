/**
 * `/reading/mock/sitting/:attemptId` — the hour itself.
 *
 * Deliberately not the practice player. It shares the store, the passage pane and
 * the question renderers, but it is a different room: no pause, no dictionary, no
 * strategy card, no explanation, nothing to open in another tab. The only two things
 * that survive from the practice screens are highlighting and notes, because
 * computer-delivered IELTS has both and removing them would make this less like the
 * test rather than more.
 *
 * **The clock is wall-clock.** The attempt's own timer only advances while this
 * screen is mounted, so on every open the remaining time is reconciled against the
 * moment the sitting started. Closing the window does not buy minutes.
 *
 * Fully operable from the keyboard: Alt+←/→ move between questions, Alt+1…3 switch
 * passage, Ctrl/Cmd+Shift+F flags, Ctrl/Cmd+Enter submits.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Flag, Send, ShieldAlert } from "lucide-react";
import {
  Badge,
  Button,
  CircularTimer,
  Drawer,
  EmptyState,
  Progress,
  QuestionPalette,
  Skeleton,
  useConfirm,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import {
  answeredCount,
  numberWindow,
  paletteStatus,
  questionDomId,
  visibleNotes,
  type FlatQuestion,
} from "../../model";
import { useReadingStore } from "../../store";
import { PassagePane, type LocateRequest } from "../PassagePane";
import { QuestionGroupCard } from "../QuestionGroupCard";
import { MOCK_SECONDS, checkpoints } from "./script";
import { elapsedOf, useMockStore } from "./store";

export function MockSitting() {
  const { attemptId = "" } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const attempt = useReadingStore((s) => s.attempt);
  const status = useReadingStore((s) => s.attemptStatus);
  const error = useReadingStore((s) => s.attemptError);
  const answers = useReadingStore((s) => s.answers);
  const flags = useReadingStore((s) => s.flags);
  const highlights = useReadingStore((s) => s.highlights);
  const notes = useReadingStore((s) => s.notes);
  const lookedUp = useReadingStore((s) => s.lookedUp);
  const timerRemaining = useReadingStore((s) => s.timerRemaining);
  const current = useReadingStore((s) => s.current);
  const activePassage = useReadingStore((s) => s.activePassage);
  const submitting = useReadingStore((s) => s.submitting);
  const submitError = useReadingStore((s) => s.submitError);
  const result = useReadingStore((s) => s.result);

  const resumeAttempt = useReadingStore((s) => s.resumeAttempt);
  const setAnswer = useReadingStore((s) => s.setAnswer);
  const setAnswers = useReadingStore((s) => s.setAnswers);
  const toggleFlag = useReadingStore((s) => s.toggleFlag);
  const addHighlight = useReadingStore((s) => s.addHighlight);
  const removeHighlight = useReadingStore((s) => s.removeHighlight);
  const setNote = useReadingStore((s) => s.setNote);
  const addLookedUp = useReadingStore((s) => s.addLookedUp);
  const setCurrent = useReadingStore((s) => s.setCurrent);
  const setActivePassage = useReadingStore((s) => s.setActivePassage);
  const syncTimer = useReadingStore((s) => s.syncTimer);
  const tick = useReadingStore((s) => s.tick);
  const submitAttempt = useReadingStore((s) => s.submitAttempt);

  const recordFor = useMockStore((s) => s.recordFor);
  const finish = useMockStore((s) => s.finish);
  const record = useMemo(() => recordFor(attemptId), [attemptId, recordFor]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [locate, setLocate] = useState<LocateRequest | null>(null);
  const reconciled = useRef<string | null>(null);

  // ---------------------------------------------------------------- lifecycle ---

  useEffect(() => {
    if (attemptId) void resumeAttempt(attemptId);
  }, [attemptId, resumeAttempt]);

  useEffect(() => {
    const id = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(id);
  }, [tick]);

  // Flush anything queued when the sitting unmounts.
  useEffect(() => () => void useReadingStore.getState().flushSave(), []);

  /**
   * Wall-clock reconciliation, once per attempt. The sidecar checkpoints the timer
   * every fifteen seconds while the player is open, so an hour "paused" by closing
   * the window would otherwise reopen with the time it had when it was left.
   */
  useEffect(() => {
    if (!record || !attempt || attempt.id !== attemptId) return;
    if (attempt.status !== "in_progress") return;
    if (reconciled.current === attemptId) return;
    reconciled.current = attemptId;
    const wall = Math.max(0, MOCK_SECONDS - elapsedOf(record));
    if (wall <= 0) {
      void submitAttempt({ auto: true });
      return;
    }
    syncTimer(wall);
  }, [attempt, attemptId, record, submitAttempt, syncTimer]);

  // Marking is done: close the sitting record and go to the report.
  useEffect(() => {
    if (result && result.attempt_id === attemptId) {
      finish(attemptId, "submitted");
      navigate(`/reading/mock/report/${attemptId}`, { replace: true });
    }
  }, [attemptId, finish, navigate, result]);

  // Reopening a sitting that was already marked belongs on the report, not here.
  useEffect(() => {
    if (attempt?.id === attemptId && attempt.status === "submitted" && !result) {
      navigate(`/reading/mock/report/${attemptId}`, { replace: true });
    }
  }, [attempt, attemptId, navigate, result]);

  // -------------------------------------------------------------- derivations ---

  const questions = attempt?.questions ?? [];
  const window_ = useMemo(() => numberWindow(questions), [questions]);
  const statuses = useMemo(
    () => paletteStatus(questions, answers, flags),
    [questions, answers, flags],
  );
  const answered = useMemo(() => answeredCount(questions, answers), [questions, answers]);
  const passage = attempt?.passages[activePassage] ?? null;
  const groups = passage?.question_groups ?? [];
  const elapsed = MOCK_SECONDS - timerRemaining;
  const marks = useMemo(
    () => checkpoints(record?.format ?? attempt?.format ?? "academic"),
    [attempt?.format, record?.format],
  );
  const behind = marks.filter((mark) => elapsed >= mark).length;

  const jumpTo = useCallback(
    (number: number) => {
      const target =
        questions.find((q) => q.number === number) ??
        questions.reduce<FlatQuestion | null>((best, q) => {
          if (!best) return q;
          return Math.abs(q.number - number) < Math.abs(best.number - number) ? q : best;
        }, null);
      if (!target) return;
      setCurrent(target.number);
      if (target.anchor) {
        setLocate({ paragraphId: target.anchor, quote: null, nonce: Date.now() });
      }
      window.requestAnimationFrame(() => {
        document
          .getElementById(questionDomId(target.number))
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [questions, setCurrent],
  );

  const doSubmit = useCallback(
    async (auto = false) => {
      if (!attempt) return;
      if (!auto) {
        const blank = questions.length - answered;
        const ok = await confirm({
          title: "Hand the paper in?",
          message: (
            <span>
              {blank > 0
                ? `${blank} of ${questions.length} questions are still blank, and a blank scores nothing while a guess sometimes does.`
                : `All ${questions.length} questions are answered.`}{" "}
              Marking is immediate and the paper cannot be reopened.
            </span>
          ),
          confirmLabel: "Hand it in",
        });
        if (!ok) return;
      }
      await submitAttempt({ auto });
    },
    [answered, attempt, confirm, questions.length, submitAttempt],
  );

  const abandon = useCallback(async () => {
    const ok = await confirm({
      title: "Abandon this mock?",
      message: (
        <span>
          Your answers stay saved, but the sitting is recorded as abandoned and it is not marked.
          The clock does not stop — if you come back to it, the time you were away has gone.
        </span>
      ),
      confirmLabel: "Abandon it",
    });
    if (!ok) return;
    await useReadingStore.getState().flushSave();
    finish(attemptId, "abandoned");
    navigate("/reading/mock");
  }, [attemptId, confirm, finish, navigate]);

  // ----------------------------------------------------------------- keyboard ---

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!attempt || attempt.status !== "in_progress") return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key === "Enter") {
        event.preventDefault();
        void doSubmit(false);
        return;
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (current !== null) toggleFlag(current);
        return;
      }
      if (!event.altKey) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const index = questions.findIndex((q) => q.number === current);
        const next = event.key === "ArrowRight" ? index + 1 : index - 1;
        const target = questions[Math.max(0, Math.min(next, questions.length - 1))];
        if (target) jumpTo(target.number);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (index < (attempt.passages.length || 0)) {
          event.preventDefault();
          setActivePassage(index);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [attempt, current, doSubmit, jumpTo, questions, setActivePassage, toggleFlag]);

  // ------------------------------------------------------------------ states ---

  if (status === "loading" || status === "idle") {
    return (
      <PageShell title="Mock reading paper" description="Opening the paper…">
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      </PageShell>
    );
  }

  if (status === "error" || !attempt) {
    return (
      <PageShell title="Mock reading paper" description="This sitting could not be opened.">
        <EmptyState
          icon={AlertTriangle}
          title="The paper is not available"
          description={error ?? "BandReady has no record of this attempt. It may have been cleared from Settings, or the local service was restarted before it saved."}
          action={<Button onClick={() => navigate("/reading/mock")}>Back to the mock room</Button>}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      bleed
      maxWidth="max-w-none"
      title={record?.testTitle ?? attempt.title}
      description="Exam conditions. No dictionary, no coaching, no pause — 60 minutes including writing your answers down."
      status={
        <CircularTimer
          totalSec={MOCK_SECONDS}
          remainingSec={timerRemaining}
          warnAtSec={300}
          label="Mock reading paper"
        />
      }
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            {flags.length > 0 ? `${flags.length} flagged` : "Flags"}
          </Button>
          <Button size="sm" loading={submitting} onClick={() => void doSubmit(false)}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Hand it in
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void abandon()}>
            Abandon
          </Button>
        </div>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-4">
          <Progress
            className="max-w-md"
            value={questions.length ? (answered / questions.length) * 100 : 0}
            label="Answered"
            detail={`${answered} / ${questions.length}`}
            tone={answered === questions.length ? "success" : "primary"}
          />
          <Badge tone="warning">
            <ShieldAlert className="mr-1 h-3 w-3" aria-hidden="true" />
            Exam conditions
          </Badge>
          <span className="text-[11px] tabular text-muted-foreground">
            {formatDuration(Math.max(0, elapsed))} elapsed · you should be on{" "}
            {record?.format === "general_training" ? "section" : "passage"} {behind + 1}
          </span>
          {lookedUp.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {lookedUp.length} word{lookedUp.length === 1 ? "" : "s"} queued for after the paper
            </span>
          )}
          {submitError && (
            <span role="alert" className="text-[11px] text-destructive">
              Submit failed: {submitError}
            </span>
          )}
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {passage && (
            <div className="min-h-0 border-b border-border lg:w-1/2 lg:border-b-0 lg:border-r">
              <PassagePane
                passage={passage}
                highlights={highlights}
                notes={notes}
                locate={locate}
                toolsEnabled
                /* The dictionary is off; a double-clicked word queues silently. */
                lookupEnabled={false}
                onAddHighlight={addHighlight}
                onRemoveHighlight={removeHighlight}
                onSetNote={setNote}
                onLookedUp={addLookedUp}
              />
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-4 px-5 py-5">
                {groups.length === 0 ? (
                  <EmptyState
                    icon={AlertTriangle}
                    title="This passage has no questions"
                    description="The installed content pack stores this passage without a question set."
                  />
                ) : (
                  groups.map((group) => (
                    <QuestionGroupCard
                      key={group.id}
                      group={group}
                      answers={answers}
                      flags={flags}
                      current={current}
                      onAnswer={setAnswer}
                      onAnswers={setAnswers}
                      onToggleFlag={toggleFlag}
                      onFocusQuestion={setCurrent}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-border bg-background/95 px-5 py-2.5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            {attempt.passages.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  {record?.format === "general_training" ? "Section" : "Passage"}
                </span>
                {attempt.passages.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={index === activePassage}
                    aria-label={`Go to passage ${index + 1}: ${item.title}`}
                    onClick={() => setActivePassage(index)}
                    className={cn(
                      "h-7 w-7 rounded-md text-[13px] font-medium tabular transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      index === activePassage
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )}
            <QuestionPalette
              className="min-w-0 flex-1"
              count={window_.end - window_.start + 1}
              startAt={window_.start}
              current={current ?? window_.start}
              status={statuses}
              onJump={jumpTo}
            />
          </div>
        </footer>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Flags and notes">
        <div className="space-y-5 p-5">
          <section>
            <h3 className="mb-2 text-[13px] font-semibold">Flagged questions</h3>
            {flags.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nothing flagged. Flag anything you guessed — at 58 minutes these are the ones to
                come back to.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {flags.map((number) => (
                  <Button
                    key={number}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDrawerOpen(false);
                      jumpTo(number);
                    }}
                  >
                    Q{number}
                  </Button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold">Notes ({visibleNotes(notes).length})</h3>
            {visibleNotes(notes).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Use the note button beside any paragraph marker.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {visibleNotes(notes).map(([key, value]) => (
                  <li key={key} className="rounded-lg border border-border p-2 text-[12px]">
                    <span className="mr-1.5 font-semibold text-primary">{key.split(":").pop()}</span>
                    {value}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold">Keyboard</h3>
            <ul className="space-y-1 text-[12px] text-muted-foreground">
              <li>Alt + ← / → — previous or next question</li>
              <li>Alt + 1…3 — switch passage</li>
              <li>Ctrl/Cmd + Shift + F — flag the current question</li>
              <li>Ctrl/Cmd + Enter — hand the paper in</li>
            </ul>
          </section>
        </div>
      </Drawer>
    </PageShell>
  );
}

export default MockSitting;

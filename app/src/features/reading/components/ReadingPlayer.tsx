import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Flag,
  Highlighter,
  Pause,
  Play,
  Send,
  StickyNote,
} from "lucide-react";
import {
  Badge,
  Button,
  CircularTimer,
  Drawer,
  EmptyState,
  Progress,
  Skeleton,
  useConfirm,
} from "@/components/ui";
import { PaletteFooter } from "@/components/practice/PaletteFooter";
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
} from "../model";
import { useReadingStore } from "../store";
import { DrillPane } from "./DrillPane";
import { PassagePane, type LocateRequest } from "./PassagePane";
import { QuestionGroupCard } from "./QuestionGroupCard";

const MIN_SPLIT = 30;
const MAX_SPLIT = 70;

function SaveIndicator({
  status,
  savedAt,
  error,
  onRetry,
}: {
  status: "idle" | "saving" | "saved" | "error";
  savedAt: string | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        title={error ?? "Autosave failed"}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-destructive hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
        Not saved: retry
      </button>
    );
  }
  if (status === "saving") {
    return <span className="text-[11px] text-muted-foreground">Saving…</span>;
  }
  if (status === "saved" && savedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        Saved
      </span>
    );
  }
  return null;
}

/**
 * The timed reading test player (06 §5): passage left, questions right, one
 * global timer that auto-submits at zero, and a question palette that jumps to
 * the question AND scrolls the passage to its anchor paragraph.
 *
 * Keyboard: Alt+←/→ previous/next question, Alt+1…3 switch passage,
 * Ctrl/Cmd+Enter submit, Ctrl/Cmd+Shift+F flag the current question.
 */
export function ReadingPlayer() {
  const { attemptId = "" } = useParams();
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
  const timerTotal = useReadingStore((s) => s.timerTotal);
  const timerRemaining = useReadingStore((s) => s.timerRemaining);
  const elapsed = useReadingStore((s) => s.elapsed);
  const paused = useReadingStore((s) => s.paused);
  const current = useReadingStore((s) => s.current);
  const activePassage = useReadingStore((s) => s.activePassage);
  const saveStatus = useReadingStore((s) => s.saveStatus);
  const saveError = useReadingStore((s) => s.saveError);
  const savedAt = useReadingStore((s) => s.savedAt);
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
  const setPaused = useReadingStore((s) => s.setPaused);
  const tick = useReadingStore((s) => s.tick);
  const flushSave = useReadingStore((s) => s.flushSave);
  const submitAttempt = useReadingStore((s) => s.submitAttempt);

  const [split, setSplit] = useState(50);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [locate, setLocate] = useState<LocateRequest | null>(null);
  const dragging = useRef(false);

  // ---------------------------------------------------------------- lifecycle ---

  useEffect(() => {
    if (!attemptId) return;
    void resumeAttempt(attemptId);
  }, [attemptId, resumeAttempt]);

  useEffect(() => {
    const id = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(id);
  }, [tick]);

  // Flush anything queued when the player unmounts (navigating away mid-test).
  useEffect(() => () => void useReadingStore.getState().flushSave(), []);

  // Only ever follow the result that belongs to THIS attempt — a stale record
  // from a previous attempt must not hijack the route.
  useEffect(() => {
    if (result && result.attempt_id === attemptId) {
      navigate(`/reading/review/${result.attempt_id}`, { replace: true });
    }
  }, [result, attemptId, navigate]);

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
  const timed = timerTotal > 0;

  const jumpTo = useCallback(
    (number: number) => {
      // A palette cell can point at a gap (numbers are contiguous per test but a
      // drill or a single passage may start elsewhere) — snap to the nearest real
      // question instead of doing nothing.
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
        const flagged = flags.length;
        const ok = await confirm({
          title: "Submit this attempt?",
          message: (
            <span>
              {blank > 0
                ? `${blank} of ${questions.length} questions are still blank`
                : `All ${questions.length} questions are answered`}
              {flagged > 0 ? `, and ${flagged} are flagged for review` : ""}. Marking is immediate
              and the attempt cannot be reopened.
            </span>
          ),
          confirmLabel: "Submit for marking",
        });
        if (!ok) return;
      }
      await submitAttempt({ auto });
    },
    [answered, attempt, confirm, flags.length, questions.length, submitAttempt],
  );

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

  // -------------------------------------------------------------- split drag ---

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!dragging.current) return;
      const pct = (event.clientX / window.innerWidth) * 100;
      setSplit(Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, pct)));
    }
    function onUp() {
      dragging.current = false;
      document.body.style.removeProperty("cursor");
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // ------------------------------------------------------------------ states ---

  if (status === "loading" || status === "idle") {
    return (
      <PageShell
        title="Reading"
        description="Opening your attempt…"
        back={{ to: "/reading", label: "Reading" }}
      >
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
      <PageShell
        title="Reading"
        description="This attempt could not be opened."
        back={{ to: "/reading", label: "Reading" }}
      >
        <EmptyState
          icon={AlertTriangle}
          title="The attempt is not available"
          description={
            error ??
            "BandReady has no record of this attempt. It may have been cleared from Settings, or the local service was restarted before it saved."
          }
          action={
            <Button variant="outline" onClick={() => navigate("/reading")}>
              Start a new attempt
            </Button>
          }
        />
      </PageShell>
    );
  }

  const isDrill = attempt.mode === "drill" && attempt.drill !== null;
  const submitted = attempt.status === "submitted";

  const questionsColumn = (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-4 px-5 py-5">
        {isDrill && attempt.drill ? (
          <DrillPane
            qtype={attempt.drill.qtype}
            items={attempt.drill.items}
            answers={answers}
            flags={flags}
            current={current}
            disabled={submitted}
            onAnswer={setAnswer}
            onToggleFlag={toggleFlag}
            onFocusQuestion={setCurrent}
          />
        ) : groups.length === 0 ? (
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
              disabled={submitted}
              onAnswer={setAnswer}
              onAnswers={setAnswers}
              onToggleFlag={toggleFlag}
              onFocusQuestion={setCurrent}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <PageShell
      bleed
      maxWidth="max-w-none"
      title={attempt.title}
      description={
        isDrill
          ? "Question-type drill. No band score, and the explanations come as soon as you submit."
          : attempt.examConditions
            ? "Exam conditions: no pausing, dictionary off."
            : "Practice attempt. Pause any time; everything autosaves."
      }
      status={
        <div className="flex items-center gap-2">
          <SaveIndicator
            status={saveStatus}
            savedAt={savedAt}
            error={saveError}
            onRetry={() => void flushSave()}
          />
          {timed ? (
            <CircularTimer
              totalSec={timerTotal}
              remainingSec={timerRemaining}
              warnAtSec={Math.min(600, Math.round(timerTotal / 6))}
              paused={paused}
              label="Reading attempt"
            />
          ) : (
            <span className="rounded-lg border border-border px-2.5 py-1 text-[13px] tabular text-muted-foreground">
              Untimed · {formatDuration(elapsed)}
            </span>
          )}
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          {timed && !attempt.examConditions && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? "Resume the timer" : "Pause the timer"}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
            <Flag className="h-3.5 w-3.5" />
            {flags.length > 0 ? `${flags.length} flagged` : "Flags"}
          </Button>
          <Button size="sm" loading={submitting} disabled={submitted} onClick={() => void doSubmit(false)}>
            <Send className="h-3.5 w-3.5" />
            Submit
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
          {paused && <Badge tone="warning">Paused</Badge>}
          {attempt.examConditions && <Badge tone="outline">Exam conditions</Badge>}
          {attempt.examConditions && lookedUp.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {lookedUp.length} word{lookedUp.length === 1 ? "" : "s"} queued for after the test
            </span>
          )}
          {submitError && (
            <span className="text-[11px] text-destructive">Submit failed: {submitError}</span>
          )}
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {paused && (
          <div className="border-b border-border bg-warning/10 px-5 py-2 text-[13px] text-foreground">
            Timer paused. The passage stays visible so you can read without the clock. Resume when
            you are ready.
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {!isDrill && passage && (
            <>
              <div
                className="min-h-0 border-b border-border lg:border-b-0 lg:border-r"
                style={{ flexBasis: `${split}%`, flexGrow: 0, flexShrink: 0 }}
              >
                <PassagePane
                  passage={passage}
                  highlights={highlights}
                  notes={notes}
                  locate={locate}
                  toolsEnabled={!submitted}
                  lookupEnabled={!submitted && !attempt.examConditions}
                  onAddHighlight={addHighlight}
                  onRemoveHighlight={removeHighlight}
                  onSetNote={setNote}
                  onLookedUp={addLookedUp}
                />
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize the passage pane"
                aria-valuenow={Math.round(split)}
                aria-valuemin={MIN_SPLIT}
                aria-valuemax={MAX_SPLIT}
                tabIndex={0}
                onPointerDown={() => {
                  dragging.current = true;
                  document.body.style.cursor = "col-resize";
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    setSplit((value) => Math.max(MIN_SPLIT, value - 2));
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    setSplit((value) => Math.min(MAX_SPLIT, value + 2));
                  }
                }}
                className={cn(
                  "hidden w-1.5 shrink-0 cursor-col-resize bg-border transition-colors lg:block",
                  "hover:bg-primary/50 focus-visible:outline-none focus-visible:bg-primary",
                )}
              />
            </>
          )}
          {/* `min-w-0` is load-bearing, not tidiness. The passage pane above is
              `flex-shrink: 0` at its dragged basis, so without it this column keeps its
              min-content width — set by the widest answer box in a note/summary
              skeleton — and the overflow escapes as a horizontal scrollbar on the whole
              page. At the app's own 1024px minimum window it does that at the default
              50/50 split, before the learner drags anything. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{questionsColumn}</div>
        </div>

        <PaletteFooter
          count={window_.end - window_.start + 1}
          startAt={window_.start}
          current={current ?? window_.start}
          status={statuses}
          onJump={jumpTo}
          leading={
            !isDrill && attempt.passages.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Passage</span>
                {attempt.passages.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={index === activePassage}
                    aria-label={`Passage ${index + 1}: ${item.title}`}
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
            ) : undefined
          }
        />
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Flags, highlights and notes"
      >
        <div className="space-y-5 p-5">
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              Flagged questions
            </h3>
            {flags.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nothing flagged. Use the flag button on a question, or Ctrl/Cmd+Shift+F.
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
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
              <Highlighter className="h-3.5 w-3.5" aria-hidden="true" />
              Highlights ({highlights.length})
            </h3>
            {highlights.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Select any passage text to highlight it.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {highlights.map((highlight, index) => (
                  <li
                    key={`${highlight.paragraph_id}-${highlight.start_offset}-${index}`}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border p-2"
                  >
                    <span className="min-w-0 text-[12px]">
                      <span className="mr-1.5 font-semibold text-primary">
                        {highlight.paragraph_id}
                      </span>
                      {highlight.quote ?? "(highlighted text)"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeHighlight(index)}
                      aria-label={`Remove highlight in paragraph ${highlight.paragraph_id}`}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
              <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
              Notes
            </h3>
            {visibleNotes(notes).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Use the note button beside any paragraph marker.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {visibleNotes(notes).map(([key, value]) => (
                  <li key={key} className="rounded-lg border border-border p-2 text-[12px]">
                    <span className="mr-1.5 font-semibold text-primary">
                      {key.split(":").pop()}
                    </span>
                    {value}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Drawer>
    </PageShell>
  );
}

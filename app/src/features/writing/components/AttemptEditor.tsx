/**
 * The writing desk (05 §3). Distraction-free: a slim bar, the prompt, the text.
 *
 * Behaviours that are contractual rather than cosmetic:
 *   - autosave every 10 s while dirty, plus on blur, on tab-hide and on exit;
 *   - paste is never blocked, always counted, and the count rides the autosave;
 *   - exam mode counts down, records overtime, and offers no assistance at all
 *     (no spellcheck, no phrase help, no grammar hints);
 *   - pre-checks run before the model is called; blocks return here, warnings
 *     offer "Submit anyway".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Library, Send } from "lucide-react";
import { Badge, Button, Drawer, Modal, Progress } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  TASK_LABELS,
  TASK_MIN_WORDS,
  countEssayWords,
  genreLabel,
  useWritingStore,
  type PrecheckReport,
  type WritingAttempt,
} from "../store";
import { AttemptTimer, SaveIndicator, WordCount } from "./EditorStatus";
import { OutlineScratchpad } from "./OutlineScratchpad";
import { PrecheckModal } from "./PrecheckModal";
import { PromptPanel } from "./PromptPanel";
import { RewriteReference } from "./RewriteReference";
import { TemplatesPanel } from "./TemplatesPanel";

const AUTOSAVE_MS = 10_000;

export function AttemptEditor({ attempt }: { attempt: WritingAttempt }) {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const essay = useWritingStore((s) => s.essay);
  const outline = useWritingStore((s) => s.outline);
  const secondsElapsed = useWritingStore((s) => s.secondsElapsed);
  const pasteEvents = useWritingStore((s) => s.pasteEvents);
  const dirty = useWritingStore((s) => s.dirty);
  const saving = useWritingStore((s) => s.saving);
  const savedAt = useWritingStore((s) => s.savedAt);
  const saveError = useWritingStore((s) => s.saveError);
  const setEssay = useWritingStore((s) => s.setEssay);
  const setOutline = useWritingStore((s) => s.setOutline);
  const recordPaste = useWritingStore((s) => s.recordPaste);
  const tick = useWritingStore((s) => s.tick);
  const save = useWritingStore((s) => s.save);

  const prechecking = useWritingStore((s) => s.prechecking);
  const runPrecheck = useWritingStore((s) => s.runPrecheck);
  const clearPrecheck = useWritingStore((s) => s.clearPrecheck);
  const submitting = useWritingStore((s) => s.submitting);
  const submitPct = useWritingStore((s) => s.submitPct);
  const submitDetail = useWritingStore((s) => s.submitDetail);
  const submitError = useWritingStore((s) => s.submitError);
  const clearSubmitError = useWritingStore((s) => s.clearSubmitError);
  const submit = useWritingStore((s) => s.submit);

  /**
   * The pre-check modal is local rather than driven off `store.precheck`: a
   * passing report must go straight to the model, and rendering the modal for the
   * frame between "report arrived" and "submit started" would flash it.
   */
  const [gate, setGate] = useState<PrecheckReport | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);

  const prompt = attempt.prompt;
  const exam = attempt.mode === "exam";
  const minWords = attempt.min_words ?? prompt?.min_words ?? TASK_MIN_WORDS[prompt?.task_type ?? "task2"];
  const limitSec = attempt.time_limit_s ?? prompt?.time_limit_s ?? 40 * 60;
  const words = countEssayWords(essay);

  // ---- timer: one tick per second while the draft is open -------------------
  useEffect(() => {
    const handle = window.setInterval(() => tick(1), 1000);
    return () => window.clearInterval(handle);
  }, [tick]);

  // ---- autosave every 10 s while dirty -------------------------------------
  useEffect(() => {
    const handle = window.setInterval(() => void useWritingStore.getState().save(), AUTOSAVE_MS);
    return () => window.clearInterval(handle);
  }, []);

  // ---- flush on tab-hide, window close and unmount -------------------------
  useEffect(() => {
    const flush = () => void useWritingStore.getState().save();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [attempt.id]);

  // ---- submit path ---------------------------------------------------------
  const beginSubmit = useCallback(async () => {
    clearSubmitError();
    const report = await runPrecheck();
    if (!report) return;
    if (report.verdict === "pass") {
      clearPrecheck();
      await submit();
      return;
    }
    setGate(report);
  }, [clearPrecheck, clearSubmitError, runPrecheck, submit]);

  const closeGate = useCallback(() => {
    setGate(null);
    clearPrecheck();
  }, [clearPrecheck]);

  const submitAnyway = useCallback(async () => {
    closeGate();
    await submit({ acknowledgeWarnings: true });
  }, [closeGate, submit]);

  // ---- shortcuts: ⌘/Ctrl+S saves, ⌘/Ctrl+Enter submits ---------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "s") {
        event.preventDefault();
        void save();
      } else if (event.key === "Enter") {
        event.preventDefault();
        void beginSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginSubmit, save]);

  const exit = async () => {
    await save();
    navigate("/writing");
  };

  const busy = prechecking || submitting;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* slim top bar (05 §3: no nav chrome beyond this) */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background/90 px-3 py-2 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => void exit()} disabled={submitting}>
          <ArrowLeft className="h-4 w-4" />
          Exit
        </Button>

        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-foreground">
            {prompt ? TASK_LABELS[prompt.task_type] : "Writing attempt"}
          </span>
          {prompt && <Badge tone="outline">{genreLabel(prompt.genre)}</Badge>}
          <Badge tone={exam ? "primary" : "default"}>{exam ? "Exam conditions" : "Practice"}</Badge>
          {attempt.parent_attempt_id && <Badge tone="warning">Rewrite</Badge>}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SaveIndicator saving={saving} dirty={dirty} savedAt={savedAt} error={saveError} />
          <WordCount words={words} minWords={minWords} />
          <AttemptTimer mode={attempt.mode} elapsed={secondsElapsed} limitSec={limitSec} />
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setPromptOpen(true)}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Prompt
          </Button>
          {!exam && (
            <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
              <Library className="h-3.5 w-3.5" />
              Phrase help
            </Button>
          )}
          {!exam && attempt.parent && (
            <Button variant="outline" size="sm" onClick={() => setReferenceOpen(true)}>
              Previous feedback
            </Button>
          )}
          <Button size="sm" loading={busy} onClick={() => void beginSubmit()}>
            <Send className="h-3.5 w-3.5" />
            Submit
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
        {/* prompt column */}
        {prompt && (
          <aside className="scrollbar-thin hidden w-[22rem] shrink-0 overflow-y-auto border-r border-border p-4 lg:block xl:w-[26rem]">
            <PromptPanel prompt={prompt} />
          </aside>
        )}

        {/* writing column */}
        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[76ch] space-y-4 px-4 py-6">
            <label htmlFor="writing-essay" className="sr-only">
              Your answer
            </label>
            <textarea
              ref={textareaRef}
              id="writing-essay"
              value={essay}
              onChange={(event) => setEssay(event.target.value)}
              onBlur={() => void save()}
              onPaste={(event) => {
                // Paste is a learner's own tool: recorded, never prevented (05 §3).
                const pasted = event.clipboardData?.getData("text") ?? "";
                if (pasted) recordPaste(countEssayWords(pasted));
              }}
              spellCheck={!exam}
              autoCorrect={exam ? "off" : "on"}
              autoCapitalize={exam ? "off" : "sentences"}
              /* keeps third-party grammar overlays out of exam conditions */
              data-gramm={exam ? "false" : undefined}
              data-gramm_editor={exam ? "false" : undefined}
              data-enable-grammarly={exam ? "false" : undefined}
              placeholder={
                prompt?.task_type === "gt_task1"
                  ? "Dear …"
                  : "Start with a sentence that paraphrases the task in your own words."
              }
              className={cn(
                "min-h-[60vh] w-full resize-none rounded-lg border-0 bg-transparent p-0 text-[16px] leading-8 text-foreground",
                "placeholder:text-muted-foreground/70 focus:outline-none focus-visible:outline-none",
              )}
            />

            <OutlineScratchpad
              value={outline}
              onChange={setOutline}
              open={outlineOpen}
              onToggle={() => setOutlineOpen((v) => !v)}
            />

            <p className="pb-6 text-[11px] text-muted-foreground">
              Autosaved every 10 seconds. Pasting is allowed and counted —{" "}
              {pasteEvents > 0
                ? `${pasteEvents} paste${pasteEvents === 1 ? "" : "s"} so far.`
                : "no pastes so far."}{" "}
              {exam
                ? "Exam conditions: spellcheck and phrase help are off."
                : "Practice mode: spellcheck is on."}
            </p>
          </div>
        </div>
      </div>

      {/* narrow-screen prompt */}
      {prompt && (
        <Drawer
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          title="The prompt"
          width="max-w-lg"
          side="left"
        >
          <div className="p-4">
            <PromptPanel prompt={prompt} />
          </div>
        </Drawer>
      )}

      {/* practice-mode phrase help (05 §9) */}
      {!exam && (
        <Drawer
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          title="Frameworks and phrases"
          width="max-w-xl"
        >
          <div className="p-4">
            <TemplatesPanel dense />
          </div>
        </Drawer>
      )}

      {/* rewrite reference panel (05 §8.2) — practice mode only */}
      {!exam && attempt.parent && (
        <Drawer
          open={referenceOpen}
          onClose={() => setReferenceOpen(false)}
          title="Your previous attempt"
          width="max-w-xl"
        >
          <div className="p-4">
            <RewriteReference parent={attempt.parent} />
          </div>
        </Drawer>
      )}

      <PrecheckModal
        report={gate}
        submitting={submitting}
        onClose={closeGate}
        onSubmitAnyway={() => void submitAnyway()}
      />

      {/* marking progress (18 §3 job convention) */}
      <Modal open={submitting} onClose={() => undefined} size="sm">
        <div className="space-y-4 p-6">
          <div>
            <p className="text-sm font-semibold text-foreground">Marking your answer</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              One call to your configured examiner model. This stays on your machine unless you
              configured a remote provider.
            </p>
          </div>
          <Progress value={submitPct} detail={submitDetail ?? "working…"} label="Examiner" />
        </div>
      </Modal>

      {submitError && !submitting && (
        <Modal
          open
          onClose={clearSubmitError}
          size="sm"
          title="That answer couldn't be marked"
          footer={
            <>
              <Button variant="ghost" onClick={clearSubmitError}>
                Back to the editor
              </Button>
              <Button onClick={() => void submit({ acknowledgeWarnings: true })}>Try again</Button>
            </>
          }
        >
          <p className="p-5 text-[13px] leading-6 text-muted-foreground">{submitError}</p>
        </Modal>
      )}
    </div>
  );
}

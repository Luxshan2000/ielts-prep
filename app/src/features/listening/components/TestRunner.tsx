import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Clock,
  Eye,
  Headphones,
  Lock,
  Play,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
  Tabs,
  useConfirm,
  type QuestionStatus,
} from "@/components/ui";
import { PaletteFooter } from "@/components/practice/PaletteFooter";
import { PageShell } from "@/components/shell/PageShell";
import { api, ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { isAnswered, useListeningStore } from "../store";
import type { AttemptMode, ListeningPart, TimingDoc } from "../types";
import { AnswerSheet } from "./AnswerSheet";
import { CheckStep } from "./CheckStep";
import { PartPlayer } from "./PartPlayer";
import { PrepareAudioPanel } from "./PrepareAudioPanel";
import { SpellingNotice } from "./SpellingNotice";
import { TranscriptPanel } from "./TranscriptPanel";

type Phase = "brief" | "running" | "check";

interface RevealedPart {
  lines: { index: number; speaker: string | null; text: string; start_ms: number | null }[];
  /** question number -> accepted variants, for the in-transcript highlight. */
  accepted: Record<number, string[]>;
  cueByNumber: Record<number, number | null>;
}

/**
 * The listening test player: brief → audio + answer sheet → check step → review.
 *
 * Serves both `/listening/test/:testId` (a full four-part test) and
 * `/listening/part/:scriptId` (one part, practice only).
 */
export function TestRunner() {
  const { testId, scriptId } = useParams<{ testId?: string; scriptId?: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const requestedMode: AttemptMode = search.get("mode") === "exam" ? "exam" : "practice";
  const exam = requestedMode === "exam";

  const detail = useListeningStore((s) => s.detail);
  const detailLoading = useListeningStore((s) => s.detailLoading);
  const detailError = useListeningStore((s) => s.detailError);
  const loadTest = useListeningStore((s) => s.loadTest);
  const loadScript = useListeningStore((s) => s.loadScript);
  const attempt = useListeningStore((s) => s.attempt);
  const starting = useListeningStore((s) => s.starting);
  const startError = useListeningStore((s) => s.startError);
  const startAttempt = useListeningStore((s) => s.startAttempt);
  const setAnswer = useListeningStore((s) => s.setAnswer);
  const setCurrentPart = useListeningStore((s) => s.setCurrentPart);
  const notePlayed = useListeningStore((s) => s.notePlayed);
  const revealPartInStore = useListeningStore((s) => s.revealPart);
  const tick = useListeningStore((s) => s.tick);
  const flush = useListeningStore((s) => s.flush);
  const submit = useListeningStore((s) => s.submit);
  const submitting = useListeningStore((s) => s.submitting);
  const submitError = useListeningStore((s) => s.submitError);
  const saveError = useListeningStore((s) => s.saveError);
  const abandon = useListeningStore((s) => s.abandon);
  const resetAttempt = useListeningStore((s) => s.resetAttempt);

  const [phase, setPhase] = useState<Phase>("brief");
  const [playIndex, setPlayIndex] = useState(0);
  const [viewIndex, setViewIndex] = useState(0);
  const [activeNumber, setActiveNumber] = useState(0);
  const [autoStart, setAutoStart] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, RevealedPart>>({});
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  const questionRefs = useRef(new Map<number, HTMLDivElement>());
  const seekRef = useRef<((ms: number) => void) | null>(null);

  const targetId = testId ?? scriptId ?? "";
  const isTest = Boolean(testId);

  // ------------------------------------------------------------- data load --
  useEffect(() => {
    if (!targetId) return;
    if (detail?.id === targetId) return;
    void (isTest ? loadTest(targetId) : loadScript(targetId));
  }, [targetId, isTest, detail?.id, loadTest, loadScript]);

  // Resume an attempt that is already open for this material.
  useEffect(() => {
    if (!attempt || attempt.submitted) return;
    const matches = isTest ? attempt.testId === targetId : attempt.scriptId === targetId;
    if (matches && phase === "brief") setPhase("running");
  }, [attempt, isTest, targetId, phase]);

  // Elapsed-time clock; the sidecar owns durability, this only feeds autosave.
  useEffect(() => {
    if (phase === "brief" || !attempt || attempt.submitted) return undefined;
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, [phase, attempt, tick]);

  // Flush the last edits when the screen goes away.
  useEffect(
    () => () => {
      void useListeningStore.getState().flush();
    },
    [],
  );

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const open = useListeningStore.getState().attempt;
      if (!open || open.submitted) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const parts: ListeningPart[] = useMemo(() => detail?.parts ?? [], [detail]);
  const allNumbers = useMemo(
    () => parts.flatMap((p) => p.questions.map((q) => q.number)).sort((a, b) => a - b),
    [parts],
  );
  const audioReady = parts.length > 0 && parts.every((p) => p.audio.ready);

  // ------------------------------------------------------------- behaviours --
  const onStart = async () => {
    const id = await startAttempt(
      isTest ? { testId: targetId, mode: requestedMode } : { scriptId: targetId, mode: requestedMode },
    );
    if (!id) return;
    setPhase("running");
    setPlayIndex(0);
    setViewIndex(0);
    setActiveNumber(allNumbers[0] ?? 0);
    setAutoStart(exam);
  };

  const onPartEnded = useCallback(() => {
    if (!exam) return;
    const next = playIndex + 1;
    if (next >= parts.length) {
      setPhase("check");
      void flush();
      return;
    }
    setPlayIndex(next);
    setViewIndex(next);
    setAutoStart(true);
    setCurrentPart(parts[next]?.part ?? next + 1);
  }, [exam, playIndex, parts, flush, setCurrentPart]);

  const onSelectPart = (index: number) => {
    setViewIndex(index);
    if (!exam) {
      setPlayIndex(index);
      setAutoStart(false);
    }
    setCurrentPart(parts[index]?.part ?? index + 1);
  };

  const jumpTo = (number: number) => {
    const owner = parts.findIndex((p) => p.questions.some((q) => q.number === number));
    if (owner >= 0 && owner !== viewIndex) setViewIndex(owner);
    setActiveNumber(number);
    window.requestAnimationFrame(() => {
      const node = questionRefs.current.get(number);
      node?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      const control = node?.querySelector<HTMLElement>("input, button, [tabindex]");
      control?.focus();
    });
  };

  const registerRef = useCallback((number: number, el: HTMLDivElement | null) => {
    if (el) questionRefs.current.set(number, el);
    else questionRefs.current.delete(number);
  }, []);

  const onPlayerReady = useCallback((seek: (ms: number) => void) => {
    seekRef.current = seek;
  }, []);

  /** Practice only: unlock this part's transcript once every answer is in. */
  const onReveal = async (part: ListeningPart) => {
    setRevealError(null);
    setRevealing(true);
    try {
      const full = await api.get<ListeningPart>(
        `/api/v1/listening/scripts/${encodeURIComponent(part.id)}?with_answers=1`,
      );
      let timing: TimingDoc | null = null;
      try {
        timing = await api.get<TimingDoc>(part.audio.timing_path);
      } catch {
        timing = null; // timings are a nicety; the transcript still reads fine
      }
      const startByIndex = new Map(
        (timing?.lines ?? []).map((line) => [line.index, line.start_ms]),
      );
      const accepted: Record<number, string[]> = {};
      const cueByNumber: Record<number, number | null> = {};
      for (const question of full.questions) {
        accepted[question.number] = (question.answers ?? []).flat();
        cueByNumber[question.number] = question.cue_line_index ?? null;
      }
      setRevealed((current) => ({
        ...current,
        [part.id]: {
          lines: (full.lines ?? []).map((line, index) => ({
            index,
            speaker: line.speaker ?? null,
            text: line.text ?? "",
            start_ms: startByIndex.get(index) ?? null,
          })),
          accepted,
          cueByNumber,
        },
      }));
      revealPartInStore(part.id);
    } catch (err) {
      setRevealError(
        err instanceof ApiError ? err.detail : "the transcript could not be unlocked",
      );
    } finally {
      setRevealing(false);
    }
  };

  const onSubmit = useCallback(async () => {
    const result = await submit();
    if (result) navigate(`/listening/review/${result.attempt_id}`);
  }, [submit, navigate]);

  const onLeave = async () => {
    const open = useListeningStore.getState().attempt;
    if (open && !open.submitted) {
      const ok = await confirm({
        title: "Leave this test?",
        message: "The attempt is abandoned and its answers are not marked.",
        confirmLabel: "Leave test",
        destructive: true,
      });
      if (!ok) return;
      await abandon();
    } else {
      resetAttempt();
    }
    navigate("/listening");
  };

  // ------------------------------------------------------------------ views --
  if (!targetId) {
    return (
      <PageShell title="Listening">
        <EmptyState title="No test selected" description="Pick a test from the listening library." />
      </PageShell>
    );
  }

  if (detailLoading && !detail) {
    return (
      <PageShell title="Listening" description="Loading the test…">
        <SkeletonCard lines={5} />
      </PageShell>
    );
  }

  if (detailError && !detail) {
    return (
      <PageShell title="Listening">
        <EmptyState
          icon={AlertTriangle}
          title="This test could not be opened"
          description={detailError}
          action={
            <Button onClick={() => void (isTest ? loadTest(targetId) : loadScript(targetId))}>
              Try again
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (!detail || parts.length === 0) {
    return (
      <PageShell title="Listening">
        <EmptyState
          title="This test has no parts"
          description="The installed content pack does not contain any scripts for it."
          action={<Button onClick={() => navigate("/listening")}>Back to Listening</Button>}
        />
      </PageShell>
    );
  }

  const viewPart = parts[Math.min(viewIndex, parts.length - 1)];
  const playPart = parts[Math.min(playIndex, parts.length - 1)];
  const answers = attempt?.answers ?? {};
  const answeredCount = allNumbers.filter((n) => isAnswered(answers[String(n)])).length;
  const status: Record<number, QuestionStatus> = {};
  for (const n of allNumbers) status[n] = isAnswered(answers[String(n)]) ? "answered" : "blank";

  // ---------------------------------------------------------------- 1: brief --
  if (phase === "brief") {
    return (
      <PageShell
        title={detail.title}
        description={
          exam
            ? "Exam conditions — the recording plays once."
            : "Practice mode — replay, slow down and check the transcript."
        }
        actions={
          <Button variant="ghost" onClick={() => navigate("/listening")}>
            <ArrowLeft className="h-4 w-4" />
            Library
          </Button>
        }
      >
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>
                {exam ? "Before you start" : "How practice mode works"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px] text-muted-foreground">
              {exam ? (
                <ul className="space-y-2">
                  <Rule icon={Play}>
                    Each part plays <strong className="text-foreground">once</strong> and moves
                    straight to the next. There is no pause, no rewind and no replay.
                  </Rule>
                  <Rule icon={Clock}>
                    Type your answers while you listen. After part {parts.length} you get{" "}
                    <strong className="text-foreground">two minutes</strong> to check them, then
                    the test submits itself.
                  </Rule>
                  <Rule icon={Lock}>
                    The transcript stays locked until you submit.
                  </Rule>
                  <Rule icon={Headphones}>
                    Put headphones on and set your volume now — you cannot restart a part.
                  </Rule>
                </ul>
              ) : (
                <ul className="space-y-2">
                  <Rule icon={Play}>
                    Replay any part, seek freely and slow the audio to 0.75×.
                  </Rule>
                  <Rule icon={Eye}>
                    Once every question in a part is answered you can reveal its transcript — those
                    answers then lock, so the reveal never becomes a way to cheat.
                  </Rule>
                  <Rule icon={BookOpen}>
                    A single part reports a raw score only; bands need a full four-part test.
                  </Rule>
                </ul>
              )}
            </CardContent>
          </Card>

          <SpellingNotice />

          <Card>
            <CardHeader>
              <CardTitle>Audio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1.5">
                {parts.map((part) => (
                  <li
                    key={part.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">Part {part.part}</span> — {part.title}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone="outline">{part.audio.accent_label}</Badge>
                      <Badge tone={part.audio.ready ? "success" : "warning"}>
                        {part.audio.ready
                          ? formatDuration(part.audio.duration_ms / 1000)
                          : "not rendered"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
              <PrepareAudioPanel
                targetId={targetId}
                kind={isTest ? "test" : "script"}
                ready={audioReady}
                readyParts={parts.filter((p) => p.audio.ready).length}
                totalParts={parts.length}
              />
            </CardContent>
          </Card>

          {startError && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {startError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void onStart()} loading={starting} disabled={!audioReady}>
              {exam ? "Start the test" : "Start practising"}
            </Button>
            {!audioReady && (
              <span className="text-[13px] text-muted-foreground">
                Prepare the audio first — it is generated once and then cached.
              </span>
            )}
          </div>
        </div>
      </PageShell>
    );
  }

  // ----------------------------------------------------------- 3: check step --
  if (phase === "check") {
    return (
      <PageShell
        title="Check your answers"
        description={`${answeredCount} of ${allNumbers.length} answered`}
        actions={
          <Button variant="ghost" onClick={() => void onLeave()}>
            Leave
          </Button>
        }
      >
        <div className="space-y-4">
          {submitError && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {submitError}
            </p>
          )}
          <CheckStep
            parts={parts}
            answers={answers}
            onAnswer={setAnswer}
            exam={exam}
            submitting={submitting}
            onSubmit={() => void onSubmit()}
            onBack={exam ? undefined : () => setPhase("running")}
          />
        </div>
      </PageShell>
    );
  }

  // ------------------------------------------------------------- 2: running --
  const reveal = revealed[viewPart.id];
  const partNumbers = viewPart.questions.map((q) => q.number);
  const partAnswered = partNumbers.every((n) => isAnswered(answers[String(n)]));
  const locked = Boolean(attempt?.revealed.includes(viewPart.id));
  const cueForActive = reveal?.cueByNumber[activeNumber] ?? null;

  return (
    <PageShell
      title={detail.title}
      description={
        exam ? "Exam conditions — one play, no rewind." : "Practice — replay and slow down freely."
      }
      maxWidth="max-w-7xl"
      actions={
        <div className="flex items-center gap-2">
          <Badge tone={exam ? "warning" : "primary"}>{exam ? "Exam mode" : "Practice mode"}</Badge>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {formatDuration(attempt?.seconds ?? 0)}
          </span>
          <Button variant="ghost" onClick={() => void onLeave()}>
            Leave
          </Button>
        </div>
      }
      toolbar={
        parts.length > 1 ? (
          <Tabs
            aria-label="Parts"
            value={String(viewIndex)}
            onChange={(value) => onSelectPart(Number(value))}
            items={parts.map((part, index) => ({
              value: String(index),
              label: `Part ${part.part}`,
              badge: index === playIndex ? <Badge tone="primary">audio</Badge> : undefined,
            }))}
          />
        ) : undefined
      }
    >
      <div className="space-y-4">
          <PartPlayer
            key={playPart.id}
            part={playPart}
            partIndex={playIndex}
            partCount={parts.length}
            exam={exam}
            playedOnce={Boolean(attempt?.played.includes(playPart.id)) && exam}
            autoStart={autoStart}
            onPlayStarted={() => notePlayed(playPart.id)}
            onEnded={onPartEnded}
            onReady={onPlayerReady}
          />

          {saveError && (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-[12px] font-medium text-warning"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {saveError} — your answers stay on screen and are retried automatically.
            </p>
          )}

          {exam && viewIndex !== playIndex && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground">
              You are looking at part {viewPart.part} while part {playPart.part} is playing. The
              audio does not follow the tabs.
            </p>
          )}

          {locked && (
            <p className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Part {viewPart.part} is locked because you revealed its transcript.
            </p>
          )}

          <AnswerSheet
            part={viewPart}
            answers={answers}
            onAnswer={setAnswer}
            readOnly={locked}
            activeNumber={activeNumber}
            onActive={setActiveNumber}
            registerRef={registerRef}
          />

          {!exam && (
            <div className="space-y-2 border-t border-border pt-4">
              {reveal ? (
                <>
                  <h3 className="text-[13px] font-semibold">Transcript — part {viewPart.part}</h3>
                  <p className="text-[12px] text-muted-foreground">
                    The line holding the answer to question {activeNumber || partNumbers[0]} is
                    highlighted. Use a timestamp to replay it.
                  </p>
                  <TranscriptPanel
                    lines={reveal.lines}
                    speakers={viewPart.speakers}
                    highlightIndex={cueForActive}
                    highlightTerms={reveal.accepted[activeNumber] ?? []}
                    onJump={(ms) => seekRef.current?.(ms)}
                  />
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void onReveal(viewPart)}
                    disabled={!partAnswered}
                    loading={revealing}
                  >
                    <Eye className="h-4 w-4" />
                    Reveal transcript for part {viewPart.part}
                  </Button>
                  <span className="text-[12px] text-muted-foreground">
                    {partAnswered
                      ? "Revealing locks this part's answers."
                      : "Answer every question in this part first."}
                  </span>
                </div>
              )}
              {revealError && (
                <p role="alert" className="text-[12px] font-medium text-destructive">
                  {revealError}
                </p>
              )}
            </div>
          )}
      </div>

      {/* The navigator lives in the same bottom strip Reading uses — see PaletteFooter. */}
      {allNumbers.length > 0 && (
        <PaletteFooter
          count={allNumbers.length}
          startAt={allNumbers[0]}
          current={activeNumber || allNumbers[0]}
          status={status}
          onJump={jumpTo}
          leading={
            <span className="text-[11px] text-muted-foreground">
              {answeredCount} of {allNumbers.length} answered
            </span>
          }
          actions={
            <Button
              variant={exam ? "outline" : "primary"}
              size="sm"
              onClick={() => {
                void flush();
                setPhase("check");
              }}
            >
              {exam ? "Go to the check step" : "Finish and check"}
            </Button>
          }
        />
      )}
    </PageShell>
  );
}

function Rule({
  icon: Icon,
  children,
}: {
  icon: typeof Play;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

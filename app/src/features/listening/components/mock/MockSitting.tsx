/**
 * `/listening/mock/sitting/:mockId` — the paper itself.
 *
 * Everything on this screen is the practice player's machinery with every affordance
 * removed. There is no transcript, no reveal, no explanation, no coach link and no way
 * into one: the coach shuts itself while a sitting is open, and the teaching payload is
 * not in this response body at any depth, so there is nothing for a determined learner to
 * find either.
 *
 * **The play-once rule is granted by the server, before any audio is mounted.** Pressing
 * "play" first asks `POST …/sessions/{id}/play`, which records the part and refuses the
 * second request with a 409. Only when that succeeds is an `<audio>` element created at
 * all. So the restriction is not a promise the renderer makes to itself — it survives a
 * reload, a second tab and devtools, and the sitting can say so honestly. The rule is also
 * *announced*, not merely implied by a missing button: the player carries a "plays once"
 * badge, the region is a live region that says which part is sounding, and the transport
 * mounts no pause, no seek and no speed control.
 *
 * The read-ahead pauses are inside the recordings — they are authored `pause_after_ms`
 * values that the stitcher baked into the WAV — so there is no pause to implement here and
 * no time budget for the learner to get wrong. That is worth stating, because it is the
 * one paper in IELTS with no time-management problem and therefore the one where attention
 * management is the whole game.
 *
 * The clock is wall-clock from `started_at`. It does not pause when the window loses
 * focus, because the real one does not either.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ClipboardCheck, Clock, Headphones, Lock } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CircularTimer,
  EmptyState,
  Input,
  QuestionPalette,
  SkeletonCard,
  Tabs,
  useConfirm,
  type QuestionStatus,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { isAnswered } from "../../store";
import { AnswerSheet } from "../AnswerSheet";
import { PartPlayer } from "../PartPlayer";
import { type ExamPart, useMockStore } from "./store";

type Phase = "running" | "window";

export function MockSitting() {
  const { attemptId: mockId = "" } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const session = useMockStore((s) => s.session);
  const loading = useMockStore((s) => s.loading);
  const error = useMockStore((s) => s.error);
  const load = useMockStore((s) => s.load);
  const answers = useMockStore((s) => s.answers);
  const setAnswer = useMockStore((s) => s.setAnswer);
  const pushClock = useMockStore((s) => s.pushClock);
  const flush = useMockStore((s) => s.flush);
  const saveError = useMockStore((s) => s.saveError);
  const play = useMockStore((s) => s.play);
  const playError = useMockStore((s) => s.playError);
  const submit = useMockStore((s) => s.submit);
  const submitting = useMockStore((s) => s.submitting);
  const submitError = useMockStore((s) => s.submitError);
  const abandon = useMockStore((s) => s.abandon);

  const [viewIndex, setViewIndex] = useState(0);
  const [activeNumber, setActiveNumber] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  /** The part the server has granted a play for and which is now sounding. */
  const [armed, setArmed] = useState<string | null>(null);
  const [arming, setArming] = useState(false);
  const questionRefs = useRef(new Map<number, HTMLDivElement>());
  const autoSubmitted = useRef(false);

  useEffect(() => {
    void load(mockId);
  }, [load, mockId]);

  const parts = useMemo<ExamPart[]>(() => session?.parts ?? [], [session]);
  const allNumbers = useMemo(
    () => parts.flatMap((part) => part.questions.map((q) => q.number)).sort((a, b) => a - b),
    [parts],
  );

  const live = session?.status === "in_progress";
  const startedAt = session?.started_at ?? null;

  // The paper's own clock: wall-clock, and it does not pause.
  useEffect(() => {
    if (!live || !startedAt) return undefined;
    const started = Date.parse(startedAt);
    if (Number.isNaN(started)) return undefined;
    const read = () => Math.max(0, Math.round((Date.now() - started) / 1000));
    setElapsed(read());
    const id = setInterval(() => setElapsed(read()), 1000);
    return () => clearInterval(id);
  }, [live, startedAt]);

  // Push the clock up on a slow beat so the server's own view of the sitting — and the
  // auto-submit it does when the clock expires — stays close to the truth.
  useEffect(() => {
    if (!live || elapsed === 0 || elapsed % 15 !== 0) return;
    pushClock(mockId, elapsed, phaseOf(session, elapsed));
    // `session` is intentionally not a dependency: this fires on the clock, not on
    // every autosave echo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, live, mockId, pushClock]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!useMockStore.getState().session) return;
      if (useMockStore.getState().session?.status !== "in_progress") return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Flush the last edits when the screen goes away.
  useEffect(() => () => void useMockStore.getState().flush(mockId), [mockId]);

  /**
   * Which part the audio is on: the first the server's ledger has not consumed.
   *
   * A part that was started and never finished — the browser was closed during Part 2 —
   * is gone, and the cursor opens past it. That is harsh and it is the truth: the
   * recording plays once, and the server refuses a second ticket for it.
   */
  const playedIds = useMemo(
    () => new Set(Object.keys(session?.plays.played ?? {})),
    [session],
  );
  const playIndex = useMemo(() => {
    const first = parts.findIndex((part) => !playedIds.has(part.id));
    return first === -1 ? parts.length : first;
  }, [parts, playedIds]);

  const phase: Phase = parts.length > 0 && playIndex >= parts.length ? "window" : "running";
  const windowTotal = Math.round(session?.timing?.window_s ?? 120);
  const windowLabel = session?.timing?.window_label ?? "check window";
  const paper = session?.delivery === "paper";

  /**
   * The window's countdown is anchored at the moment the last recording finished, not at
   * a predicted audio length. A learner whose machine took a moment between parts should
   * not be charged for it twice, and the recordings are the only thing that knows when
   * they actually ended.
   */
  const windowStartedAt = useRef<number | null>(null);
  useEffect(() => {
    if (phase === "window") {
      if (windowStartedAt.current === null) windowStartedAt.current = elapsed;
    } else {
      windowStartedAt.current = null;
    }
  }, [elapsed, phase]);

  const windowRemaining =
    phase === "window"
      ? Math.max(0, windowTotal - Math.max(0, elapsed - (windowStartedAt.current ?? elapsed)))
      : windowTotal;

  useEffect(() => {
    if (viewIndex >= parts.length && parts.length > 0) setViewIndex(parts.length - 1);
  }, [parts.length, viewIndex]);

  useEffect(() => {
    if (phase === "running" && playIndex < parts.length) setViewIndex(playIndex);
  }, [phase, playIndex, parts.length]);

  const onSubmit = useCallback(
    async (auto = false) => {
      const ok = await submit(mockId, { auto, seconds: elapsed });
      if (ok) navigate(`/listening/mock/report/${mockId}`);
    },
    [elapsed, mockId, navigate, submit],
  );

  useEffect(() => {
    if (phase !== "window" || windowRemaining > 0 || autoSubmitted.current || submitting) return;
    if (!live) return;
    autoSubmitted.current = true;
    void onSubmit(true);
  }, [live, onSubmit, phase, submitting, windowRemaining]);

  /**
   * Ask the server for the one play this part gets, and only then mount an audio
   * element. A grant that never arrives means no sound is produced at all.
   */
  const onArm = useCallback(
    async (scriptId: string) => {
      setArming(true);
      const granted = await play(mockId, scriptId);
      setArming(false);
      if (granted) setArmed(scriptId);
    },
    [mockId, play],
  );

  const onPartEnded = useCallback(() => {
    setArmed(null);
    void flush(mockId);
    void load(mockId, { quiet: true });
  }, [flush, load, mockId]);

  const onLeave = useCallback(async () => {
    const ok = await confirm({
      title: "Abandon this mock?",
      message:
        "The clock does not stop and the recordings cannot be played again, so this paper cannot be resumed later. It will be marked as abandoned and will not count.",
      confirmLabel: "Abandon the paper",
      destructive: true,
    });
    if (!ok) return;
    await abandon(mockId);
    navigate("/listening");
  }, [abandon, confirm, mockId, navigate]);

  // ------------------------------------------------------------------ views --

  if (loading && !session) {
    return (
      <PageShell title="Mock listening paper" description="Opening the paper.">
        <SkeletonCard lines={5} />
      </PageShell>
    );
  }

  if (error || !session) {
    return (
      <PageShell title="Mock listening paper">
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={AlertTriangle}
              title="This sitting could not be opened"
              description={error ?? "The sidecar has no record of this paper."}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => void load(mockId)}>Try again</Button>
                  <Button variant="outline" onClick={() => navigate("/listening/mock")}>
                    The mock room
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (session.status === "complete" || session.status === "abandoned") {
    return (
      <PageShell title={session.title}>
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              title={
                session.status === "complete" ? "This paper is finished" : "This paper was abandoned"
              }
              description={
                session.status === "complete"
                  ? "It has been marked. The report leads with the raw score and ends with what to do next."
                  : "An abandoned paper is not marked, because a partial sitting does not measure anything."
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {session.status === "complete" && (
                    <Button onClick={() => navigate(`/listening/mock/report/${mockId}`)}>
                      The report
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => navigate("/listening/mock")}>
                    Sit another
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (session.status !== "in_progress") {
    return (
      <PageShell title={session.title}>
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={Headphones}
              title="This paper has not been started"
              description="The clock starts on the preflight screen, once every recording has been synthesized."
              action={
                <Button onClick={() => navigate("/listening/mock")}>Back to the preflight</Button>
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (parts.length === 0) {
    return (
      <PageShell title={session.title}>
        <SkeletonCard lines={5} />
      </PageShell>
    );
  }

  const answeredCount = allNumbers.filter((n) => isAnswered(answers[String(n)])).length;
  const status: Record<number, QuestionStatus> = {};
  for (const n of allNumbers) status[n] = isAnswered(answers[String(n)]) ? "answered" : "blank";
  const viewPart = parts[Math.min(viewIndex, parts.length - 1)];
  const playPart = parts[Math.min(playIndex, parts.length - 1)];

  const jumpTo = (number: number) => {
    const owner = parts.findIndex((part) => part.questions.some((q) => q.number === number));
    if (owner >= 0 && owner !== viewIndex) setViewIndex(owner);
    setActiveNumber(number);
    window.requestAnimationFrame(() => {
      const node = questionRefs.current.get(number);
      node?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      node?.querySelector<HTMLElement>("input, button, [tabindex]")?.focus();
    });
  };

  return (
    <PageShell
      maxWidth="max-w-7xl"
      title={session.title}
      description={
        phase === "window"
          ? `${session.delivery_label} — the ${windowLabel} at the end of the paper.`
          : "Exam conditions. Each recording plays once, and nothing here explains anything."
      }
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="warning" className="gap-1">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Mock in progress
          </Badge>
          <span className="tabular-nums text-[12px] text-muted-foreground" aria-live="off">
            {formatDuration(elapsed)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void onLeave()}>
            Abandon
          </Button>
        </div>
      }
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            aria-label="Parts"
            value={String(Math.min(viewIndex, parts.length - 1))}
            onChange={(value) => setViewIndex(Number(value))}
            items={parts.map((part, index) => ({
              value: String(index),
              label: `Part ${part.part}`,
              badge:
                index === playIndex && phase === "running" ? (
                  <Badge tone="primary">now</Badge>
                ) : playedIds.has(part.id) ? (
                  <Badge tone="default">played</Badge>
                ) : undefined,
            }))}
          />
          <span className="text-[12px] text-muted-foreground">
            {answeredCount} of {allNumbers.length} answered
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {saveError && (
          <p role="alert" className="flex items-center gap-1.5 text-[12px] font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {saveError} — your answers stay on screen and are retried automatically.
          </p>
        )}
        {submitError && (
          <p role="alert" className="text-[13px] font-medium text-destructive">
            {submitError}
          </p>
        )}

        {phase === "window" ? (
          <TransferWindow
            paper={paper}
            label={windowLabel}
            remaining={windowRemaining}
            total={windowTotal}
            note={session.timing?.window_note ?? ""}
            parts={parts}
            answers={answers}
            onAnswer={(number, value) => setAnswer(mockId, number, value)}
            submitting={submitting}
            onSubmit={() => void onSubmit(false)}
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-4">
              {/* ------------------------------------------- the one play --- */}
              <section
                aria-label={`Recording for part ${playPart.part}`}
                aria-live="polite"
                className="space-y-2"
              >
                {armed === playPart.id ? (
                  <PartPlayer
                    key={playPart.id}
                    part={playPart}
                    partIndex={playIndex}
                    partCount={parts.length}
                    exam
                    playedOnce={false}
                    autoStart
                    onPlayStarted={() => undefined}
                    onEnded={onPartEnded}
                  />
                ) : (
                  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Headphones className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            Part {playPart.part} of {parts.length} — {playPart.title}
                          </p>
                          <p className="truncate text-[12px] text-muted-foreground">
                            {playPart.audio.accent_label}
                          </p>
                        </div>
                      </div>
                      <Badge tone="warning" className="gap-1">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Plays once
                      </Badge>
                    </div>

                    <p className="text-[13px] leading-6 text-muted-foreground">
                      This recording plays once. There is no pause, no rewind, no replay and no
                      speed control, and the refusal is the sidecar&rsquo;s rather than this
                      screen&rsquo;s — once you press play, a second play is impossible even after
                      a reload. The read-ahead pauses are inside the recording, so it will stop and
                      give you about thirty seconds before each set on its own.
                    </p>

                    {playError && (
                      <p role="alert" className="text-[13px] font-medium text-destructive">
                        {playError}
                      </p>
                    )}

                    <Button
                      loading={arming}
                      disabled={!playPart.audio.ready}
                      onClick={() => void onArm(playPart.id)}
                      aria-label={`Play part ${playPart.part}. This recording plays once and cannot be paused, rewound or replayed.`}
                    >
                      <Headphones className="h-4 w-4" aria-hidden="true" />
                      Play part {playPart.part} — once only
                    </Button>
                  </div>
                )}
              </section>

              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
                Spend every pause on the questions that have not been asked yet, never on the one
                that has just gone. The most expensive thing you can do in this test is care about a
                question you have already lost.
              </p>

              {viewIndex !== playIndex && (
                <p className="rounded-lg border border-warning/40 bg-warning/8 px-3 py-2 text-[12px] text-muted-foreground">
                  You are looking at part {viewPart.part} while part {playPart.part} is the one on
                  the clock. The audio does not follow the tabs.
                </p>
              )}

              <AnswerSheet
                part={viewPart}
                answers={answers}
                onAnswer={(number, value) => setAnswer(mockId, number, value)}
                activeNumber={activeNumber}
                onActive={setActiveNumber}
                registerRef={(number, el) => {
                  if (el) questionRefs.current.set(number, el);
                  else questionRefs.current.delete(number);
                }}
              />
            </div>

            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="mb-2 text-[12px] font-semibold">
                  {answeredCount} of {allNumbers.length} answered
                </p>
                {allNumbers.length > 0 && (
                  <QuestionPalette
                    count={allNumbers.length}
                    startAt={allNumbers[0]}
                    current={activeNumber || allNumbers[0]}
                    status={status}
                    onJump={jumpTo}
                  />
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <p className="text-[12px] font-semibold">Where you are</p>
                <ol className="space-y-1">
                  {parts.map((part, index) => (
                    <li
                      key={part.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[12px]",
                        index === playIndex
                          ? "bg-primary/10 font-semibold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>Part {part.part}</span>
                      <span>
                        {playedIds.has(part.id)
                          ? "played"
                          : index === playIndex
                            ? "now"
                            : "to come"}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[12px] text-muted-foreground">
                    <span>{paper ? "Transfer" : "Check"}</span>
                    <span>{formatDuration(windowTotal)}</span>
                  </li>
                </ol>
                <p className="text-[12px] leading-5 text-muted-foreground">
                  {session.modelled}
                </p>
                <p className="text-[12px] leading-5 text-muted-foreground">
                  Nothing here explains anything until the paper is submitted. That is the point of
                  a mock.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </PageShell>
  );
}

/** `audio` while a recording can still run, `check` once the last one has finished. */
function phaseOf(session: { timing: { audio_s: number } | null } | null, elapsed: number): string {
  const audio = session?.timing?.audio_s ?? 0;
  return elapsed >= audio ? "check" : "audio";
}

// ------------------------------------------------------- the window at the end ---

function TransferWindow({
  paper,
  label,
  remaining,
  total,
  note,
  parts,
  answers,
  onAnswer,
  submitting,
  onSubmit,
}: {
  paper: boolean;
  label: string;
  remaining: number;
  total: number;
  note: string;
  parts: ExamPart[];
  answers: Record<string, string>;
  onAnswer: (number: number, value: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const rows = parts.flatMap((part) =>
    part.questions.map((question) => ({ number: question.number, part: part.part })),
  );
  const blank = rows.filter((row) => !isAnswered(answers[String(row.number)]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              {paper ? "Transfer your answers" : "Check your answers"} — {label}
            </h2>
            <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
              {note ||
                (paper
                  ? "Ten minutes, because on paper the answers have to be moved onto a separate sheet. It is a clerical allowance, not a thinking period."
                  : "Two minutes, because your answers are already where they need to be.")}{" "}
              The paper submits itself at 0:00.
            </p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              The audio is gone, so content recovery is impossible and only form recovery is
              possible. Nothing on this list is a question you rethink.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CircularTimer
            totalSec={total}
            remainingSec={remaining}
            warnAtSec={Math.max(30, Math.round(total * 0.25))}
            label={paper ? "Transfer window" : "Check window"}
          />
          <span className="text-sm font-semibold tabular-nums">{formatDuration(remaining)}</span>
        </div>
      </div>

      <ol className="space-y-1 rounded-xl border border-border bg-muted/40 p-3 text-[12px] leading-5 text-muted-foreground">
        <li>1. Blanks first — a blank is a guaranteed zero and a guess is not.</li>
        <li>2. Word limits second — anything over the limit is a certain zero. Articles are words.</li>
        <li>3. Plurals third — does the printed frame force a number on the noun you wrote?</li>
        <li>4. Doubled answers fourth — a box holding two candidates is marked wrong. Pick one.</li>
        <li>5. Spelling last, and only on words you copied from a spelled-out name.</li>
      </ol>

      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone={blank.length ? "warning" : "success"}>
          {blank.length ? `${blank.length} unanswered` : "All questions answered"}
        </Badge>
        {blank.length > 0 && (
          <span className="text-muted-foreground">
            A blank scores nothing and a guess costs nothing. Fill every one.
          </span>
        )}
        <span className="text-muted-foreground">
          Capitals are not marked, so write whatever is fastest.
        </span>
      </div>

      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map((row) => {
          const value = answers[String(row.number)] ?? "";
          const empty = !isAnswered(value);
          return (
            <div
              key={row.number}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                empty ? "border-warning/50 bg-warning/8" : "border-border",
              )}
            >
              <span className="w-7 shrink-0 text-right text-[12px] font-semibold tabular-nums text-muted-foreground">
                {row.number}
              </span>
              <Input
                value={value}
                onChange={(event) => onAnswer(row.number, event.target.value)}
                aria-label={`Answer for question ${row.number}, part ${row.part}`}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-8"
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button onClick={onSubmit} loading={submitting}>
          Submit the paper
        </Button>
        <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Marking is instant and offline — nothing leaves this machine.
        </span>
      </div>
    </div>
  );
}

export default MockSitting;

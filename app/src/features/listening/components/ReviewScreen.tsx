import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookmarkPlus,
  Check,
  Play,
  SpellCheck,
  X,
} from "lucide-react";
import {
  Badge,
  BandScore,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
  Tabs,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { api, ApiError } from "@/lib/api";
import { formatDuration, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/cn";
import { playAudio } from "../media";
import { useListeningStore } from "../store";
import { typeLabel } from "../qtypes";
import type { ReviewPart, ReviewQuestion } from "../types";
import { TranscriptPanel } from "./TranscriptPanel";

type SaveState = "idle" | "saving" | "added" | "error";

/** Post-attempt review: answers, transcript, timestamp replay and vocabulary capture. */
export function ReviewScreen() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const review = useListeningStore((s) => s.review);
  const loading = useListeningStore((s) => s.reviewLoading);
  const error = useListeningStore((s) => s.reviewError);
  const loadReview = useListeningStore((s) => s.loadReview);
  const resetAttempt = useListeningStore((s) => s.resetAttempt);

  const [partIndex, setPartIndex] = useState(0);
  const [focused, setFocused] = useState<ReviewQuestion | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const seekRef = useRef<((ms: number) => void) | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    if (review?.attempt_id === attemptId) return;
    void loadReview(attemptId);
  }, [attemptId, review?.attempt_id, loadReview]);

  // The attempt is finished; drop the in-progress copy so the library is clean.
  useEffect(() => {
    if (review?.attempt_id === attemptId) resetAttempt();
  }, [review?.attempt_id, attemptId, resetAttempt]);

  const onPlayerReady = useCallback((seek: (ms: number) => void) => {
    seekRef.current = seek;
  }, []);

  const parts = review?.parts ?? [];
  const part: ReviewPart | undefined = parts[Math.min(partIndex, Math.max(0, parts.length - 1))];

  const missed = useMemo(
    () =>
      parts.flatMap((p) =>
        p.questions.filter((q) => q.correct === false && q.accepted.some((slot) => slot.length > 0)),
      ),
    [parts],
  );

  const addToVocab = async (questions: ReviewQuestion[]) => {
    const items = questions
      .map((question) => {
        const term = question.accepted[0]?.[0] ?? "";
        if (!term) return null;
        return {
          term,
          sentence_context: question.cue_text || "",
          source: { kind: "listening", item_id: question.question_id },
          card_type: question.near_miss_spelling ? "spelling" : "listening_gap",
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (items.length === 0) return;

    setSaveError(null);
    setSaveStates((current) => {
      const next = { ...current };
      for (const question of questions) next[question.question_id] = "saving";
      return next;
    });
    try {
      await api.post("/api/v1/vocab/suggestions", { items });
      setSaveStates((current) => {
        const next = { ...current };
        for (const question of questions) next[question.question_id] = "added";
        return next;
      });
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.detail : "the words could not be sent to the vocabulary inbox",
      );
      setSaveStates((current) => {
        const next = { ...current };
        for (const question of questions) next[question.question_id] = "error";
        return next;
      });
    }
  };

  if (loading && !review) {
    return (
      <PageShell title="Listening review" description="Loading your marked answers…">
        <SkeletonCard lines={6} />
      </PageShell>
    );
  }

  if (error && !review) {
    return (
      <PageShell title="Listening review">
        <EmptyState
          icon={AlertTriangle}
          title="This review could not be loaded"
          description={error}
          action={
            <Button onClick={() => attemptId && void loadReview(attemptId)}>Try again</Button>
          }
        />
      </PageShell>
    );
  }

  if (!review || !part) {
    return (
      <PageShell title="Listening review">
        <EmptyState
          title="Nothing to review yet"
          description="Finish a listening attempt and its marked answers appear here."
          action={<Button onClick={() => navigate("/listening")}>Back to Listening</Button>}
        />
      </PageShell>
    );
  }

  const raw = review.raw_score ?? 0;
  const total = review.total_questions ?? 0;
  const nearMisses = parts.flatMap((p) => p.questions.filter((q) => q.near_miss_spelling));

  return (
    <PageShell
      title="Listening review"
      description={`${raw} of ${total} correct${
        review.submitted_at ? ` · submitted ${review.submitted_at.slice(0, 10)}` : ""
      }`}
      maxWidth="max-w-7xl"
      actions={
        <Button variant="ghost" onClick={() => navigate("/listening")}>
          <ArrowLeft className="h-4 w-4" />
          Library
        </Button>
      }
      toolbar={
        parts.length > 1 ? (
          <Tabs
            aria-label="Parts"
            value={String(partIndex)}
            onChange={(value) => setPartIndex(Number(value))}
            items={parts.map((p, index) => {
              const correct = p.questions.filter((q) => q.correct).length;
              return {
                value: String(index),
                label: `Part ${p.part}`,
                badge: (
                  <Badge tone={correct === p.questions.length ? "success" : "default"}>
                    {correct}/{p.questions.length}
                  </Badge>
                ),
              };
            })}
          />
        ) : undefined
      }
    >
      <div className="space-y-5">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6 py-5">
            {review.band !== null ? (
              <BandScore band={review.band} size="lg" label="Listening" reveal />
            ) : (
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {raw}
                  <span className="text-base text-muted-foreground">/{total}</span>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  Raw score only — a band needs a full four-part test.
                </p>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-4">
              <Stat label="Correct">
                {raw} / {total}
              </Stat>
              <Stat label="Mode">{review.mode.replace(/_/g, " ")}</Stat>
              <Stat label="Time taken">{formatDuration(review.duration_s ?? 0)}</Stat>
              <Stat label="Plays used">{review.play_count}</Stat>
            </dl>
          </CardContent>
        </Card>

        {nearMisses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3">
            <SpellCheck className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[13px]">
              <span className="font-semibold">
                {nearMisses.length} answer{nearMisses.length === 1 ? "" : "s"} were one or two
                letters off
              </span>{" "}
              <span className="text-muted-foreground">
                (questions {nearMisses.map((q) => q.number).join(", ")}). In IELTS those score
                nothing — worth drilling.
              </span>
            </p>
          </div>
        )}

        {missed.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
            <p className="text-[13px] text-muted-foreground">
              Send every missed answer to your vocabulary inbox. Nothing is scheduled until you
              accept it there.
            </p>
            <Button variant="outline" size="sm" onClick={() => void addToVocab(missed)}>
              <BookmarkPlus className="h-4 w-4" />
              Add {missed.length} missed word{missed.length === 1 ? "" : "s"}
            </Button>
          </div>
        )}

        {saveError && (
          <p role="alert" className="text-[13px] font-medium text-destructive">
            {saveError}
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-3">
            <ReviewPlayer part={part} onReady={onPlayerReady} />
            <h2 className="text-sm font-semibold">
              Part {part.part} — {part.title}
            </h2>
            <div className="space-y-2">
              {part.questions.map((question) => (
                <QuestionRow
                  key={question.question_id}
                  question={question}
                  saveState={saveStates[question.question_id] ?? "idle"}
                  onAdd={() => void addToVocab([question])}
                  onReplay={
                    question.audio_ms !== null
                      ? () => seekRef.current?.(question.audio_ms as number)
                      : undefined
                  }
                  onFocusQuestion={() => setFocused(question)}
                  focused={focused?.question_id === question.question_id}
                />
              ))}
            </div>
          </div>

          <Card className="lg:sticky lg:top-4 lg:self-start">
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-[12px] text-muted-foreground">
                {focused
                  ? `Question ${focused.number}'s answer line is highlighted.`
                  : "Select a question to highlight the line that carries its answer."}
              </p>
              <div className="scrollbar-thin max-h-[60vh] overflow-y-auto pr-1">
                <TranscriptPanel
                  lines={part.transcript.lines}
                  speakers={part.transcript.speakers}
                  highlightIndex={focused?.cue_line_index ?? null}
                  highlightTerms={focused ? focused.accepted.flat() : []}
                  onJump={(ms) => seekRef.current?.(ms)}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------------- player ---

function ReviewPlayer({
  part,
  onReady,
}: {
  part: ReviewPart;
  onReady: (seek: (ms: number) => void) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(null);
    if (!part.media_path) {
      setFailed(
        "This part's audio is no longer in the cache, so the replay buttons are switched off. The transcript below is complete.",
      );
      return undefined;
    }
    void api
      .mediaUrl(part.media_path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFailed(err instanceof ApiError ? err.detail : "the audio link could not be signed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [part.media_path]);

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, ms / 1000);
    void playAudio(audio).catch(() => {
      /* the learner can press play — nothing to recover from */
    });
  }, []);

  useEffect(() => {
    onReady(seek);
  }, [onReady, seek]);

  if (failed) {
    return (
      <p className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-[13px] text-muted-foreground">
        {failed}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="mb-2 text-[12px] text-muted-foreground">
        Playback is unlocked in review — seek anywhere, or use a timestamp to jump to a line.
      </p>
      {src ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript beside it is the caption
        <audio ref={audioRef} src={src} controls preload="metadata" className="w-full" />
      ) : (
        <div className="h-10 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      )}
    </div>
  );
}

// ----------------------------------------------------------------- one row ----

function QuestionRow({
  question,
  saveState,
  onAdd,
  onReplay,
  onFocusQuestion,
  focused,
}: {
  question: ReviewQuestion;
  saveState: SaveState;
  onAdd: () => void;
  onReplay?: () => void;
  onFocusQuestion: () => void;
  focused: boolean;
}) {
  const correct = question.correct === true;
  const accepted = question.accepted.map((slot) => slot.join(" / ")).join(" + ");
  const canAdd = !correct && question.accepted.some((slot) => slot.length > 0);

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-colors",
        focused ? "border-primary/60 bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold tabular-nums",
            correct ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
          )}
        >
          {question.number}
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          <button
            type="button"
            onClick={onFocusQuestion}
            className="w-full rounded text-left text-[13px] leading-relaxed hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {question.prompt || typeLabel(question.type)}
          </button>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <span className="flex items-center gap-1.5">
              {correct ? (
                <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              ) : (
                <X className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
              )}
              <span className="text-muted-foreground">You wrote</span>
              <span className={cn("font-medium", !question.given && "text-muted-foreground")}>
                {question.given || "— nothing —"}
              </span>
            </span>
            {!correct && accepted && (
              <span>
                <span className="text-muted-foreground">Accepted</span>{" "}
                <span className="font-medium text-success">{accepted}</span>
              </span>
            )}
            {question.near_miss_spelling && <Badge tone="warning">spelling</Badge>}
            <Badge tone="outline">{typeLabel(question.type)}</Badge>
          </div>

          {question.cue_text && (
            <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-[12px] leading-relaxed text-muted-foreground">
              &ldquo;{question.cue_text}&rdquo;
            </p>
          )}
          {question.explanation && (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {question.explanation}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {onReplay && (
              <Button size="sm" variant="outline" onClick={onReplay}>
                <Play className="h-3.5 w-3.5" />
                Replay from {formatTimestamp(question.audio_ms ?? 0)}
              </Button>
            )}
            {canAdd && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onAdd}
                loading={saveState === "saving"}
                disabled={saveState === "added"}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                {saveState === "added"
                  ? "In your vocabulary inbox"
                  : saveState === "error"
                    ? "Retry adding to vocabulary"
                    : "Add to vocabulary"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

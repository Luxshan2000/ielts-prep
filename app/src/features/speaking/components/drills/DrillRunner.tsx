/**
 * The drill surface on a topic card.
 *
 * Four kinds, all built from this card's own teaching payload rather than a generic
 * bank — the minimal pairs come from the card's pronunciation focus, the repair item
 * from its error watchlist. That is the whole reason the drills live here and not in a
 * separate exercises screen.
 *
 * The two-minute set is the recommended run: the server orders it, this plays it
 * through and keeps score. Individual kinds stay available for someone who knows what
 * they want to work on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Dumbbell,
  Mic,
  Play,
  RotateCcw,
  Square,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card, CardContent, EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { MockInProgressError, fetchCardDrills, fetchItemAudio, submitAttempt } from "./api";
import { useRecorder } from "@/components/practice/useRecorder";
import type { CardDrills, DrillItem, DrillResult } from "./types";

const KIND_LABEL: Record<string, string> = {
  shadowing: "Shadowing",
  minimal_pair: "Minimal pair",
  error_repair: "Error repair",
  extend: "Keep going",
};

export interface DrillRunnerProps {
  cardId: string;
  /** Whether the learner has spoken this card — shadowing quotes a model answer. */
  attempted: boolean;
  /** Send the learner to the prep minute when a gated kind is unavailable. */
  onPractise?: () => void;
}

export function DrillRunner({ cardId, attempted, onPractise }: DrillRunnerProps) {
  const [pack, setPack] = useState<CardDrills | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const [queue, setQueue] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<Record<string, DrillResult>>({});
  const [grading, setGrading] = useState(false);

  const recorder = useRecorder();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setBlocked(null);
    fetchCardDrills(cardId, attempted)
      .then((doc) => {
        if (!active) return;
        setPack(doc);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof MockInProgressError) setBlocked(err.message);
        else setError(err instanceof Error ? err.message : "Could not load the drills.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [cardId, attempted]);

  const byId = useMemo(() => {
    const map = new Map<string, DrillItem>();
    for (const item of pack?.items ?? []) map.set(item.item_id, item);
    return map;
  }, [pack]);

  const current = queue.length ? byId.get(queue[cursor]) ?? null : null;
  const done = queue.length > 0 && cursor >= queue.length;

  const start = useCallback((ids: string[]) => {
    setQueue(ids);
    setCursor(0);
    setResults({});
  }, []);

  const advance = useCallback(() => setCursor((c) => c + 1), []);

  const grade = useCallback(
    async (item: DrillItem, payload: { wav?: Blob; choice?: string }) => {
      setGrading(true);
      try {
        const result = await submitAttempt({
          cardId,
          itemId: item.item_id,
          attempted,
          ...payload,
        });
        setResults((r) => ({ ...r, [item.item_id]: result }));
      } catch (err) {
        if (err instanceof MockInProgressError) setBlocked(err.message);
        else setError(err instanceof Error ? err.message : "Grading failed.");
      } finally {
        setGrading(false);
      }
    },
    [attempted, cardId],
  );

  // ------------------------------------------------------------------ states ---

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (blocked) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Not during a mock"
        description={blocked}
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="The drills could not load"
        description={error}
        action={
          <Button variant="secondary" onClick={() => location.reload()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!pack || pack.items.length === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No drills on this card"
        description="Drills are built from a card's pronunciation focus and error watchlist. Sets authored with the teaching payload have them."
      />
    );
  }

  if (done) {
    const scored = queue.map((id) => results[id]).filter(Boolean);
    const passed = scored.filter((r) => r.passed !== false).length;
    return (
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" aria-hidden="true" />
          <div>
            <p className="text-[15px] font-semibold">Set finished</p>
            <p className="text-[13px] text-muted-foreground">
              {passed} of {scored.length} clean. Repeat the set tomorrow rather than twice
              today — spacing is what makes it stick.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Button onClick={() => start(pack.plan)}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Run it again
            </Button>
            <Button variant="ghost" onClick={() => setQueue([])}>
              Back to the drills
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (current) {
    return (
      <DrillCard
        item={current}
        index={cursor}
        total={queue.length}
        result={results[current.item_id]}
        grading={grading}
        recorder={recorder}
        cardId={cardId}
        attempted={attempted}
        onGrade={grade}
        onNext={advance}
      />
    );
  }

  // ------------------------------------------------------------------ picker ---

  // `unavailable_kinds` is keyed by kind, so a missing shadowing entry means it is offered.
  const shadowingBlockedBecause = pack.unavailable_kinds?.shadowing;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-[15px] font-semibold">The two-minute set</p>
            <p className="text-[13px] text-muted-foreground">
              {pack.plan.length} drills, about {Math.round(pack.set_budget_s / 60)} minutes,
              in the order that builds on itself.
            </p>
          </div>
          <Button onClick={() => start(pack.plan)} disabled={pack.plan.length === 0}>
            <Play className="h-4 w-4" aria-hidden="true" />
            Start the set
          </Button>
        </CardContent>
      </Card>

      {pack.accent_notice && (
        <p className="text-[12px] text-muted-foreground">{pack.accent_notice}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {pack.items.map((item) => (
          <button
            key={item.item_id}
            type="button"
            onClick={() => start([item.item_id])}
            className={cn(
              "rounded-xl border border-border bg-card p-4 text-left transition",
              "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-ring",
            )}
          >
            <div className="flex items-center gap-2">
              <Badge>{KIND_LABEL[item.kind] ?? item.kind}</Badge>
              <span className="text-[11px] text-muted-foreground">{item.seconds}s</span>
            </div>
            <p className="mt-2 text-[14px] font-medium">{item.title}</p>
            {item.why && (
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{item.why}</p>
            )}
          </button>
        ))}
      </div>

      {shadowingBlockedBecause && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-[13px] text-muted-foreground">{shadowingBlockedBecause}</p>
            {onPractise && (
              <Button size="sm" variant="secondary" onClick={onPractise}>
                Rehearse the card
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ====================================================================== item ===

interface DrillCardProps {
  item: DrillItem;
  index: number;
  total: number;
  result?: DrillResult;
  grading: boolean;
  recorder: ReturnType<typeof useRecorder>;
  cardId: string;
  attempted: boolean;
  onGrade: (item: DrillItem, payload: { wav?: Blob; choice?: string }) => Promise<void>;
  onNext: () => void;
}

function DrillCard({
  item,
  index,
  total,
  result,
  grading,
  recorder,
  cardId,
  attempted,
  onGrade,
  onNext,
}: DrillCardProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isChoice = item.grading.mode === "choice";

  useEffect(() => {
    let active = true;
    setAudioUrl(null);
    if (!item.audio) return;
    fetchItemAudio(cardId, item.item_id, attempted)
      .then((url) => active && setAudioUrl(url))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [attempted, cardId, item]);

  const take = async () => {
    const blob = await recorder.record(item.seconds);
    if (blob) await onGrade(item, { wav: blob });
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <Badge>{KIND_LABEL[item.kind] ?? item.kind}</Badge>
          <span className="text-[12px] text-muted-foreground">
            {index + 1} of {total}
          </span>
        </div>

        <div>
          <p className="text-[15px] font-semibold">{item.title}</p>
          <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
            {item.instruction}
          </p>
        </div>

        <PromptBody item={item} />

        {audioUrl && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => audioRef.current?.play()}
              aria-label="Play the reference recording"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Listen
            </Button>
            <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />
          </div>
        )}

        {/* ------------------------------------------------------- answering --- */}
        {!result && isChoice && (
          <div className="flex flex-wrap gap-2">
            {(["a", "b"] as const).map((choice) => (
              <Button
                key={choice}
                variant="secondary"
                disabled={grading}
                onClick={() => void onGrade(item, { choice })}
              >
                {String(item.prompt[choice] ?? choice.toUpperCase())}
              </Button>
            ))}
          </div>
        )}

        {!result && !isChoice && (
          <div className="flex items-center gap-3">
            {recorder.state === "recording" ? (
              <Button variant="destructive" onClick={recorder.stop}>
                <Square className="h-4 w-4" aria-hidden="true" />
                Stop ({recorder.remaining ?? 0}s)
              </Button>
            ) : (
              <Button onClick={() => void take()} loading={grading} disabled={grading}>
                <Mic className="h-4 w-4" aria-hidden="true" />
                Record {item.seconds}s
              </Button>
            )}
            {recorder.error && (
              <p className="text-[12px] text-destructive">{recorder.error}</p>
            )}
          </div>
        )}

        {result && <ResultBody result={result} onNext={onNext} last={index + 1 >= total} />}
      </CardContent>
    </Card>
  );
}

function PromptBody({ item }: { item: DrillItem }) {
  const p = item.prompt;

  if (item.kind === "shadowing" && p.sentence) {
    return (
      <blockquote className="rounded-lg border-l-2 border-primary bg-muted/40 p-4">
        <p className="text-[15px] leading-7">{p.sentence}</p>
        {p.chunks && p.chunks.length > 0 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Thought groups: {p.chunks.join(" / ")}
          </p>
        )}
      </blockquote>
    );
  }

  if (item.kind === "minimal_pair") {
    return (
      <div className="rounded-lg bg-muted/40 p-4">
        <p className="text-[15px]">
          <span className="font-medium">{String(p.a)}</span>
          <span className="mx-2 text-muted-foreground">vs</span>
          <span className="font-medium">{String(p.b)}</span>
        </p>
        {p.contrast && (
          <p className="mt-1 text-[12px] text-muted-foreground">{String(p.contrast)}</p>
        )}
      </div>
    );
  }

  if (item.kind === "error_repair") {
    return (
      <div className="space-y-2 rounded-lg bg-muted/40 p-4">
        <p className="text-[15px] line-through decoration-destructive/70">
          {String(p.wrong ?? p.sentence ?? "")}
        </p>
        {p.hint && <p className="text-[12px] text-muted-foreground">{String(p.hint)}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-muted/40 p-4">
      <p className="text-[15px] leading-7">{String(p.stub ?? p.sentence ?? "")}</p>
    </div>
  );
}

function ResultBody({
  result,
  onNext,
  last,
}: {
  result: DrillResult;
  onNext: () => void;
  last: boolean;
}) {
  const ok = result.passed !== false;
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
        )}
        <p className="text-[14px] font-medium">
          {ok ? "Clean" : "Not quite"}
          {typeof result.score === "number" && (
            <span className="ml-2 text-muted-foreground">{Math.round(result.score)}/100</span>
          )}
        </p>
      </div>

      {result.words && result.words.length > 0 && (
        <p className="text-[14px] leading-7">
          {result.words.map((w, i) => (
            <span
              key={`${w.word}-${i}`}
              className={cn(
                "mr-1",
                w.ok ? "text-foreground" : "rounded bg-destructive/15 px-1 text-destructive",
              )}
            >
              {w.word}
            </span>
          ))}
        </p>
      )}

      {result.heard && (
        <p className="text-[12px] text-muted-foreground">Heard: “{result.heard}”</p>
      )}
      {result.feedback && <p className="text-[13px] leading-6">{result.feedback}</p>}

      <Button size="sm" onClick={onNext}>
        {last ? "Finish" : "Next drill"}
      </Button>
    </div>
  );
}

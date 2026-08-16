import { useCallback, useState } from "react";
import { AlertTriangle, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useRecorder } from "./useRecorder";

/**
 * Say the answer instead of typing it.
 *
 * A spoken answer is a typed answer that arrived by microphone: this records one take, posts
 * it, and hands the caller back whatever the ordinary grader said. There is no second grading
 * path on either side of the wire.
 *
 * Three things this deliberately does:
 *
 * - **It always shows what was heard.** A verdict on a transcript the learner cannot see is
 *   unarguable, and the recogniser is the most likely thing to be wrong.
 * - **It never blocks the typed path.** Speaking is an alternative, so the caller keeps its
 *   text input and this sits beside it. No microphone permission, no speech provider, an
 *   unsupported browser — every one of those has to leave a working exercise behind, not a
 *   dead end.
 * - **A refusal is not a wrong answer.** Silence, room tone and Whisper's stock
 *   hallucinations come back from the sidecar as `gradeable: false`, and the caller is told
 *   to leave the card alone. Being marked wrong because a microphone was muted is worse than
 *   being told nothing.
 */

export interface SpokenResult {
  transcript: string;
  heard: string;
  gradeable: boolean;
  refusal: string | null;
  graded: unknown;
}

export interface SpeakAnswerProps {
  /** Sends the recording and resolves with the sidecar's reply. */
  onSubmit: (audio: Blob) => Promise<SpokenResult>;
  /** Seconds before the take stops itself. */
  seconds?: number;
  /** What the learner is being asked to say, shown above the button. */
  prompt?: string;
  disabled?: boolean;
  className?: string;
}

export function SpeakAnswer({
  onSubmit,
  seconds = 20,
  prompt,
  disabled = false,
  className,
}: SpeakAnswerProps) {
  const recorder = useRecorder();
  const [result, setResult] = useState<SpokenResult | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const start = useCallback(async () => {
    setResult(null);
    setFailure(null);
    const audio = await recorder.record(seconds);
    if (!audio) return; // the recorder surfaces its own reason
    setSending(true);
    try {
      setResult(await onSubmit(audio));
    } catch (err) {
      setFailure(
        err instanceof Error && /503|speech_unavailable/.test(err.message)
          ? "Speech is not set up on this machine yet. Type your answer instead. You can turn speech on in Settings."
          : "That recording could not be checked. Type your answer instead, or try again.",
      );
    } finally {
      setSending(false);
    }
  }, [onSubmit, recorder, seconds]);

  const recording = recorder.state === "recording";
  const blocked = recorder.state === "denied" || recorder.state === "unsupported";

  return (
    <div className={cn("space-y-2", className)}>
      {prompt && <p className="text-[13px] text-muted-foreground">{prompt}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={recording ? "outline" : "primary"}
          size="sm"
          disabled={disabled || sending || blocked}
          onClick={() => (recording ? recorder.stop() : void start())}
        >
          {recording ? (
            <>
              <Square className="h-4 w-4" />
              Stop
              {recorder.remaining != null && ` (${recorder.remaining}s)`}
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              {sending ? "Checking…" : "Say it instead"}
            </>
          )}
        </Button>
        {recording && (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
            Listening
          </span>
        )}
      </div>

      {/* The recorder's own failures already read as instructions; pass them straight on. */}
      {(recorder.error || failure) && (
        <p className="flex items-start gap-1.5 text-[13px] text-warning" role="status">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {failure ?? recorder.error}
        </p>
      )}

      {result && (
        <div
          className={cn(
            "rounded-lg border p-2.5 text-[13px]",
            result.gradeable ? "border-border bg-card" : "border-warning/40 bg-warning/10",
          )}
          role="status"
        >
          {result.gradeable ? (
            <p>
              <span className="text-muted-foreground">Heard: </span>
              <span className="font-medium">{result.heard}</span>
            </p>
          ) : (
            <p>{result.refusal ?? "Nothing was picked up. Try again."}</p>
          )}
        </div>
      )}
    </div>
  );
}

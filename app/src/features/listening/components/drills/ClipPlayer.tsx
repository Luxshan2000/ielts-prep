import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { playAudio } from "../../media";
import type { Clip } from "./types";

/**
 * Plays one window of a rendered part, and nothing else.
 *
 * **Why a window and not a file.** Every audio drill here is a few seconds out of the middle
 * of a recording the app has already synthesized. Rather than generate a new asset per item
 * — which would make each drill cost thirty seconds of Kokoro time — the component seeks the
 * part's own WAV to `clip.start_ms` and stops itself at `clip.end_ms`. The sidecar serves
 * the file with HTTP `Range`, so the browser fetches roughly the bytes it needs and nothing
 * is written to disk.
 *
 * **Why the transport is this bare.** No scrubber, no timeline, no waveform. A learner who
 * can drag a playhead will nudge it back a word at a time until the sentence resolves, and
 * what they will have practised is dragging. The only controls are *play from the start of
 * the clip* and *stop*, which is a replay, not a rewind.
 *
 * **Replays are counted, not limited.** Unlimited replay is the correct dose for dictation —
 * the exercise is decoding, not memory — but how many times a learner needed the line is a
 * genuinely useful number, so it is reported upward and shown back to them.
 */

export interface ClipPlayerHandle {
  /** Milliseconds into the clip right now, or `null` when it is not playing. */
  position(): number | null;
  stop(): void;
}

export interface ClipPlayerProps {
  mediaPath: string | null | undefined;
  clip: Clip | null | undefined;
  /** Reset the replay counter and stop playback when this changes. */
  resetKey?: string;
  onReplay?: (count: number) => void;
  /** Fires on every animation frame while playing, with ms since the clip's start. */
  onTick?: (elapsedMs: number) => void;
  autoPlay?: boolean;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export const ClipPlayer = forwardRef<ClipPlayerHandle, ClipPlayerProps>(function ClipPlayer(
  { mediaPath, clip, resetKey, onReplay, onTick, autoPlay = false, label, className, disabled },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [replays, setReplays] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // The media route is ticket-authed, so the URL has to be signed before it can be an
  // `<audio src>`. One ticket per part is enough: every clip is a range of the same file.
  useEffect(() => {
    let live = true;
    setSrc(null);
    setError(null);
    if (!mediaPath) return undefined;
    void api
      .mediaUrl(mediaPath)
      .then((url) => live && setSrc(url))
      .catch((err: unknown) =>
        live &&
        setError(err instanceof ApiError ? err.detail : "the audio link could not be signed"),
      );
    return () => {
      live = false;
    };
  }, [mediaPath]);

  const stopTicking = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopTicking();
    const element = audioRef.current;
    if (element) element.pause();
    setPlaying(false);
  }, [stopTicking]);

  // A new item means a new clip: never carry a running playhead or a replay count across.
  useEffect(() => {
    stop();
    setReplays(0);
    setElapsed(0);
  }, [resetKey, stop]);

  useEffect(() => stop, [stop]);

  const play = useCallback(() => {
    const element = audioRef.current;
    if (!element || !clip || disabled) return;
    stopTicking();
    element.currentTime = clip.start_ms / 1000;
    setElapsed(0);
    void playAudio(element)
      .then(() => {
        setPlaying(true);
        setReplays((n) => {
          const next = n + 1;
          onReplay?.(next);
          return next;
        });
        const tick = () => {
          const node = audioRef.current;
          if (!node) return;
          const ms = node.currentTime * 1000;
          // `timeupdate` fires about four times a second, which is far too coarse to
          // stop a two-second clip on the right word — so the boundary is checked on
          // animation frames instead.
          if (ms >= clip.end_ms) {
            node.pause();
            setPlaying(false);
            stopTicking();
            return;
          }
          const since = Math.max(0, ms - clip.start_ms);
          setElapsed(since);
          onTick?.(since);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch(() => setError("this browser refused to start the audio"));
  }, [clip, disabled, onReplay, onTick, stopTicking]);

  useEffect(() => {
    if (autoPlay && src && clip && !disabled) play();
    // Intentionally keyed on the clip identity only: re-running on every `play` identity
    // change would restart the clip whenever a parent re-rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, src, clip?.start_ms, clip?.end_ms, disabled]);

  useImperativeHandle(
    ref,
    () => ({
      position: () => (playing ? elapsed : null),
      stop,
    }),
    [playing, elapsed, stop],
  );

  const lengthMs = clip ? clip.end_ms - clip.start_ms : 0;
  const progress = lengthMs > 0 ? Math.min(1, elapsed / lengthMs) : 0;

  if (error) {
    return (
      <p role="alert" className={cn("text-[13px] font-medium text-destructive", className)}>
        {error}
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {src && (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript is the answer; showing it here would end the exercise
        <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={playing ? "outline" : "primary"}
          onClick={playing ? stop : play}
          disabled={!src || !clip || disabled}
        >
          {playing ? (
            <Square className="h-4 w-4" />
          ) : replays > 0 ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {playing ? "Stop" : replays > 0 ? "Play it again" : (label ?? "Play the clip")}
        </Button>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {(lengthMs / 1000).toFixed(1)}s
        </span>
        {replays > 0 && (
          <span className="text-[12px] text-muted-foreground">
            {replays} {replays === 1 ? "play" : "plays"}
          </span>
        )}
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
});

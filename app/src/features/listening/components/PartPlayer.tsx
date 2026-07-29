import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Headphones,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Rewind,
  FastForward,
} from "lucide-react";
import { Badge, Button, Progress, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { playAudio } from "../media";
import type { ListeningPart } from "../types";

const SPEEDS = [
  { value: "0.75", label: "0.75×" },
  { value: "0.9", label: "0.9×" },
  { value: "1", label: "1.0×" },
  { value: "1.1", label: "1.1×" },
  { value: "1.25", label: "1.25×" },
];

/** Seconds of drift tolerated before the exam-mode guard yanks playback back. */
const SEEK_TOLERANCE = 1.5;

export interface PartPlayerProps {
  part: ListeningPart;
  partIndex: number;
  partCount: number;
  /** Exam mode: one play, no pause, no seek, fixed speed (07 §4). */
  exam: boolean;
  /** True once this part's audio has been played to the end in this attempt. */
  playedOnce: boolean;
  /** Start playing as soon as the source is ready (exam auto-advance). */
  autoStart?: boolean;
  onPlayStarted: () => void;
  onEnded: () => void;
  /** Practice only — lets the parent seek the player to a cue line. */
  onReady?: (seekTo: (ms: number) => void) => void;
}

/**
 * The listening player.
 *
 * Exam mode mounts no seek bar, no pause and no speed control, and refuses a
 * second play — the restriction is client-side by design (07 §4: single-user
 * local app, the server is not an adversary). Practice mode unlocks everything.
 */
export function PartPlayer({
  part,
  partIndex,
  partCount,
  exam,
  playedOnce,
  autoStart = false,
  onPlayStarted,
  onEnded,
  onReady,
}: PartPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const guardRef = useRef(0);
  const startedRef = useRef(false);

  const [src, setSrc] = useState<string | null>(null);
  const [srcError, setSrcError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(part.audio.duration_ms / 1000);
  const [rate, setRate] = useState("1");
  const [blocked, setBlocked] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Ticket-signed URL — an <audio> element cannot send an Authorization header.
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setSrcError(null);
    setPosition(0);
    setPlaying(false);
    setBlocked(false);
    setInterrupted(false);
    setMediaError(null);
    guardRef.current = 0;
    startedRef.current = false;

    void api
      .mediaUrl(part.audio.media_path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSrcError(
          err instanceof ApiError ? err.detail : "the audio link could not be signed",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [part.id, part.audio.media_path]);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setBlocked(false);
    setInterrupted(false);
    setMediaError(null);
    try {
      await playAudio(audio);
      if (!startedRef.current) {
        startedRef.current = true;
        onPlayStarted();
      }
    } catch {
      // Chromium blocks playback that is not tied to a gesture; say so plainly.
      setBlocked(true);
    }
  }, [onPlayStarted]);

  useEffect(() => {
    if (!autoStart || !src || playedOnce) return;
    void start();
  }, [autoStart, src, playedOnce, start]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = exam ? 1 : Number(rate);
    // preservesPitch keeps 0.75× intelligible rather than chipmunked.
    type PitchAudio = HTMLAudioElement & { preservesPitch?: boolean };
    (audio as PitchAudio).preservesPitch = true;
  }, [rate, exam, src]);

  const seekTo = useCallback(
    (ms: number) => {
      const audio = audioRef.current;
      if (!audio || exam) return;
      audio.currentTime = Math.max(0, ms / 1000);
      setPosition(audio.currentTime);
      void playAudio(audio).catch(() => setBlocked(true));
    },
    [exam],
  );

  useEffect(() => {
    onReady?.(seekTo);
  }, [onReady, seekTo]);

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (exam) {
      // Guard against any seek the platform allows (media keys, touch bar).
      if (audio.currentTime > guardRef.current + SEEK_TOLERANCE) {
        audio.currentTime = guardRef.current;
        return;
      }
      guardRef.current = Math.max(guardRef.current, audio.currentTime);
    }
    setPosition(audio.currentTime);
  };

  const finished = playedOnce && !playing;
  const total = duration || part.audio.duration_ms / 1000;
  const pct = total > 0 ? Math.min(100, (position / total) * 100) : 0;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              playing ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <Headphones className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              Part {part.part} of {partCount} — {part.title}
            </p>
            <p className="truncate text-[12px] text-muted-foreground">
              {part.audio.accent_label}
              {part.scenario ? ` · ${part.scenario}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {exam && (
            <Badge tone="warning" className="gap-1">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Plays once
            </Badge>
          )}
          <span
            className="text-[12px] tabular-nums text-muted-foreground"
            aria-label="Playback position"
          >
            {formatDuration(position)} / {formatDuration(total)}
          </span>
        </div>
      </div>

      {srcError && (
        <p role="alert" className="text-[13px] text-destructive">
          {srcError}
        </p>
      )}
      {mediaError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-[13px] text-foreground">{mediaError}</p>
        </div>
      )}

      {exam ? (
        <Progress
          value={pct}
          label={playing ? "Playing" : finished ? "Part finished" : "Ready to play"}
          detail={
            playedOnce && !playing
              ? "this part cannot be replayed"
              : "pause, rewind and replay are switched off"
          }
        />
      ) : (
        <label className="block">
          <span className="sr-only">Seek within part {part.part}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(total))}
            step={1}
            value={Math.round(position)}
            onChange={(e) => {
              const audio = audioRef.current;
              if (!audio) return;
              audio.currentTime = Number(e.target.value);
              setPosition(audio.currentTime);
            }}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!src && !srcError ? (
          <Spinner label="Loading audio…" />
        ) : exam ? (
          <Button onClick={() => void start()} disabled={!src || playing || playedOnce}>
            <Play className="h-4 w-4" />
            {playing ? "Playing" : playedOnce ? "Already played" : `Play part ${part.part}`}
          </Button>
        ) : (
          <>
            <Button
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                if (playing) audio.pause();
                else void start();
              }}
              disabled={!src}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? "Pause" : position > 0 ? "Resume" : "Play"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Back 5 seconds"
              disabled={!src}
              onClick={() => {
                const audio = audioRef.current;
                if (audio) audio.currentTime = Math.max(0, audio.currentTime - 5);
              }}
            >
              <Rewind className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Forward 5 seconds"
              disabled={!src}
              onClick={() => {
                const audio = audioRef.current;
                if (audio) audio.currentTime = Math.min(total, audio.currentTime + 5);
              }}
            >
              <FastForward className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Replay from the start"
              disabled={!src}
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                audio.currentTime = 0;
                void start();
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <div className="w-28">
              <Select
                value={rate}
                onChange={setRate}
                options={SPEEDS}
                aria-label="Playback speed"
              />
            </div>
          </>
        )}

        {blocked && (
          <Button variant="secondary" onClick={() => void start()}>
            Continue playing
          </Button>
        )}
        {/*
          `playedOnce` means "this part has *started*" — `onPlayStarted` fires on the first
          `play` event, not on `ended` — so gating this button on `!playedOnce` made it dead
          code in the only mode that renders it. An exam part that was interrupted (a media
          key, a device change, an OS ducking event) then had no way back and the candidate
          silently lost the rest of a part, up to 10 marks, with the audio unplayable again.
          `interrupted` is already the precise signal: `onPause` sets it only when the audio
          stopped before `ended`, `start()` and `onEnded` clear it. Resuming is safe because
          `start()` never rewinds — it calls `play()` on the paused element — and the
          `onSeeking`/`onTimeUpdate` guard still pins `currentTime` to the high-water mark,
          so this cannot become a way to re-hear anything.
        */}
        {exam && interrupted && !playing && (
          <Button variant="secondary" onClick={() => void start()}>
            Playback stopped — continue
          </Button>
        )}
      </div>

      {exam && (
        <p className="text-[12px] text-muted-foreground">
          {partIndex + 1 < partCount
            ? "This recording plays once and moves straight on to the next part, exactly like the real test."
            : "This is the last part. The two-minute check step opens as soon as it finishes."}
        </p>
      )}

      {src && (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript is the caption, unlocked in review
        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          onPlay={() => {
            setPlaying(true);
            setInterrupted(false);
            if (!startedRef.current) {
              startedRef.current = true;
              onPlayStarted();
            }
          }}
          onPause={() => {
            setPlaying(false);
            const audio = audioRef.current;
            if (exam && audio && !audio.ended) setInterrupted(true);
          }}
          onTimeUpdate={onTimeUpdate}
          onSeeking={() => {
            const audio = audioRef.current;
            if (!audio || !exam) return;
            if (Math.abs(audio.currentTime - guardRef.current) > SEEK_TOLERANCE) {
              audio.currentTime = guardRef.current;
            }
          }}
          onLoadedMetadata={() => {
            const audio = audioRef.current;
            if (audio && Number.isFinite(audio.duration)) setDuration(audio.duration);
          }}
          onEnded={() => {
            setPlaying(false);
            setInterrupted(false);
            onEnded();
          }}
          onError={() =>
            setMediaError(
              "This part's audio stopped loading. It is cached on this machine — reopen the test to continue.",
            )
          }
        />
      )}
    </div>
  );
}

/**
 * The coach's audio: a single element that plays *windows* of the recording.
 *
 * Everything the coach teaches is anchored to a moment — the line that carried the
 * answer, the line where the speaker offered the decoy, the three seconds around a
 * signpost. Replaying that moment is the highest-value review action available in a
 * skill whose audio otherwise plays once and is gone, so it is one button, never a
 * scrub bar the learner has to aim at.
 *
 * A clip is `{startMs, endMs}`. A queue of clips plays back to back, which is what
 * puts the withdrawn value and the real one three seconds apart — the single most
 * useful thing this module can show a learner who wrote the wrong one.
 *
 * The full transport stays mounted underneath, because in review there is no reason
 * to withhold it and a learner who wants to hear the whole part should not have to
 * leave the screen to do it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Square } from "lucide-react";
import { Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { playAudio } from "../../media";

export interface Clip {
  startMs: number;
  /** `null` plays to the end of the recording. */
  endMs: number | null;
  /** Announced while it plays, e.g. "what he said first". */
  label?: string;
}

export interface ClipPlayer {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  src: string | null;
  error: string | null;
  /** True once the media URL is signed and the element can be told to play. */
  ready: boolean;
  playing: boolean;
  /** The clip currently sounding, so a card can light its own button. */
  current: Clip | null;
  play: (clips: Clip[]) => void;
  stop: () => void;
}

/** Play windows of one rendered part. `mediaPath` is the ticket-authed WAV path. */
export function useClipPlayer(mediaPath: string | null | undefined): ClipPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Clip[]>([]);
  const currentRef = useRef<Clip | null>(null);

  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<Clip | null>(null);

  // An <audio> element cannot send an Authorization header, so the path is signed.
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(null);
    if (!mediaPath) {
      setError(
        "This part's audio is not in the cache, so the replay buttons are switched off. Everything else on this screen still works.",
      );
      return undefined;
    }
    void api
      .mediaUrl(mediaPath)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.detail : "the audio link could not be signed");
      });
    return () => {
      cancelled = true;
    };
  }, [mediaPath]);

  const startClip = useCallback((clip: Clip) => {
    const audio = audioRef.current;
    if (!audio) return;
    currentRef.current = clip;
    setCurrent(clip);
    audio.currentTime = Math.max(0, clip.startMs / 1000);
    void playAudio(audio)
      .then(() => setPlaying(true))
      .catch(() => {
        // Autoplay policies block playback not tied to a gesture. Every caller here
        // *is* a click, so this is rare — say it plainly rather than failing silent.
        setError("The browser blocked playback. Press play on the bar below to allow it.");
        setPlaying(false);
      });
  }, []);

  const play = useCallback(
    (clips: Clip[]) => {
      if (clips.length === 0) return;
      setError(null);
      queueRef.current = clips.slice(1);
      startClip(clips[0]);
    },
    [startClip],
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    currentRef.current = null;
    setCurrent(null);
    setPlaying(false);
    audioRef.current?.pause();
  }, []);

  // The window guard: stop (or advance) the instant the clip's end goes past.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onTime = () => {
      const clip = currentRef.current;
      if (!clip?.endMs) return;
      if (audio.currentTime * 1000 < clip.endMs) return;
      const next = queueRef.current.shift();
      if (next) {
        startClip(next);
        return;
      }
      audio.pause();
      currentRef.current = null;
      setCurrent(null);
      setPlaying(false);
    };
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [src, startClip]);

  return { audioRef, src, error, ready: Boolean(src), playing, current, play, stop };
}

/**
 * The transport bar. Native controls, because a learner reviewing a recording wants
 * the platform's own scrubbing, keyboard handling and speed menu — this is review,
 * not the exam, and there is nothing to protect.
 */
export function ClipPlayerBar({
  player,
  title,
  className,
}: {
  player: ClipPlayer;
  /** Named in the element's accessible label, e.g. "Part 2 — Ashfield watermill". */
  title: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2 rounded-xl border border-border bg-card p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          {player.current?.label
            ? `Playing: ${player.current.label}`
            : "Replay any line, or press a moment button beside a question."}
        </p>
        {player.playing && (
          <Button size="sm" variant="outline" onClick={player.stop}>
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            Stop
          </Button>
        )}
      </div>

      {player.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/8 p-2 text-[12px] leading-5 text-muted-foreground"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          {player.error}
        </p>
      )}

      {player.src ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript on this screen is the caption
        <audio
          ref={player.audioRef}
          src={player.src}
          controls
          preload="metadata"
          aria-label={`Recording of ${title}`}
          className="w-full"
        />
      ) : (
        !player.error && (
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
        )
      )}
    </div>
  );
}

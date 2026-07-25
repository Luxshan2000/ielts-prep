/**
 * Per-turn replay button for the report (04 §7 / 18 §4.16).
 *
 * `<audio>` cannot send an Authorization header, so the source is a ticket-signed URL
 * minted lazily on first play — `api.mediaUrl()` is async and must be awaited before it
 * touches `src`. A missing recording is normal (the recorder is best-effort per 02 §5),
 * so the control disables itself with an explanation instead of erroring.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Pause, Play } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

export interface TurnAudioProps {
  sessionId: string;
  /** The recorder's filename, e.g. "turn-004.wav". `null` = nothing was written. */
  audioFile: string | null | undefined;
  label?: string;
  className?: string;
}

export function TurnAudio({ sessionId, audioFile, label = "Hear it", className }: TurnAudioProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = "";
      }
      audioRef.current = null;
    },
    [],
  );

  const toggle = useCallback(async () => {
    if (!audioFile) return;
    const existing = audioRef.current;
    if (existing && !existing.paused) {
      existing.pause();
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const el = existing ?? new Audio();
      if (!existing) {
        el.preload = "none";
        el.addEventListener("ended", () => setState("idle"));
        el.addEventListener("pause", () => setState((s) => (s === "playing" ? "idle" : s)));
        el.addEventListener("error", () => setState("error"));
        audioRef.current = el;
      }
      if (!el.src) {
        el.src = await api.mediaUrl(
          `/api/v1/media/speaking/${encodeURIComponent(sessionId)}/${encodeURIComponent(audioFile)}`,
        );
      }
      el.currentTime = 0;
      await el.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }, [audioFile, sessionId]);

  if (!audioFile) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] text-muted-foreground",
          className,
        )}
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        No recording
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void toggle()}
        aria-label={state === "playing" ? `Pause ${label}` : label}
      >
        {state === "loading" ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : state === "playing" ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {label}
      </Button>
      {state === "error" && (
        <span role="alert" className="text-[11px] text-destructive">
          Couldn't play that recording.
        </span>
      )}
    </span>
  );
}

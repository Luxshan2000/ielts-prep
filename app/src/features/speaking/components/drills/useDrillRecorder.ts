/**
 * A short, self-stopping recorder for one drill attempt.
 *
 * Drills are 8-30 seconds, so this deliberately does not stream: it collects chunks and
 * hands back one blob. The microphone track is stopped after every take rather than held
 * open, because a permanently lit recording indicator while someone reads a cue card is
 * both alarming and unnecessary.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "stopping" | "denied" | "unsupported";

export interface DrillRecorder {
  state: RecorderState;
  /** Seconds remaining in the current take, or null when not recording. */
  remaining: number | null;
  error: string | null;
  /** Records for `seconds`, stops itself, and resolves with the audio. */
  record: (seconds: number) => Promise<Blob | null>;
  stop: () => void;
}

/** Turn a getUserMedia failure into copy a learner can act on. */
function describe(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow it for this app, then try the drill again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Plug one in or pick another input in Settings.";
  }
  if (name === "NotReadableError") {
    return "The microphone is in use by another app. Close it and try again.";
  }
  return "The microphone could not be started.";
}

export function useDrillRecorder(): DrillRecorder {
  const [state, setState] = useState<RecorderState>("idle");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    timerRef.current = null;
    stopTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRemaining(null);
  }, []);

  // A drill abandoned mid-take must not leave the mic light on.
  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      setState("stopping");
      rec.stop();
    }
  }, []);

  const record = useCallback(
    async (seconds: number): Promise<Blob | null> => {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        setError("This browser cannot record audio.");
        return null;
      }
      setError(null);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        setState("denied");
        setError(describe(err));
        return null;
      }

      streamRef.current = stream;
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      return new Promise<Blob | null>((resolve) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          const blob = chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null;
          cleanup();
          setState("idle");
          resolve(blob);
        };
        recorder.onerror = () => {
          cleanup();
          setState("idle");
          setError("Recording stopped unexpectedly.");
          resolve(null);
        };

        recorder.start();
        setState("recording");
        setRemaining(seconds);

        timerRef.current = setInterval(() => {
          setRemaining((r) => (r == null ? null : Math.max(0, r - 1)));
        }, 1000);
        stopTimeoutRef.current = setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, seconds * 1000);
      });
    },
    [cleanup],
  );

  return { state, remaining, error, record, stop };
}

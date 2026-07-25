/**
 * Headword audio with an honest fallback chain.
 *
 * 1. The cached WAV the sidecar serves at `/api/v1/media/vocab/<id>.wav`
 *    (ticket-signed through `api.mediaUrl`).
 * 2. The platform speech synthesiser, when nothing has been rendered yet —
 *    nothing in the sidecar renders vocabulary audio ahead of time, so without
 *    this the "listen" affordances would be dead on a fresh install.
 * 3. `unavailable`, which the caller must surface (never a silent no-op).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type AudioStatus = "idle" | "loading" | "playing" | "unavailable";

export type AudioSourceKind = "file" | "speech" | "none";

/** Media paths already known to be missing — never re-mint a ticket for them. */
const missing = new Set<string>();

function loadAudioElement(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "auto";
    const cleanup = () => {
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve(audio);
    };
    const onError = () => {
      cleanup();
      reject(new Error("audio file is not available"));
    };
    audio.addEventListener("canplaythrough", onReady);
    audio.addEventListener("error", onError);
    audio.src = url;
    audio.load();
  });
}

function speak(text: string, onEnd: () => void): boolean {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined" || !text.trim()) return false;
  try {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.92;
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export interface WordAudio {
  status: AudioStatus;
  /** Which source the last successful play used. */
  source: AudioSourceKind;
  play: () => Promise<void>;
  stop: () => void;
}

/**
 * @param mediaPath sidecar-relative media path (`entry.audio_url`), or null to
 *                  go straight to speech synthesis.
 * @param fallbackText what to say when there is no rendered file.
 */
export function useWordAudio(mediaPath: string | null, fallbackText: string): WordAudio {
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [source, setSource] = useState<AudioSourceKind>("none");
  const elementRef = useRef<HTMLAudioElement | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      elementRef.current?.pause();
      elementRef.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    elementRef.current?.pause();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (aliveRef.current) setStatus("idle");
  }, []);

  const play = useCallback(async () => {
    setStatus("loading");
    if (mediaPath && !missing.has(mediaPath)) {
      try {
        const url = await api.mediaUrl(mediaPath);
        const audio = await loadAudioElement(url);
        elementRef.current = audio;
        audio.onended = () => aliveRef.current && setStatus("idle");
        await audio.play();
        if (aliveRef.current) {
          setSource("file");
          setStatus("playing");
        }
        return;
      } catch {
        missing.add(mediaPath);
      }
    }
    const spoke = speak(fallbackText, () => aliveRef.current && setStatus("idle"));
    if (!aliveRef.current) return;
    setSource(spoke ? "speech" : "none");
    setStatus(spoke ? "playing" : "unavailable");
  }, [fallbackText, mediaPath]);

  return { status, source, play, stop };
}

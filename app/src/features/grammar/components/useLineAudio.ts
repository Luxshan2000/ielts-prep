/**
 * One spoken line, at a chosen speed.
 *
 * Dictation is the one item kind that cannot degrade to text: learners do not
 * hear the `'ve` in *I've been*, the `'d` that is either *had* or *would*, or the
 * `-ed` that vanishes before a consonant, and a structure you cannot hear is a
 * structure you will not produce (DESIGN §6 F10). So this hook plays whatever it
 * can and, when it can play nothing, says so out loud rather than leaving a dead
 * button — the item's renderer then shows the written line instead.
 *
 * Two sources, in order:
 *   1. the file the sidecar rendered with Kokoro, ticket-signed via `api.mediaUrl`;
 *   2. the platform speech synthesiser, which is what a fresh install has.
 *
 * The speed argument is why this is not the vocabulary feature's `useWordAudio`:
 * a dictation replay at 0.8× is part of the pedagogy, and that hook has no rate.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type LineAudioStatus = "idle" | "loading" | "playing" | "unavailable";

export interface LineAudio {
  status: LineAudioStatus;
  play: (rate?: number) => Promise<void>;
  stop: () => void;
}

/** Media paths already known to be missing — never mint a second ticket for them. */
const missing = new Set<string>();

function synthesise(text: string, rate: number, onEnd: () => void): boolean {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined" || !text.trim()) return false;
  try {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = Math.max(0.5, Math.min(1.2, rate));
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function useLineAudio(mediaPath: string | null, fallbackText: string): LineAudio {
  const [status, setStatus] = useState<LineAudioStatus>("idle");
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

  const play = useCallback(
    async (rate = 1) => {
      if (!aliveRef.current) return;
      setStatus("loading");

      const finish = () => {
        if (aliveRef.current) setStatus("idle");
      };

      if (mediaPath && !missing.has(mediaPath)) {
        try {
          const url = await api.mediaUrl(mediaPath);
          const audio = elementRef.current ?? new Audio();
          elementRef.current = audio;
          audio.src = url;
          audio.playbackRate = Math.max(0.5, Math.min(1.5, rate));
          audio.onended = finish;
          await audio.play();
          if (aliveRef.current) setStatus("playing");
          return;
        } catch {
          missing.add(mediaPath);
        }
      }

      if (synthesise(fallbackText, rate, finish)) {
        if (aliveRef.current) setStatus("playing");
        return;
      }
      if (aliveRef.current) setStatus("unavailable");
    },
    [fallbackText, mediaPath],
  );

  return { status, play, stop };
}

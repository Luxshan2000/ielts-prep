/**
 * RMS level (0..1) of a live `MediaStreamTrack`, smoothed for display.
 *
 * Pipecat's `localAudioLevel` / `remoteAudioLevel` RTVI events are emitted by the
 * Daily media manager only — `SmallWebRTCTransport` never fires them — so the live
 * HUD measures the tracks itself. Updates are throttled: the meter is decoration
 * and must not re-render the call stage at frame rate.
 */

import { useEffect, useRef, useState } from "react";

/** Minimum change before a re-render, and the minimum gap between them. */
const MIN_DELTA = 0.02;
const MIN_INTERVAL_MS = 70;

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

export function useTrackLevel(track: MediaStreamTrack | null, enabled = true): number {
  const [level, setLevel] = useState(0);
  const smoothed = useRef(0);

  useEffect(() => {
    if (!track || !enabled) {
      smoothed.current = 0;
      setLevel(0);
      return;
    }
    const Ctor = audioContextCtor();
    if (!Ctor) return;

    let raf: number | null = null;
    let stopped = false;
    let lastEmit = 0;
    let lastValue = 0;

    const ctx = new Ctor();
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    try {
      source = ctx.createMediaStreamSource(new MediaStream([track]));
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
    } catch {
      // A track can end between render and effect; the flat meter is the honest view.
      if (ctx.state !== "closed") {
        void ctx.close().catch((err: unknown) =>
          console.debug("[BandReady] level meter: audio context close failed", err),
        );
      }
      return;
    }
    if (ctx.state === "suspended") {
      void ctx.resume().catch((err: unknown) =>
        console.debug("[BandReady] level meter: audio context resume failed", err),
      );
    }

    const buffer = new Float32Array(analyser.fftSize);
    const tick = () => {
      if (stopped) return;
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
      // Perceptual-ish scaling: raw RMS on speech sits around 0.02–0.2.
      const scaled = Math.min(1, Math.sqrt(sum / buffer.length) * 5);
      smoothed.current = smoothed.current * 0.7 + scaled * 0.3;

      const now = performance.now();
      if (
        now - lastEmit >= MIN_INTERVAL_MS &&
        Math.abs(smoothed.current - lastValue) >= MIN_DELTA
      ) {
        lastEmit = now;
        lastValue = smoothed.current;
        setLevel(smoothed.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      if (raf !== null) cancelAnimationFrame(raf);
      try {
        source.disconnect();
      } catch {
        /* already torn down */
      }
      if (ctx.state !== "closed") {
        void ctx.close().catch((err: unknown) =>
          console.debug("[BandReady] level meter: audio context close failed", err),
        );
      }
      smoothed.current = 0;
    };
  }, [track, enabled]);

  return level;
}

/**
 * Live microphone check for the pre-call screen (02 §6.2): enumerate inputs,
 * open the selected device, and publish an RMS level so the meter moves before
 * the learner commits to a timed session.
 *
 * The stream opened here is closed before the session starts — Pipecat opens its
 * own capture in `initDevices()` and two live captures on one device fight on
 * Windows.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface MicCheckState {
  devices: MediaDeviceInfo[];
  /** 0..1 RMS of the selected input, smoothed. */
  level: number;
  /** True once we have a live stream and the meter is meaningful. */
  listening: boolean;
  error: unknown;
  /** Ask for permission / (re)open the selected device. */
  open: (deviceId?: string | null) => Promise<void>;
  /** Release the device (called before handing the mic to Pipecat). */
  close: () => void;
  /** True once at least one non-empty device label is available. */
  labelled: boolean;
}

export function useMicCheck(deviceId: string | null): MicCheckState {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(0);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothed = useRef(0);

  const close = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    smoothed.current = 0;
    setLevel(0);
    setListening(false);
  }, []);

  const open = useCallback(
    async (nextId?: string | null) => {
      close();
      setError(null);
      const wanted = nextId ?? deviceId;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: wanted ? { deviceId: { exact: wanted } } : true,
        });
        streamRef.current = stream;

        // Labels are empty until permission is granted, so re-enumerate here.
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((d) => d.kind === "audioinput"));

        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) {
          setListening(true);
          return;
        }
        const ctx = new Ctor();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);

        const buffer = new Float32Array(analyser.fftSize);
        const tick = () => {
          if (ctxRef.current !== ctx) return;
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
          const rms = Math.sqrt(sum / buffer.length);
          // Perceptual-ish scaling: raw RMS on speech sits around 0.02–0.2.
          const scaled = Math.min(1, rms * 5);
          smoothed.current = smoothed.current * 0.7 + scaled * 0.3;
          setLevel(smoothed.current);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        setListening(true);
      } catch (err) {
        close();
        setError(err);
      }
    },
    [close, deviceId],
  );

  // Enumerate without prompting, so the picker is populated on first paint.
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) => {
        if (active) setDevices(list.filter((d) => d.kind === "audioinput"));
      })
      .catch(() => {
        /* enumeration is best effort until permission exists */
      });
    const onChange = () => {
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (active) setDevices(list.filter((d) => d.kind === "audioinput"));
        })
        .catch(() => {});
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
    };
  }, []);

  useEffect(() => close, [close]);

  return {
    devices,
    level,
    listening,
    error,
    open,
    close,
    labelled: devices.some((d) => Boolean(d.label)),
  };
}

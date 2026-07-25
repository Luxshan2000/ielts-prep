/**
 * Timer display for the live HUD.
 *
 * All timing is server-side (04 §3.2). The sidecar sends `timer` events with a
 * `remaining_ms` snapshot (and `deadline_utc` on timer-bound `state` events) but
 * does NOT tick every second, so the renderer interpolates locally between
 * events. It never enforces anything — an expiry here only stops the countdown.
 */

import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "@/stores";

interface Baseline {
  remainingMs: number;
  at: number;
}

export interface TimerView {
  remainingSec: number;
  known: boolean;
}

export function useSessionTimers(): {
  remaining: (timerId: string) => TimerView;
  deadlineRemaining: () => number | null;
} {
  const timers = useSessionStore((s) => s.live?.timers);
  const deadlineUtc = useSessionStore((s) => s.live?.deadlineUtc ?? null);
  const baselines = useRef<Record<string, Baseline>>({});
  const [, forceTick] = useState(0);

  // Stamp arrival time for every timer value we see, so we can interpolate.
  useEffect(() => {
    if (!timers) {
      baselines.current = {};
      return;
    }
    for (const [id, remainingMs] of Object.entries(timers)) {
      const prev = baselines.current[id];
      if (!prev || prev.remainingMs !== remainingMs) {
        baselines.current[id] = { remainingMs, at: Date.now() };
      }
    }
  }, [timers]);

  useEffect(() => {
    const handle = window.setInterval(() => forceTick((n) => n + 1), 250);
    return () => window.clearInterval(handle);
  }, []);

  const remaining = (timerId: string): TimerView => {
    const base = baselines.current[timerId];
    if (!base) return { remainingSec: 0, known: false };
    const left = base.remainingMs - (Date.now() - base.at);
    return { remainingSec: Math.max(0, left / 1000), known: true };
  };

  const deadlineRemaining = (): number | null => {
    if (!deadlineUtc) return null;
    const at = new Date(deadlineUtc).getTime();
    if (Number.isNaN(at)) return null;
    return Math.max(0, (at - Date.now()) / 1000);
  };

  return { remaining, deadlineRemaining };
}

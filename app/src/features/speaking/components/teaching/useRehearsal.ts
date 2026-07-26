/**
 * The self-driven Part 2 clock: one minute of preparation, then a two-minute turn.
 *
 * The live examiner call owns its own timers server-side and the renderer only
 * paints them (18 §5) — this hook is for the *coach*, where there is no session and
 * no examiner, and the learner is rehearsing on their own. `PrepCoach` accepts
 * either: pass `remainingMs`/`phase` from the session store and this hook is bypassed
 * entirely.
 *
 * Timing is deadline-based rather than decrement-based. A tab that is backgrounded
 * throttles `setInterval` to once a second or worse, and a counter that ticks
 * "60, 59, 58" while ninety real seconds pass would quietly teach the wrong pace.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const PREP_SECONDS = 60;
export const TURN_SECONDS = 120;

export type RehearsalPhase = "idle" | "prep" | "turn" | "done";

export interface Rehearsal {
  phase: RehearsalPhase;
  /** Seconds left in the current phase; 0 when idle or done. */
  remainingS: number;
  /** Seconds elapsed inside the two-minute turn — drives the time-plan marker. */
  turnElapsedS: number;
  start: () => void;
  /** Prep → turn, turn → done. The real exam has no skip; rehearsal does. */
  advance: () => void;
  reset: () => void;
}

const TOTAL: Record<RehearsalPhase, number> = {
  idle: 0,
  prep: PREP_SECONDS,
  turn: TURN_SECONDS,
  done: 0,
};

export function phaseTotalSeconds(phase: RehearsalPhase): number {
  return TOTAL[phase];
}

export function useRehearsal(): Rehearsal {
  const [phase, setPhase] = useState<RehearsalPhase>("idle");
  const [remainingS, setRemainingS] = useState(0);
  const deadlineRef = useRef<number>(0);

  const enter = useCallback((next: RehearsalPhase) => {
    const seconds = TOTAL[next];
    deadlineRef.current = seconds > 0 ? Date.now() + seconds * 1000 : 0;
    setPhase(next);
    setRemainingS(seconds);
  }, []);

  useEffect(() => {
    if (phase !== "prep" && phase !== "turn") return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemainingS(left);
      if (left === 0) enter(phase === "prep" ? "turn" : "done");
    };
    const handle = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(handle);
  }, [enter, phase]);

  const start = useCallback(() => enter("prep"), [enter]);
  const reset = useCallback(() => enter("idle"), [enter]);
  const advance = useCallback(() => {
    if (phase === "prep") enter("turn");
    else if (phase === "turn") enter("done");
  }, [enter, phase]);

  return {
    phase,
    remainingS,
    turnElapsedS: phase === "turn" ? TURN_SECONDS - remainingS : phase === "done" ? TURN_SECONDS : 0,
    start,
    advance,
    reset,
  };
}

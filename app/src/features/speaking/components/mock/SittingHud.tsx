/**
 * The only chrome the sitting has: which part you are in, whether you are being
 * recorded, and the clock.
 *
 * Two decisions worth defending:
 *
 *  - **Soft budgets are not counted down.** Part 1 and Part 3 run on soft timers
 *    (04 §3.2): expiry lets the examiner finish the current exchange, it does not cut
 *    you off. A big shrinking ring would tell the candidate a lie about that, and
 *    would push them to rush an answer that nothing was going to interrupt. Those
 *    parts get an unobtrusive "about N min left in this part" instead.
 *  - **Hard timers get the ring.** The 60-second preparation and the 2-minute long
 *    turn genuinely end when they end, so they are shown as a real countdown — that
 *    pressure is part of what is being rehearsed.
 */

import { Wifi, WifiOff } from "lucide-react";
import { CircularTimer } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import type { SpeakingPhase } from "@/stores";
import { PRIMARY_TIMER, TIMERS } from "../phases";
import { useSessionTimers } from "../useSessionTimers";
import { sittingPhase } from "./script";

export interface SittingHudProps {
  phase: SpeakingPhase;
  part: number | null;
  socket: "closed" | "connecting" | "open";
  recording: boolean;
  className?: string;
}

const HARD_TIMERS = new Set(["p2_prep", "p2_long_turn_max"]);

export function SittingHud({ phase, part, socket, recording, className }: SittingHudProps) {
  const { remaining, deadlineRemaining } = useSessionTimers();
  const copy = sittingPhase(phase);
  const shownPart = copy.part ?? part;

  const timerId = PRIMARY_TIMER[phase];
  const timerMeta = timerId ? TIMERS[timerId] : undefined;
  const snapshot = timerId ? remaining(timerId) : { remainingSec: 0, known: false };
  const deadline = deadlineRemaining();
  const remainingSec = snapshot.known ? snapshot.remainingSec : (deadline ?? 0);
  const hasClock = Boolean(timerMeta) && (snapshot.known || deadline !== null);
  const hard = Boolean(timerMeta && HARD_TIMERS.has(timerMeta.id));

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border pb-4",
        className,
      )}
    >
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            recording ? "animate-recording-pulse bg-recording" : "bg-muted-foreground/40",
          )}
          aria-hidden="true"
        />
        <span className={recording ? "text-recording" : "text-muted-foreground"}>
          {recording ? "Recording" : "Not recording"}
        </span>
      </span>

      {/* The part rail replaces a progress bar: three fixed steps, no percentage,
          because the length of a part is the examiner's decision, not a fraction. */}
      <ol className="flex items-center gap-1.5" aria-label="Test progress">
        {[1, 2, 3].map((n) => {
          const state =
            shownPart === null || shownPart === undefined
              ? "todo"
              : n < shownPart
                ? "done"
                : n === shownPart
                  ? "current"
                  : "todo";
          return (
            <li key={n}>
              <span
                className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular",
                  state === "current" && "bg-primary/15 text-primary ring-1 ring-primary/40",
                  state === "done" && "bg-muted text-muted-foreground",
                  state === "todo" && "text-muted-foreground/50",
                )}
                aria-current={state === "current" ? "step" : undefined}
              >
                {n}
              </span>
              <span className="sr-only">
                Part {n}
                {state === "current" ? " — in progress" : state === "done" ? " — finished" : ""}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" aria-live="polite">
          {shownPart ? `Part ${shownPart} — ${copy.label}` : copy.label}
        </p>
        {copy.note && (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{copy.note}</p>
        )}
      </div>

      {socket !== "open" && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-warning">
          {socket === "connecting" ? (
            <Wifi className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
          ) : (
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Reconnecting
        </span>
      )}

      {hasClock && timerMeta ? (
        hard ? (
          <CircularTimer
            totalSec={timerMeta.total}
            remainingSec={remainingSec}
            warnAtSec={timerMeta.id === "p2_prep" ? 10 : 20}
            label={`${timerMeta.label} remaining`}
            size={52}
          />
        ) : (
          <span className="tabular text-[12px] text-muted-foreground">
            about {formatDuration(Math.max(0, Math.round(remainingSec / 30) * 30))} left in this
            part
          </span>
        )
      ) : null}
    </div>
  );
}

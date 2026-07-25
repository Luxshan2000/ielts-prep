/**
 * Live-call header strip (12 §6.2 B): recording dot, part badge, the phase label and
 * its one line of exam-register instruction, and the primary countdown ring.
 *
 * All timing is server-owned (04 §3.2). `useSessionTimers` interpolates between the
 * sidecar's `timer` events; this component never enforces anything.
 */

import { Radio, Wifi, WifiOff } from "lucide-react";
import { Badge, CircularTimer } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SpeakingPhase } from "@/stores";
import { PRIMARY_TIMER, TIMERS, phaseMeta } from "./phases";
import { useSessionTimers } from "./useSessionTimers";

export interface LiveHudProps {
  phase: SpeakingPhase;
  part: number | null;
  /** WS connectivity, distinct from the server-side RECONNECTING phase. */
  socket: "closed" | "connecting" | "open";
  /** True while audio is flowing — drives the recording dot. */
  recording: boolean;
  className?: string;
}

export function LiveHud({ phase, part, socket, recording, className }: LiveHudProps) {
  const { remaining, deadlineRemaining } = useSessionTimers();
  const meta = phaseMeta(phase);

  const timerId = PRIMARY_TIMER[phase];
  const timerMeta = timerId ? TIMERS[timerId] : undefined;
  const view = timerId ? remaining(timerId) : { remainingSec: 0, known: false };
  // Timer-bound states also carry `deadline_utc`; it is the better clock when the
  // per-timer snapshot has not arrived yet.
  const deadline = deadlineRemaining();
  const remainingSec = view.known ? view.remainingSec : (deadline ?? 0);
  const hasTimer = Boolean(timerMeta) && (view.known || deadline !== null);
  const shownPart = meta.part ?? part;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-card px-4 py-3",
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
          {recording ? "Rec" : "Idle"}
        </span>
      </span>

      {shownPart !== null && shownPart !== undefined && (
        <Badge tone="primary">Part {shownPart}</Badge>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" aria-live="polite">
          {meta.label}
        </p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{meta.hint}</p>
      </div>

      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px]",
          socket === "open" ? "text-muted-foreground" : "text-warning",
        )}
        title={
          socket === "open"
            ? "Connected to the session event stream"
            : "Reconnecting to the session event stream"
        }
      >
        {socket === "open" ? (
          <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
        ) : socket === "connecting" ? (
          <Radio className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
        ) : (
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="sr-only sm:not-sr-only">
          {socket === "open" ? "Live" : socket === "connecting" ? "Reconnecting" : "Offline"}
        </span>
      </span>

      {hasTimer && timerMeta ? (
        <CircularTimer
          totalSec={timerMeta.total}
          remainingSec={remainingSec}
          warnAtSec={timerMeta.id === "p2_prep" ? 10 : 30}
          label={`${timerMeta.label} remaining`}
          size={56}
        />
      ) : (
        <span className="text-[11px] text-muted-foreground">No timer in this phase</span>
      )}
    </div>
  );
}

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

/**
 * Seconds-remaining thresholds that are worth interrupting a screen-reader user for.
 * A per-second live region would make the whole test unusable with a screen reader,
 * and silence would hide the one fact that changes how you answer, so the timer
 * speaks only at the moments a sighted candidate would glance up (12 §11).
 */
const MILESTONES_S = [0, 10, 30, 60, 120, 300, 600, 900, 1800] as const;

/**
 * The most recently crossed milestone — the SMALLEST one still at or above
 * `remaining` — or null while none has been crossed. Ascending order matters:
 * at 14:40 of a 20-minute test the answer is 15:00, not 30:00.
 */
function milestoneFor(remaining: number, total: number): number | null {
  for (const m of MILESTONES_S) {
    // Never announce a milestone the timer never had: a 60-second Part 2 prep must
    // not open by claiming "30 minutes remaining".
    if (m > total) break;
    if (remaining <= m) return m;
  }
  return null;
}

export interface CircularTimerProps {
  totalSec: number;
  remainingSec: number;
  /** Below this the ring turns warning-colored and pulses. 60 default; speaking prep uses 10. */
  warnAtSec?: number;
  paused?: boolean;
  size?: number;
  className?: string;
  /** Screen-reader name, e.g. "Part 2 preparation". */
  label?: string;
}

/**
 * SVG ring countdown. The renderer never owns timing — it displays what the
 * server's `timer` events say (18 §5); this component is pure presentation.
 */
export function CircularTimer({
  totalSec,
  remainingSec,
  warnAtSec = 60,
  paused = false,
  size = 56,
  className,
  label,
}: CircularTimerProps) {
  const clampedTotal = Math.max(totalSec, 1);
  const remaining = Math.max(0, Math.min(remainingSec, clampedTotal));
  const fraction = remaining / clampedTotal;

  const stroke = 4;
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const warning = remaining <= warnAtSec && remaining > 0;

  // Only recomputed when the crossed milestone changes, so the live region's text
  // is stable between announcements and AT does not re-read it every tick.
  const milestone = milestoneFor(remaining, clampedTotal);
  const announcement = useMemo(() => {
    if (milestone === null) return "";
    const name = label ? `${label}: ` : "";
    if (milestone === 0) return `${name}time is up`;
    return `${name}${formatDuration(milestone)} remaining`;
  }, [milestone, label]);

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center",
        warning && !paused && "animate-timer-pulse",
        className,
      )}
      data-warning={warning || undefined}
      data-paused={paused || undefined}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-border"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            className={cn(
              "transition-[stroke-dashoffset] duration-500 ease-linear",
              paused ? "stroke-muted-foreground" : warning ? "stroke-warning" : "stroke-primary",
            )}
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular",
            paused ? "text-muted-foreground" : warning ? "text-warning" : "text-foreground",
          )}
        >
          {formatDuration(remaining)}
        </span>
      </div>
      {/*
        Two regions, deliberately. The polite one holds only milestone text, so it
        fires a handful of times across a whole test instead of once a second. The
        off region carries the exact reading for a screen-reader user who navigates
        to the timer on purpose.
      */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <span className="sr-only" aria-live="off">
        {label ? `${label}: ` : ""}
        {formatDuration(remaining)} remaining
        {paused ? ", paused" : ""}
      </span>
    </div>
  );
}

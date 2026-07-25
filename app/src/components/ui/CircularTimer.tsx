import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

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
      {/* Timers announce at milestones, not every second (12 §11). */}
      <span className="sr-only" aria-live="off">
        {label ? `${label}: ` : ""}
        {formatDuration(remaining)} remaining
        {paused ? ", paused" : ""}
      </span>
    </div>
  );
}

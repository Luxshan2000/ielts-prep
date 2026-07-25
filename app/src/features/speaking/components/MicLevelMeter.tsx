import { cn } from "@/lib/cn";

export interface MicLevelMeterProps {
  /** 0..1 RMS. */
  level: number;
  active: boolean;
  bars?: number;
  className?: string;
}

/**
 * Segmented input-level meter. Segments light up left-to-right; the top two turn
 * warning-coloured so learners can see they are clipping.
 */
export function MicLevelMeter({ level, active, bars = 16, className }: MicLevelMeterProps) {
  const clamped = Math.max(0, Math.min(1, level));
  const lit = Math.round(clamped * bars);
  const enough = clamped > 0.08;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex h-6 items-end gap-[3px]" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => {
          const on = active && i < lit;
          const hot = i >= bars - 2;
          return (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-sm transition-colors duration-75",
                on ? (hot ? "bg-warning" : "bg-primary") : "bg-muted",
              )}
              style={{ height: `${40 + (i / bars) * 60}%` }}
            />
          );
        })}
      </div>
      <p
        className={cn(
          "text-[11px]",
          active && enough ? "text-success" : "text-muted-foreground",
        )}
        role="status"
      >
        {!active
          ? "Allow microphone access to see your input level."
          : enough
            ? "Microphone is picking you up."
            : "Say something — the meter should reach about a third."}
      </p>
    </div>
  );
}

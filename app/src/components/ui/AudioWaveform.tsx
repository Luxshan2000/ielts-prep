import { cn } from "@/lib/cn";

export interface AudioWaveformProps {
  /** 0..1 RMS level. */
  level: number;
  /** False = idle: flat muted bars. */
  active: boolean;
  bars?: number;
  className?: string;
  /** Text status rendered for screen readers (the bars are aria-hidden). */
  status?: string;
}

/** Per-bar multipliers so the shape reads as a waveform, not a bar chart. */
const SHAPE = [0.45, 0.75, 1, 0.8, 0.5];

function shapeAt(i: number, count: number): number {
  if (count === SHAPE.length) return SHAPE[i];
  const center = (count - 1) / 2;
  const d = Math.abs(i - center) / Math.max(center, 1);
  return 1 - d * 0.6;
}

export function AudioWaveform({
  level,
  active,
  bars = 5,
  className,
  status,
}: AudioWaveformProps) {
  const clamped = Math.max(0, Math.min(1, level));

  return (
    <div className={cn("inline-flex items-end gap-1", className)}>
      <div className="flex h-6 items-center gap-1" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => {
          const height = active ? 4 + clamped * shapeAt(i, bars) * 20 : 4;
          return (
            <span
              key={i}
              className={cn(
                "w-1 rounded-full transition-[height] duration-75",
                active ? "bg-primary" : "bg-muted-foreground/40",
              )}
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>
      {status && <span className="sr-only">{status}</span>}
    </div>
  );
}

import { cn } from "@/lib/cn";

export interface ProgressProps {
  /** 0–100. Pass `null` for an indeterminate bar (job with no progress_pct yet). */
  value: number | null;
  label?: string;
  /** Right-aligned caption, e.g. "verifying checksum…" or "7 / 24". */
  detail?: string;
  tone?: "primary" | "success" | "warning";
  className?: string;
}

const tones = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
} as const;

export function Progress({ value, label, detail, tone = "primary", className }: ProgressProps) {
  const pct = value === null ? null : Math.max(0, Math.min(100, value));

  return (
    <div className={cn("w-full", className)}>
      {(label || detail) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label && <span className="text-[13px] text-foreground">{label}</span>}
          {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        {pct === null ? (
          <div className={cn("h-full w-1/3 animate-pulse rounded-full", tones[tone])} />
        ) : (
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", tones[tone])}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

import { useId } from "react";
import { cn } from "@/lib/cn";

export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Rendered to the right of the numeric readout, e.g. "s". */
  unit?: string;
  hint?: string;
  /** Shown in warning tone under the control (e.g. the min_volume cap). */
  warning?: string;
  disabled?: boolean;
  className?: string;
  decimals?: number;
}

/**
 * Range input styled with the design tokens. The numeral is always rendered —
 * the thumb position is never the only encoding (12 §11).
 */
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.05,
  unit,
  hint,
  warning,
  disabled,
  className,
  decimals = 2,
}: SliderProps) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        <span className="tabular text-[13px] text-muted-foreground">
          {value.toFixed(decimals)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
          "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background",
          "[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
          "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background",
          "[&::-moz-range-thumb]:bg-primary",
        )}
        style={{
          background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}%)`,
        }}
      />
      {hint && !warning && <p className="text-xs text-muted-foreground">{hint}</p>}
      {warning && <p className="text-xs text-warning">{warning}</p>}
    </div>
  );
}

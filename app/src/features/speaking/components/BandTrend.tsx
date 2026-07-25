/**
 * Recent-mock band sparkline for the report header (04 §7).
 *
 * Drawn from the speaking history already in the feature store — no extra request, and
 * no claim about the exam band: the honesty copy in the report owns that caveat. Fewer
 * than two scored sessions renders nothing rather than a misleading flat line.
 */

import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBand } from "@/lib/format";
import type { SessionRecord } from "../store";

export interface BandTrendProps {
  history: SessionRecord[];
  /** Highlighted last point — the session this report belongs to. */
  currentSessionId?: string;
  max?: number;
  className?: string;
}

const WIDTH = 132;
const HEIGHT = 40;
const PAD = 4;

export function BandTrend({ history, currentSessionId, max = 8, className }: BandTrendProps) {
  const series = useMemo(() => {
    const scored = history
      .filter((row) => typeof row.overall_band === "number")
      .slice(0, max)
      .reverse(); // history arrives newest-first
    return scored.map((row) => ({
      id: row.id,
      band: row.overall_band as number,
      at: row.started_at,
    }));
  }, [history, max]);

  if (series.length < 2) return null;

  const bands = series.map((p) => p.band);
  const lo = Math.min(...bands);
  const hi = Math.max(...bands);
  const span = Math.max(hi - lo, 0.5);
  const step = (WIDTH - PAD * 2) / (series.length - 1);

  const points = series.map((p, i) => ({
    ...p,
    x: PAD + i * step,
    y: HEIGHT - PAD - ((p.band - lo) / span) * (HEIGHT - PAD * 2),
  }));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const delta = bands[bands.length - 1] - bands[0];
  const rising = delta >= 0;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Last {series.length} scored
        </p>
        <p
          className={cn(
            "mt-0.5 flex items-center gap-1 text-[13px] font-semibold tabular",
            delta === 0 ? "text-muted-foreground" : rising ? "text-success" : "text-warning",
          )}
        >
          {rising ? (
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {delta === 0 ? "level" : `${delta > 0 ? "+" : ""}${formatBand(delta)}`}
        </p>
      </div>
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Band trend across the last ${series.length} scored sessions: ${bands
          .map((b) => formatBand(b))
          .join(", ")}`}
        className="overflow-visible"
      >
        <path
          d={path}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-primary"
        />
        {points.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.id === currentSessionId ? 3.5 : 2}
            className={p.id === currentSessionId ? "fill-primary" : "fill-primary/50"}
          />
        ))}
      </svg>
    </div>
  );
}

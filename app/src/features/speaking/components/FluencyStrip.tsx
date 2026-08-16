/**
 * Fluency-metrics strip for the report (02 §4.2 / R2-10).
 *
 * These are *measured* numbers, not model opinions, so they get their own row above the
 * criteria: they are the only part of the report a learner can verify. Every field is
 * optional in the contract — a missing metric is omitted, never rendered as 0.
 */

import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import type { FluencyMetrics, MetricsDoc } from "../store";

interface Tile {
  key: keyof FluencyMetrics;
  label: string;
  hint: string;
  format: (value: number) => string;
}

const oneDp = (value: number): string => (Math.round(value * 10) / 10).toString();

const TILES: Tile[] = [
  {
    key: "wpm",
    label: "Speaking rate",
    hint: "Words per minute including pauses. Band 7+ candidates usually sit between 120 and 160.",
    format: (v) => `${Math.round(v)} wpm`,
  },
  {
    key: "articulation_wpm",
    label: "Articulation rate",
    hint: "Words per minute counting only the time you were actually speaking.",
    format: (v) => `${Math.round(v)} wpm`,
  },
  {
    key: "mean_pause_ms",
    label: "Mean pause",
    hint: "Average silence inside your own speech. Long thinking pauses cost fluency marks.",
    format: (v) => `${(v / 1000).toFixed(1)} s`,
  },
  {
    key: "long_pause_count",
    label: "Long pauses",
    hint: "Silences long enough for an examiner to notice.",
    format: (v) => String(Math.round(v)),
  },
  {
    key: "fillers_per_min",
    label: "Fillers",
    hint: "“um”, “uh” and similar, per minute of speech.",
    format: (v) => `${oneDp(v)} /min`,
  },
  {
    key: "mean_length_of_run_words",
    label: "Run length",
    hint: "Average number of words between pauses. Longer runs read as more fluent.",
    format: (v) => `${oneDp(v)} words`,
  },
  {
    key: "initial_latency_ms",
    label: "Response delay",
    hint: "How long you took to start answering after the examiner stopped.",
    format: (v) => `${(v / 1000).toFixed(1)} s`,
  },
  {
    key: "false_start_count",
    label: "False starts",
    hint: "Times you restarted a sentence mid-way.",
    format: (v) => String(Math.round(v)),
  },
];

export interface FluencyStripProps {
  metrics: MetricsDoc | null | undefined;
  className?: string;
}

export function FluencyStrip({ metrics, className }: FluencyStripProps) {
  const overall: FluencyMetrics = metrics?.overall ?? {};
  const session = metrics?.session ?? {};
  const tiles = TILES.filter((tile) => typeof overall[tile.key] === "number");

  if (tiles.length === 0 && session.speech_secs === undefined) {
    return (
      <p className={cn("text-[13px] text-muted-foreground", className)}>
        No fluency measurements were recorded for this session.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {typeof session.speech_secs === "number" && (
          <MetricTile
            label="Time speaking"
            value={formatDuration(session.speech_secs)}
            hint="Total measured candidate speech, pauses excluded."
          />
        )}
        {typeof session.p2_long_turn_secs === "number" && (
          <MetricTile
            label="Part 2 long turn"
            value={formatDuration(session.p2_long_turn_secs)}
            hint="The real test expects one to two minutes here."
            tone={
              session.p2_long_turn_secs >= 60
                ? "good"
                : session.p2_long_turn_secs > 0
                  ? "warn"
                  : undefined
            }
          />
        )}
        {tiles.map((tile) => (
          <MetricTile
            key={tile.key}
            label={tile.label}
            value={tile.format(overall[tile.key] as number)}
            hint={tile.hint}
          />
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">
        Measured from your audio, not estimated by the model.
      </p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular",
          tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * The Academic Task 1 chart renderer (05 §2.2). One entry point: give it a
 * `chart_spec` and it draws the visual the candidate has to describe.
 *
 * Shared chrome lives here — title, units caption, series legend, the
 * "View as table" toggle (12 §6 requires it on every chart) and "Copy the data as
 * text". The per-kind geometry lives in the sibling files.
 */

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Table2 } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChartSpec } from "../../store";
import { CartesianChart } from "./CartesianChart";
import { DataTableView } from "./DataTableView";
import { MapPair } from "./MapPair";
import { PieChart } from "./PieChart";
import { ProcessDiagram } from "./ProcessDiagram";
import { SERIES_MAX, seriesInk } from "./palette";
import { chartToSummary, kindLabel } from "./summary";
import { useElementWidth } from "./useElementWidth";

export interface ChartRendererProps {
  spec: ChartSpec;
  className?: string;
  /** Hide the toolbar (used for compact previews inside prompt cards). */
  compact?: boolean;
}

const CARTESIAN = new Set(["bar", "grouped_bar", "stacked_bar", "line"]);
/** Kinds with a drawn form; anything else is data we can only tabulate. */
const DRAWABLE = new Set([...CARTESIAN, "pie", "process", "map"]);

export function ChartRenderer({ spec, className, compact = false }: ChartRendererProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef, compact ? 320 : 640);
  const summary = useMemo(() => chartToSummary(spec), [spec]);

  const seriesCount = spec.series?.length ?? 0;
  const overflowing = seriesCount > SERIES_MAX && spec.kind !== "pie";
  const alwaysTable = !DRAWABLE.has(spec.kind) || overflowing;
  const [asTable, setAsTable] = useState(alwaysTable);
  const [copied, setCopied] = useState(false);

  const showTable = alwaysTable || asTable;
  const legendSeries = CARTESIAN.has(spec.kind) ? (spec.series ?? []).slice(0, SERIES_MAX) : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className={cn("min-w-0", className)}>
      <figcaption className="mb-2 space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-snug text-foreground">
              {spec.title || kindLabel(spec.kind)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {kindLabel(spec.kind)}
              {spec.unit?.trim() ? ` · units: ${spec.unit.trim()}` : ""}
            </p>
          </div>
          {!compact && (
            <div className="flex shrink-0 items-center gap-1">
              {!alwaysTable && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAsTable((v) => !v)}
                  aria-pressed={showTable}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  {showTable ? "View as chart" : "View as table"}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => void copy()}>
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy data"}
              </Button>
            </div>
          )}
        </div>
      </figcaption>

      {overflowing && (
        <p
          role="status"
          className="mb-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-[12px] text-muted-foreground"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          This visual carries {seriesCount} data series — more than the {SERIES_MAX} the chart
          palette can tell apart. It is shown as a table so no figure is lost.
        </p>
      )}

      {legendSeries.length > 1 && !showTable && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {legendSeries.map((series, index) => (
            <li key={index} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span
                className={cn(
                  "bg-current",
                  spec.kind === "line" ? "h-0.5 w-4 rounded-full" : "h-2.5 w-2.5 rounded-sm",
                  seriesInk(index),
                )}
                aria-hidden="true"
              />
              <span className="text-foreground">{series.name || `Series ${index + 1}`}</span>
            </li>
          ))}
        </ul>
      )}

      <div ref={wrapRef} className="min-w-0">
        {showTable ? (
          <DataTableView spec={spec} />
        ) : CARTESIAN.has(spec.kind) ? (
          <CartesianChart spec={spec} width={width} ariaLabel={summary} />
        ) : spec.kind === "pie" ? (
          <PieChart spec={spec} width={width} ariaLabel={summary} />
        ) : spec.kind === "process" ? (
          <ProcessDiagram spec={spec} width={width} ariaLabel={summary} />
        ) : spec.kind === "map" ? (
          <MapPair spec={spec} width={width} ariaLabel={summary} />
        ) : (
          <DataTableView spec={spec} />
        )}
      </div>
    </figure>
  );
}

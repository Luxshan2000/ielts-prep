/**
 * The Academic Task 1 chart renderer (05 §2.2, chart_spec v2 per
 * staging-writing/DESIGN.md §6). One entry point: give it a `chart_spec` and it
 * draws the visual the candidate has to describe.
 *
 * Shared chrome lives here — title, unit and `notes` caption, series legend, the
 * "View as table" toggle (12 §6 requires it on every chart), "Text description"
 * and "Copy the data as text". The per-kind geometry lives in the sibling files.
 *
 * v2 adds two shapes this file owns:
 *
 * - **`mixed`** — the combined task. Two complete child specs are rendered
 *   through this same component (`panelIndex` marks a panel), so a panel gets
 *   the full treatment — its own kind, legend, table toggle and caption — while
 *   the outer figure owns the task title, the toolbar and the single text
 *   alternative covering both visuals.
 * - **pie pairs/trios** — handled inside `PieChart`.
 *
 * Nothing here ever renders a blank box: `inspectSpec` classifies the spec first
 * and a spec that cannot be drawn is explained in words and tabulated instead.
 */

import { useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Table2, Text } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CartesianChart } from "./CartesianChart";
import { ChartTextAlternative } from "./ChartTextAlternative";
import { DataTableView } from "./DataTableView";
import { MapPair } from "./MapPair";
import { PieChart } from "./PieChart";
import { ProcessDiagram } from "./ProcessDiagram";
import { describeChart } from "./describe";
import { seriesInk } from "./palette";
import { CARTESIAN_KINDS, inspectSpec, kindLabel, type ChartSpecLike } from "./spec";
import { chartToSummary } from "./summary";
import { useElementWidth } from "./useElementWidth";

export interface ChartRendererProps {
  spec: ChartSpecLike;
  className?: string;
  /** Hide the toolbar (used for compact previews inside prompt cards). */
  compact?: boolean;
  /** Set by the `mixed` branch: this render is panel N (1-based) of a combined task. */
  panelIndex?: number;
  panelCount?: number;
  /** Set by the `mixed` branch: the parent toggled every panel to its table. */
  forceTable?: boolean;
  /** Set by the `mixed` branch: id of the parent's description of both panels. */
  describedBy?: string;
}

/** Two panels sit side by side only when each still gets a usable width. */
const SIDE_BY_SIDE_WIDTH = 760;

function ProblemNotice({ issues, fatal }: { issues: string[]; fatal: boolean }) {
  if (issues.length === 0) return null;
  return (
    <div
      role="status"
      className={cn(
        "mb-2 flex items-start gap-2 rounded-lg border p-2.5 text-[12px] leading-5",
        fatal
          ? "border-destructive/40 bg-destructive/10 text-foreground"
          : "border-warning/40 bg-warning/10 text-muted-foreground",
      )}
    >
      <AlertTriangle
        className={cn("mt-px h-3.5 w-3.5 shrink-0", fatal ? "text-destructive" : "text-warning")}
        aria-hidden="true"
      />
      <span className="min-w-0">
        {fatal && <strong className="font-semibold">This visual could not be drawn. </strong>}
        {issues.join(" ")}
        {fatal && " Use the text description below, which carries everything the spec does say."}
      </span>
    </div>
  );
}

export function ChartRenderer({
  spec,
  className,
  compact = false,
  panelIndex,
  panelCount,
  forceTable = false,
  describedBy: inheritedDescription,
}: ChartRendererProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef, compact ? 320 : 640);
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const descId = `chart-text-${rawId}`;

  const report = useMemo(() => inspectSpec(spec), [spec]);
  const summary = useMemo(() => chartToSummary(spec), [spec]);
  const description = useMemo(() => describeChart(spec), [spec]);

  const isPanel = panelIndex !== undefined;
  const isMixed = report.kind === "mixed" && report.panels.length > 0;
  const fatal = report.status === "unusable";
  const drawable = !fatal && !report.tableOnly && !isMixed;

  const [asTable, setAsTable] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const showTable = forceTable || (drawable || isMixed ? asTable : true);
  const legendSeries = CARTESIAN_KINDS.has(report.kind) && !showTable ? (spec.series ?? []) : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  /** Is there anything to put in a table at all? Drives the fallback wording. */
  const hasData =
    (spec.series ?? []).length > 0 ||
    (spec.rows ?? []).length > 0 ||
    (spec.steps ?? []).length > 0 ||
    (spec.snapshots ?? []).length > 0 ||
    (spec.panels ?? []).length > 0;

  const heading = (spec.title ?? "").trim() || kindLabel(report.kind, spec);
  const unit = (spec.unit ?? "").trim();
  const notes = (spec.notes ?? "").trim();
  const showToolbar = !compact && !isPanel;
  /**
   * A combined task is described once, as one reading covering both visuals, so
   * a panel points at the parent's description rather than growing its own —
   * and only the first panel does, or a screen reader would read the whole
   * thing twice.
   */
  const describedBy = isPanel ? inheritedDescription : descId;

  return (
    <figure className={cn("min-w-0", className)}>
      <figcaption className="mb-2 space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {isPanel && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Visual {panelIndex} of {panelCount ?? 2}
              </p>
            )}
            <p
              className={cn(
                "font-semibold leading-snug text-foreground",
                isPanel ? "text-[12.5px]" : "text-[13px]",
              )}
            >
              {heading}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {kindLabel(report.kind, spec)}
              {unit ? ` · units: ${unit}` : ""}
            </p>
            {notes && <p className="text-[11px] italic text-muted-foreground">{notes}</p>}
          </div>
          {showToolbar && (
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {(drawable || isMixed) && (
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTextOpen((v) => !v)}
                aria-expanded={textOpen}
                aria-controls={descId}
              >
                <Text className="h-3.5 w-3.5" />
                {textOpen ? "Hide text description" : "Text description"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void copy()}>
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy data"}
              </Button>
            </div>
          )}
        </div>
      </figcaption>

      <ProblemNotice issues={report.issues} fatal={fatal} />

      {legendSeries.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {legendSeries.map((series, index) => (
            <li key={index} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span
                className={cn(
                  "bg-current",
                  report.kind === "line" ? "h-0.5 w-4 rounded-full" : "h-2.5 w-2.5 rounded-sm",
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
        {isMixed && !showTable ? (
          <div
            className={cn(
              "flex min-w-0 gap-6",
              width >= SIDE_BY_SIDE_WIDTH ? "flex-row items-start" : "flex-col",
            )}
          >
            {report.panels.map((panel, index) => (
              <div
                key={index}
                className={cn(
                  "min-w-0",
                  width >= SIDE_BY_SIDE_WIDTH
                    ? "flex-1 border-l border-border/70 pl-4 first:border-l-0 first:pl-0"
                    : "border-t border-border/70 pt-4 first:border-t-0 first:pt-0",
                )}
              >
                <ChartRenderer
                  spec={panel}
                  panelIndex={index + 1}
                  panelCount={report.panels.length}
                  compact={compact}
                  describedBy={index === 0 ? descId : undefined}
                />
              </div>
            ))}
          </div>
        ) : fatal || !hasData ? (
          /* Nothing to draw and nothing to tabulate: the notice above and the
             text alternative below are the whole fallback. */
          null
        ) : showTable ? (
          <DataTableView spec={spec} />
        ) : CARTESIAN_KINDS.has(report.kind) ? (
          <CartesianChart
            spec={spec}
            width={width}
            ariaLabel={description.label}
            describedBy={describedBy}
          />
        ) : report.kind === "pie" ? (
          <PieChart
            spec={spec}
            width={width}
            ariaLabel={description.label}
            describedBy={describedBy}
          />
        ) : report.kind === "process" ? (
          <ProcessDiagram
            spec={spec}
            width={width}
            ariaLabel={description.label}
            describedBy={describedBy}
          />
        ) : report.kind === "map" ? (
          <MapPair
            spec={spec}
            width={width}
            ariaLabel={description.label}
            describedBy={describedBy}
          />
        ) : (
          <DataTableView spec={spec} />
        )}
      </div>

      {/* The text alternative is never optional: collapsed it is `sr-only`, so a
          screen reader always reaches every figure the marks carry. */}
      {!isPanel && (
        <ChartTextAlternative id={descId} description={description} expanded={textOpen} />
      )}
    </figure>
  );
}

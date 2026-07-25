/**
 * Cartesian Academic Task 1 visuals: `bar`, `grouped_bar`, `stacked_bar`, `line`.
 *
 * Hand-rolled SVG (05 §2.2 — "chart specs are data, not images", zero chart-library
 * deps) so every mark, tick and label can be driven by design tokens and stay
 * legible in both themes. Marks follow the house spec: bars ≤ 24px thick with a 4px
 * rounded data-end squared at the baseline, 2px lines, r≥4 markers ringed in the
 * surface color, 2px surface gaps between touching marks, hairline recessive grid.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { ChartSpec } from "../../store";
import {
  AXIS_FONT,
  LABEL_FONT,
  SERIES_MAX,
  SURFACE_GAP,
  barPath,
  formatTick,
  formatValue,
  niceScale,
  seriesInk,
  textWidth,
} from "./palette";

export interface CartesianChartProps {
  spec: ChartSpec;
  width: number;
  /** Accessible description — the shared chart summary. */
  ariaLabel: string;
}

interface HoverState {
  index: number;
  x: number;
}

export function CartesianChart({ spec, width, ariaLabel }: CartesianChartProps) {
  const [hover, setHover] = useState<HoverState | null>(null);

  const categories = useMemo(
    () => (spec.x_axis?.categories ?? []).map((c) => String(c)),
    [spec.x_axis?.categories],
  );
  const series = useMemo(() => (spec.series ?? []).slice(0, SERIES_MAX), [spec.series]);
  const isLine = spec.kind === "line";
  const isStacked = spec.kind === "stacked_bar";

  const scale = useMemo(() => {
    const flat: number[] = [];
    if (isStacked) {
      categories.forEach((_, i) => {
        flat.push(
          series.reduce((sum, s) => {
            const v = s.values?.[i];
            return sum + (Number.isFinite(v) ? (v as number) : 0);
          }, 0),
        );
      });
    } else {
      series.forEach((s) => (s.values ?? []).forEach((v) => Number.isFinite(v) && flat.push(v)));
    }
    if (flat.length === 0) flat.push(0, 1);
    return niceScale(Math.min(...flat), Math.max(...flat), {
      min: spec.y_axis?.min,
      max: spec.y_axis?.max,
    });
  }, [categories, series, isStacked, spec.y_axis?.min, spec.y_axis?.max]);

  // ---------------------------------------------------------------- geometry ---
  const longestCategory = categories.reduce((max, c) => Math.max(max, c.length), 0);
  const rotateX = categories.length > 7 || longestCategory > 10;
  const tickLabelWidth = Math.max(
    ...scale.ticks.map((t) => textWidth(formatTick(t), AXIS_FONT)),
    18,
  );

  const margin = {
    top: 22,
    right: isLine ? 16 + Math.min(96, Math.max(...series.map((s) => textWidth(s.name ?? "", LABEL_FONT)), 0)) : 18,
    bottom: (rotateX ? 72 : 42) + (spec.x_axis?.label ? 20 : 0),
    left: Math.ceil(tickLabelWidth) + 14 + (spec.y_axis?.label ? 18 : 0),
  };

  const height = Math.round(Math.min(400, Math.max(250, width * 0.58)));
  const plotW = Math.max(60, width - margin.left - margin.right);
  const plotH = Math.max(80, height - margin.top - margin.bottom);

  const y = (value: number): number =>
    margin.top + plotH - ((value - scale.min) / (scale.max - scale.min || 1)) * plotH;
  const baseline = y(Math.max(scale.min, Math.min(0, scale.max)));

  const bandW = plotW / Math.max(1, categories.length);
  const bandCenter = (index: number): number => margin.left + bandW * (index + 0.5);

  // Bar geometry: 22 % of the band stays as air, then the slot splits per series.
  const slotW = bandW * 0.78;
  const groupCount = isStacked || isLine ? 1 : Math.max(1, series.length);
  const rawBarW = (slotW - SURFACE_GAP * (groupCount - 1)) / groupCount;
  const barW = Math.max(3, Math.min(24, rawBarW));
  const groupW = barW * groupCount + SURFACE_GAP * (groupCount - 1);

  /** Label every bar cap only when the labels demonstrably fit (never clipped). */
  const markCount = series.length * categories.length;
  const labelBars = !isLine && !isStacked && markCount <= 26 && barW >= textWidth("100", LABEL_FONT) + 2;

  const valueAt = (sIndex: number, cIndex: number): number | null => {
    const v = series[sIndex]?.values?.[cIndex];
    return Number.isFinite(v) ? (v as number) : null;
  };

  /**
   * Direct end-labels for line series, nudged apart when the lines converge at
   * the right edge — a detached stack of labels reads as noise, so a leader line
   * connects each one back to its point.
   */
  const endLabels: { sIndex: number; cIndex: number; pointY: number; labelY: number }[] = [];
  if (isLine) {
    series.forEach((_s, sIndex) => {
      for (let cIndex = categories.length - 1; cIndex >= 0; cIndex -= 1) {
        const value = valueAt(sIndex, cIndex);
        if (value !== null) {
          endLabels.push({ sIndex, cIndex, pointY: y(value), labelY: y(value) });
          return;
        }
      }
    });
    let last = -Infinity;
    for (const item of [...endLabels].sort((a, b) => a.pointY - b.pointY)) {
      item.labelY = Math.max(item.pointY, last + 14);
      last = item.labelY;
    }
  }

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="block select-none overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        {/* gridlines + y ticks */}
        <g aria-hidden="true">
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={margin.left + plotW}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={margin.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                fontSize={AXIS_FONT}
                className="fill-muted-foreground tabular"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}
          <line
            x1={margin.left}
            x2={margin.left + plotW}
            y1={baseline}
            y2={baseline}
            className="stroke-muted-foreground"
            strokeWidth={1}
          />
        </g>

        {/* hover bands (crosshair for lines, per-category readout for bars) */}
        {categories.map((category, index) => (
          <rect
            key={`hit-${index}`}
            x={margin.left + bandW * index}
            y={margin.top}
            width={bandW}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover({ index, x: bandCenter(index) })}
            aria-hidden="true"
          >
            <title>{category}</title>
          </rect>
        ))}
        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={margin.top}
            y2={margin.top + plotH}
            className="stroke-muted-foreground/60"
            strokeWidth={1}
            strokeDasharray="3 3"
            aria-hidden="true"
          />
        )}

        {/* marks */}
        {isLine
          ? series.map((s, sIndex) => {
              const points = categories
                .map((_, cIndex) => ({ value: valueAt(sIndex, cIndex), cIndex }))
                .filter((p): p is { value: number; cIndex: number } => p.value !== null);
              if (points.length === 0) return null;
              const path = points
                .map((p, i) => `${i === 0 ? "M" : "L"}${bandCenter(p.cIndex)},${y(p.value)}`)
                .join(" ");
              const last = points[points.length - 1];
              return (
                <g key={`line-${sIndex}`} className={seriesInk(sIndex)}>
                  <path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {points.map((p) => (
                    <circle
                      key={p.cIndex}
                      cx={bandCenter(p.cIndex)}
                      cy={y(p.value)}
                      r={4}
                      fill="currentColor"
                      className="stroke-card"
                      strokeWidth={2}
                    />
                  ))}
                  {/* direct end-label: identity without relying on color alone */}
                  {(() => {
                    const label = endLabels.find((item) => item.sIndex === sIndex);
                    if (!label) return null;
                    const anchorX = bandCenter(last.cIndex);
                    const nudged = Math.abs(label.labelY - label.pointY) > 1;
                    return (
                      <>
                        {nudged && (
                          <polyline
                            points={`${anchorX + 4},${label.pointY} ${anchorX + 9},${label.labelY} ${anchorX + 12},${label.labelY}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1}
                            aria-hidden="true"
                          />
                        )}
                        <text
                          x={anchorX + (nudged ? 15 : 9)}
                          y={label.labelY}
                          dy="0.32em"
                          fontSize={LABEL_FONT}
                          className="fill-foreground"
                        >
                          {s.name || `Series ${sIndex + 1}`}
                        </text>
                      </>
                    );
                  })()}
                </g>
              );
            })
          : categories.map((_, cIndex) => {
              const groupX = bandCenter(cIndex) - groupW / 2;
              if (isStacked) {
                // Interior segment labels are deliberately omitted: text inside a
                // colored fill can't be guaranteed 4.5:1 across five hues × two
                // themes. The stack total rides above the bar in text ink, and the
                // tooltip + table view carry every segment figure.
                const segments = series
                  .map((s, sIndex) => ({ sIndex, name: s.name, value: valueAt(sIndex, cIndex) ?? 0 }))
                  .filter((seg) => seg.value > 0);
                const topmost = segments.length > 0 ? segments[segments.length - 1].sIndex : -1;
                const total = segments.reduce((sum, seg) => sum + seg.value, 0);
                let cursor = baseline;
                return (
                  <g key={`stack-${cIndex}`}>
                    {segments.map((seg) => {
                      const segH = (seg.value / (scale.max - scale.min || 1)) * plotH;
                      const top = cursor - segH;
                      cursor = top;
                      const drawH = Math.max(1, segH - SURFACE_GAP);
                      return (
                        <g key={seg.sIndex} className={seriesInk(seg.sIndex)}>
                          <path
                            d={barPath(groupX, top + SURFACE_GAP, barW, drawH, seg.sIndex === topmost ? 4 : 0)}
                            fill="currentColor"
                          />
                        </g>
                      );
                    })}
                    {total > 0 && (
                      <text
                        x={groupX + barW / 2}
                        y={cursor - 5}
                        textAnchor="middle"
                        fontSize={LABEL_FONT}
                        className="fill-foreground tabular"
                      >
                        {formatValue(total)}
                      </text>
                    )}
                  </g>
                );
              }
              return (
                <g key={`bars-${cIndex}`}>
                  {series.map((_s, sIndex) => {
                    const value = valueAt(sIndex, cIndex);
                    if (value === null) return null;
                    const x = groupX + sIndex * (barW + SURFACE_GAP);
                    const top = Math.min(y(value), baseline);
                    const h = Math.abs(baseline - y(value));
                    if (h < 0.5) return null;
                    return (
                      <g key={sIndex} className={seriesInk(sIndex)}>
                        <path d={barPath(x, top, barW, h)} fill="currentColor" />
                        {labelBars && (
                          <text
                            x={x + barW / 2}
                            y={top - 5}
                            textAnchor="middle"
                            fontSize={LABEL_FONT}
                            className="fill-foreground tabular"
                          >
                            {formatValue(value)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

        {/* x category labels */}
        <g aria-hidden="true">
          {categories.map((category, index) => {
            const x = bandCenter(index);
            const yy = margin.top + plotH + 16;
            return rotateX ? (
              <text
                key={category + index}
                x={x}
                y={yy}
                fontSize={AXIS_FONT}
                textAnchor="end"
                transform={`rotate(-35 ${x} ${yy})`}
                className="fill-muted-foreground"
              >
                {category.length > 22 ? `${category.slice(0, 21)}…` : category}
              </text>
            ) : (
              <text
                key={category + index}
                x={x}
                y={yy}
                fontSize={AXIS_FONT}
                textAnchor="middle"
                className="fill-muted-foreground"
              >
                {category.length > 16 ? `${category.slice(0, 15)}…` : category}
              </text>
            );
          })}
        </g>

        {/* axis titles */}
        {spec.x_axis?.label && (
          <text
            x={margin.left + plotW / 2}
            y={height - 4}
            textAnchor="middle"
            fontSize={AXIS_FONT + 1}
            className="fill-foreground"
          >
            {spec.x_axis.label}
          </text>
        )}
        {spec.y_axis?.label && (
          <text
            x={12}
            y={margin.top + plotH / 2}
            textAnchor="middle"
            fontSize={AXIS_FONT + 1}
            transform={`rotate(-90 12 ${margin.top + plotH / 2})`}
            className="fill-foreground"
          >
            {spec.y_axis.label}
          </text>
        )}
      </svg>

      {hover && categories[hover.index] !== undefined && (
        <div
          role="presentation"
          className={cn(
            "pointer-events-none absolute z-20 min-w-[9rem] rounded-lg border border-border bg-card p-2.5 shadow-xl",
            hover.x > width / 2 ? "-translate-x-full" : "",
          )}
          style={{ left: hover.x + (hover.x > width / 2 ? -12 : 12), top: margin.top }}
        >
          <p className="mb-1 text-[12px] font-semibold text-foreground">{categories[hover.index]}</p>
          <ul className="space-y-0.5">
            {series.map((s, sIndex) => (
              <li key={sIndex} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className={cn("h-2 w-2 rounded-sm bg-current", seriesInk(sIndex))} />
                  {s.name || `Series ${sIndex + 1}`}
                </span>
                <span className="tabular text-foreground">
                  {valueAt(sIndex, hover.index) === null
                    ? "—"
                    : formatValue(valueAt(sIndex, hover.index) as number)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

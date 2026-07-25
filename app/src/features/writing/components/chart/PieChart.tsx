/**
 * `kind: "pie"` — one series whose values are shares of a whole (05 §2.2:
 * "values sum to 100 or are normalised").
 *
 * 12 §6 forbids pie charts for BandReady's *own* analytics; this is different —
 * it reproduces an exam stimulus the candidate has to describe, and real IELTS
 * Academic Task 1 papers use pies. Every segment is labelled outside the circle
 * with a leader line, so nothing depends on matching a color to a legend — which
 * is also why the five categorical slots may repeat past a sixth segment here
 * without ambiguity (identity is carried by the label, not the hue).
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { ChartSpec } from "../../store";
import { LABEL_FONT, SERIES_MAX, formatValue, seriesInk, textWidth } from "./palette";

export interface PieChartProps {
  spec: ChartSpec;
  width: number;
  ariaLabel: string;
}

interface Slice {
  index: number;
  label: string;
  value: number;
  share: number;
  start: number;
  end: number;
}

const TAU = Math.PI * 2;

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle - Math.PI / 2), cy + r * Math.sin(angle - Math.PI / 2)];
}

function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > Math.PI ? 1 : 0;
  if (end - start >= TAU - 1e-6) {
    return `M${cx},${cy - r}A${r},${r} 0 1 1 ${cx - 0.01},${cy - r}Z`;
  }
  return `M${cx},${cy}L${x1},${y1}A${r},${r} 0 ${large} 1 ${x2},${y2}Z`;
}

export function PieChart({ spec, width, ariaLabel }: PieChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const categories = (spec.x_axis?.categories ?? []).map((c) => String(c));
  const values = spec.series?.[0]?.values ?? [];

  const slices = useMemo<Slice[]>(() => {
    const clean = values
      .slice(0, Math.max(SERIES_MAX * 2, 10))
      .map((v) => (Number.isFinite(v) ? Math.max(0, v) : 0));
    const total = clean.reduce((sum, v) => sum + v, 0);
    if (total <= 0) return [];
    let cursor = 0;
    return clean.map((value, index) => {
      const share = value / total;
      const start = cursor;
      cursor += share * TAU;
      return {
        index,
        label: categories[index] ?? `Segment ${index + 1}`,
        value,
        share,
        start,
        end: cursor,
      };
    });
  }, [values, categories]);

  const height = Math.round(Math.min(400, Math.max(260, width * 0.62)));
  const labelRoom = Math.min(150, Math.max(90, width * 0.22));
  // Capped so the slice labels always keep their gutter on a wide panel.
  const radius = Math.max(56, Math.min(160, (height - 64) / 2, (width - labelRoom * 2) / 2));
  const cx = width / 2;
  const cy = height / 2 + 4;

  if (slices.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        This pie chart has no segment values — use the table view.
      </p>
    );
  }

  // Outside labels with leader lines, nudged apart per side so text never overlaps.
  const placed = slices.map((slice) => {
    const mid = (slice.start + slice.end) / 2;
    const [ax, ay] = polar(cx, cy, radius + 6, mid);
    const right = Math.cos(mid - Math.PI / 2) >= 0;
    return { slice, mid, ax, ay, right, ty: ay };
  });
  for (const side of [true, false]) {
    const group = placed.filter((p) => p.right === side).sort((a, b) => a.ay - b.ay);
    let last = -Infinity;
    for (const item of group) {
      item.ty = Math.max(item.ay, last + 15);
      last = item.ty;
    }
    // Pull the column back inside the canvas if the nudging overflowed.
    const overflow = last - (height - 8);
    if (overflow > 0) group.forEach((item) => (item.ty -= overflow));
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
        {slices.map((slice) => (
          <g key={slice.index} className={seriesInk(slice.index % SERIES_MAX)}>
            <path
              d={slicePath(cx, cy, hover === slice.index ? radius + 3 : radius, slice.start, slice.end)}
              fill="currentColor"
              /* 2px of surface between touching slices — the house surface gap. */
              className="stroke-card transition-[d]"
              strokeWidth={2}
              onMouseEnter={() => setHover(slice.index)}
            />
          </g>
        ))}

        {placed.map(({ slice, ax, ay, right, ty }) => {
          const anchorX = right ? cx + radius + 14 : cx - radius - 14;
          const textX = right ? anchorX + 6 : anchorX - 6;
          const label = `${slice.label} ${formatValue(slice.value)}${spec.unit?.trim() === "%" ? "%" : ""}`;
          const clipped =
            textWidth(label, LABEL_FONT + 0.5) > (right ? width - textX - 2 : textX - 2)
              ? `${slice.label.slice(0, 12)}… ${formatValue(slice.value)}`
              : label;
          return (
            <g key={`lbl-${slice.index}`} aria-hidden="true">
              <polyline
                points={`${ax},${ay} ${anchorX},${ty} ${textX},${ty}`}
                fill="none"
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={textX}
                y={ty}
                dy="0.32em"
                textAnchor={right ? "start" : "end"}
                fontSize={LABEL_FONT + 0.5}
                className={cn("fill-foreground", hover === slice.index && "font-semibold")}
              >
                {clipped}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
        {slices.map((slice) => (
          <li key={slice.index} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className={cn("h-2.5 w-2.5 rounded-sm bg-current", seriesInk(slice.index % SERIES_MAX))} />
            <span className="text-foreground">{slice.label}</span>
            <span className="tabular">{Math.round(slice.share * 1000) / 10}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

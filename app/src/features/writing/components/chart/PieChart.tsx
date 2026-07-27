/**
 * `kind: "pie"` — shares of a whole. One `series` draws one pie; two or three
 * draw a pie **pair or trio** (chart_spec v2, DESIGN §6.5), which is what turns
 * a ranking task into a change-of-share task.
 *
 * 12 §6 forbids pie charts for BandReady's *own* analytics; this is different —
 * it reproduces an exam stimulus the candidate has to describe, and real
 * IELTS-style Academic Task 1 papers use them.
 *
 * Two label strategies, because the two shapes have different reading jobs:
 *
 * - **One pie** — every segment is named outside the circle on a leader line, so
 *   identity never depends on matching a colour to a legend.
 * - **A pair or trio** — the ring is small and the same seven names would be
 *   repeated two or three times, so each slice carries only its figure and
 *   identity moves to one shared legend above the rings. Colour therefore
 *   becomes load-bearing, and `segmentStyle` answers that by giving segments
 *   6–10 a hatch over the fixed hue order instead of cycling the hues.
 */

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  HATCH_CSS,
  LABEL_FONT,
  SEGMENT_MAX,
  formatValue,
  segmentStyle,
  textWidth,
} from "./palette";
import { pieRings, type ChartSpecLike } from "./spec";

export interface PieChartProps {
  spec: ChartSpecLike;
  width: number;
  ariaLabel: string;
  /** id of the full text alternative, announced after the label. */
  describedBy?: string;
}

interface Slice {
  index: number;
  label: string;
  value: number;
  share: number;
  start: number;
  end: number;
}

interface Placed {
  slice: Slice;
  ax: number;
  ay: number;
  right: boolean;
  ty: number;
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

function toSlices(values: number[], categories: string[]): Slice[] {
  const clean = values
    .slice(0, SEGMENT_MAX)
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
}

/** Outside label anchors, nudged apart per side so text never overlaps. */
function placeLabels(
  slices: Slice[],
  cx: number,
  cy: number,
  radius: number,
  floor: number,
  lineHeight = 15,
): Placed[] {
  const placed: Placed[] = slices.map((slice) => {
    const mid = (slice.start + slice.end) / 2;
    const [ax, ay] = polar(cx, cy, radius + 6, mid);
    return { slice, ax, ay, right: Math.cos(mid - Math.PI / 2) >= 0, ty: ay };
  });
  for (const side of [true, false]) {
    const group = placed.filter((p) => p.right === side).sort((a, b) => a.ay - b.ay);
    let last = -Infinity;
    for (const item of group) {
      item.ty = Math.max(item.ay, last + lineHeight);
      last = item.ty;
    }
    const overflow = last - floor;
    if (overflow > 0) group.forEach((item) => (item.ty -= overflow));
  }
  return placed;
}

export function PieChart({ spec, width, ariaLabel, describedBy }: PieChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const hatchId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const categories = useMemo(
    () => (spec.x_axis?.categories ?? []).map((c) => String(c)),
    [spec.x_axis?.categories],
  );
  const rings = useMemo(() => pieRings(spec), [spec]);
  const ringSlices = useMemo(
    () => rings.map((ring) => toSlices(ring.values, categories)),
    [rings, categories],
  );

  const multi = rings.length > 1;
  const percentUnit = (spec.unit ?? "").includes("%");

  if (ringSlices.length === 0 || ringSlices.every((slices) => slices.length === 0)) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        This pie chart has no segment values — use the table view.
      </p>
    );
  }

  // ------------------------------------------------------------- geometry ---
  const gap = 16;
  const cols = multi
    ? Math.max(1, Math.min(rings.length, Math.floor((width + gap) / (200 + gap))))
    : 1;
  const rowCount = Math.ceil(rings.length / cols);
  const cellW = multi ? (width - gap * (cols - 1)) / cols : width;

  const radius = multi
    ? Math.max(46, Math.min(92, cellW / 2 - 40))
    : Math.max(
        56,
        Math.min(160, (Math.min(400, Math.max(260, width * 0.62)) - 64) / 2, (width - Math.min(150, Math.max(90, width * 0.22)) * 2) / 2),
      );

  const captionH = multi ? 22 : 0;
  const cellH = multi ? radius * 2 + 52 + captionH : Math.round(Math.min(400, Math.max(260, width * 0.62)));
  const height = multi ? rowCount * cellH + (rowCount - 1) * gap : cellH;

  const cellOrigin = (index: number): { x: number; y: number } => {
    if (!multi) return { x: 0, y: 0 };
    const col = index % cols;
    const row = Math.floor(index / cols);
    return { x: col * (cellW + gap), y: row * (cellH + gap) };
  };

  const legendSegments = categories.length > 0
    ? categories.slice(0, SEGMENT_MAX)
    : (ringSlices[0] ?? []).map((slice) => slice.label);

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        className="block select-none overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {/* Second encoding for segments 6+: surface-coloured hatch, so the
              texture reads on both themes without a hard-coded colour. */}
          <pattern
            id={`hatch-${hatchId}`}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1={0} y1={0} x2={0} y2={6} className="stroke-card" strokeWidth={2.2} />
          </pattern>
        </defs>

        {rings.map((ring, ringIndex) => {
          const slices = ringSlices[ringIndex] ?? [];
          const origin = cellOrigin(ringIndex);
          const cx = origin.x + (multi ? cellW / 2 : width / 2);
          const centreY = multi ? origin.y + radius + 14 : origin.y + cellH / 2 + 4;
          const floor = origin.y + (multi ? radius * 2 + 26 : cellH - 8);
          const placed = placeLabels(slices, cx, centreY, radius, floor, multi ? 13 : 15);

          return (
            <g key={ringIndex}>
              {slices.map((slice) => {
                const style = segmentStyle(slice.index);
                const grown = hover === slice.index ? radius + 3 : radius;
                const d = slicePath(cx, centreY, grown, slice.start, slice.end);
                return (
                  <g key={slice.index} className={style.ink}>
                    <path
                      d={d}
                      fill="currentColor"
                      /* 2px of surface between touching slices — the house surface gap. */
                      className="stroke-card transition-[d]"
                      strokeWidth={2}
                      onMouseEnter={() => setHover(slice.index)}
                    >
                      <title>{`${slice.label}: ${formatValue(slice.value)}${percentUnit ? "%" : ""}${
                        multi ? ` (${ring.name})` : ""
                      }`}</title>
                    </path>
                    {style.hatched && (
                      <path
                        d={d}
                        fill={`url(#hatch-${hatchId})`}
                        className="stroke-card"
                        strokeWidth={2}
                        aria-hidden="true"
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}

              {placed.map(({ slice, ax, ay, right, ty }) => {
                const anchorX = right ? cx + radius + 12 : cx - radius - 12;
                const textX = right ? anchorX + 5 : anchorX - 5;
                const figure = `${formatValue(slice.value)}${percentUnit ? "%" : ""}`;
                const full = multi ? figure : `${slice.label} ${figure}`;
                const room = right ? width - textX - 2 : textX - 2;
                const label =
                  textWidth(full, LABEL_FONT + 0.5) > room && !multi
                    ? `${slice.label.slice(0, 12)}… ${figure}`
                    : full;
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
                      className={cn("fill-foreground tabular", hover === slice.index && "font-semibold")}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {multi && (
                <text
                  x={cx}
                  y={origin.y + radius * 2 + 42}
                  textAnchor="middle"
                  fontSize={LABEL_FONT + 1.5}
                  className="fill-foreground"
                  fontWeight={600}
                >
                  {ring.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* One legend for every ring: the segments are the same in all of them. */}
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
        {legendSegments.map((label, index) => {
          const style = segmentStyle(index);
          const first = ringSlices[0]?.[index];
          return (
            <li key={`${label}-${index}`} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span
                className={cn("h-2.5 w-2.5 shrink-0 rounded-sm bg-current", style.ink)}
                style={style.hatched ? { backgroundImage: HATCH_CSS } : undefined}
                aria-hidden="true"
              />
              <span className="text-foreground">{label}</span>
              {!multi && first && (
                <span className="tabular">{Math.round(first.share * 1000) / 10}%</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

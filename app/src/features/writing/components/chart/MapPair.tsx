/**
 * `kind: "map"` — the two labelled site plans an Academic Task 1 "changes to a
 * town" prompt shows. Each snapshot is a 0–100 × 0–100 grid of features
 * (05 §2.2); the renderer adds the north arrow and scale bar, plus a faint grid
 * so the candidate can talk about relative position.
 *
 * 05 open question 3 flags this schema as crude; the shapes below are honest
 * about that — a `road` is a paved band, a `river` a wavy band, a `tree` a canopy
 * on a trunk, and anything unrecognised falls back to a labelled block rather
 * than being dropped.
 */

import { cn } from "@/lib/cn";
import type { ChartFeature, ChartSnapshot } from "../../store";
import { LABEL_FONT, wrapLines } from "./palette";
import type { ChartSpecLike } from "./spec";

export interface MapPairProps {
  spec: ChartSpecLike;
  width: number;
  ariaLabel: string;
  /** id of the full text alternative, announced after the label. */
  describedBy?: string;
}

const PAD = 10;

interface Projector {
  /** grid coordinate (0–100) → pixel position inside the padded panel. */
  pos: (v: number) => number;
  /** grid length (0–100) → pixel length. */
  len: (v: number) => number;
}

function Feature({ feature, project }: { feature: ChartFeature; project: Projector }) {
  const x = project.pos(feature.x);
  const y = project.pos(feature.y);
  const w = Math.max(4, project.len(feature.w));
  const h = Math.max(4, project.len(feature.h));
  const cx = x + w / 2;
  const cy = y + h / 2;
  const lines = wrapLines(feature.label, Math.max(w, 64), LABEL_FONT - 0.5, 2);
  const labelInside = w > 52 && h > 26;

  const label = (
    <text
      x={cx}
      y={labelInside ? cy - ((lines.length - 1) * 10) / 2 : y - 4}
      textAnchor="middle"
      fontSize={LABEL_FONT - 0.5}
      className="fill-foreground"
    >
      {lines.map((line, i) => (
        <tspan key={i} x={cx} dy={i === 0 ? "0.32em" : 10}>
          {line}
        </tspan>
      ))}
    </text>
  );

  switch (feature.shape) {
    case "circle":
      return (
        <g>
          <ellipse
            cx={cx}
            cy={cy}
            rx={w / 2}
            ry={h / 2}
            className="fill-muted stroke-muted-foreground/70"
            strokeWidth={1}
          />
          {label}
        </g>
      );
    case "road":
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} className="fill-muted-foreground/25" />
          <line
            x1={w > h ? x : cx}
            y1={w > h ? cy : y}
            x2={w > h ? x + w : cx}
            y2={w > h ? cy : y + h}
            className="stroke-muted-foreground"
            strokeWidth={1}
            strokeDasharray="6 5"
          />
          {label}
        </g>
      );
    case "river": {
      const horizontal = w >= h;
      const amp = Math.min(8, (horizontal ? h : w) / 2);
      const steps = 6;
      const points: string[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const wobble = Math.sin(t * Math.PI * 2) * amp;
        points.push(horizontal ? `${x + w * t},${cy + wobble}` : `${cx + wobble},${y + h * t}`);
      }
      return (
        <g>
          <polyline
            points={points.join(" ")}
            fill="none"
            className="stroke-[#2a78d6]/45 dark:stroke-[#3987e5]/50"
            strokeWidth={Math.max(6, Math.min(horizontal ? h : w, 18))}
            strokeLinecap="round"
          />
          {label}
        </g>
      );
    }
    case "tree": {
      const canopy = Math.min(w, h) * 0.55;
      return (
        <g>
          <rect
            x={cx - 1.5}
            y={cy}
            width={3}
            height={Math.max(4, h / 2)}
            className="fill-muted-foreground/70"
          />
          <circle
            cx={cx}
            cy={cy}
            r={canopy}
            className="fill-[#1baf7a]/35 stroke-[#1baf7a] dark:fill-[#199e70]/35 dark:stroke-[#199e70]"
            strokeWidth={1}
          />
          <text
            x={cx}
            y={y + h + 10}
            textAnchor="middle"
            fontSize={LABEL_FONT - 1}
            className="fill-muted-foreground"
          >
            {feature.label}
          </text>
        </g>
      );
    }
    default:
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={3}
            className="fill-muted stroke-muted-foreground/70"
            strokeWidth={1}
          />
          {label}
        </g>
      );
  }
}

function Snapshot({
  snapshot,
  size,
  ariaLabel,
  describedBy,
}: {
  snapshot: ChartSnapshot;
  size: number;
  ariaLabel: string;
  describedBy?: string;
}) {
  const inner = size - PAD * 2;
  const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
  const scale = (v: number) => PAD + (clamp(v) / 100) * inner;
  const project: Projector = { pos: scale, len: (v) => (clamp(v) / 100) * inner };

  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="mb-1.5 text-[12px] font-semibold text-foreground">
        {snapshot.label || "Plan"}
      </figcaption>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={`${snapshot.label}. ${ariaLabel}`}
        aria-describedby={describedBy}
        className="block max-w-full rounded-lg border border-border bg-card"
      >
        <g aria-hidden="true">
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line
                x1={scale(tick)}
                x2={scale(tick)}
                y1={PAD}
                y2={PAD + inner}
                className="stroke-border/60"
                strokeWidth={1}
              />
              <line
                x1={PAD}
                x2={PAD + inner}
                y1={scale(tick)}
                y2={scale(tick)}
                className="stroke-border/60"
                strokeWidth={1}
              />
            </g>
          ))}
        </g>

        {(snapshot.features ?? []).map((feature, i) => (
          <Feature key={`${feature.label}-${i}`} feature={feature} project={project} />
        ))}

        {/* north arrow + scale bar (renderer decoration, not data) */}
        <g aria-hidden="true" transform={`translate(${size - 26},${18})`}>
          <path d="M0,12 L0,-8" className="stroke-muted-foreground" strokeWidth={1.2} />
          <path d="M-3.5,-4 L0,-10 L3.5,-4 Z" className="fill-muted-foreground" />
          <text y={22} textAnchor="middle" fontSize={9} className="fill-muted-foreground">
            N
          </text>
        </g>
        <g aria-hidden="true" transform={`translate(${PAD},${size - 8})`}>
          <line x1={0} x2={inner / 4} y1={-4} y2={-4} className="stroke-muted-foreground" strokeWidth={1.2} />
          <line x1={0} x2={0} y1={-7} y2={-1} className="stroke-muted-foreground" strokeWidth={1.2} />
          <line
            x1={inner / 4}
            x2={inner / 4}
            y1={-7}
            y2={-1}
            className="stroke-muted-foreground"
            strokeWidth={1.2}
          />
          <text x={inner / 4 + 6} y={-1} fontSize={9} className="fill-muted-foreground">
            not to scale
          </text>
        </g>
      </svg>
    </figure>
  );
}

/** Both plans side by side; stacked when the panel is too narrow for two. */
export function MapPair({ spec, width, ariaLabel, describedBy }: MapPairProps) {
  const snapshots = (spec.snapshots ?? []).slice(0, 2);
  if (snapshots.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        This map prompt has no plans attached. Use the table view.
      </p>
    );
  }

  const stacked = width < 520 || snapshots.length === 1;
  const size = stacked
    ? Math.min(360, Math.max(220, width))
    : Math.min(300, Math.max(180, Math.floor((width - 16) / snapshots.length)));

  return (
    <div className={cn("flex gap-4", stacked ? "flex-col items-start" : "flex-row items-start")}>
      {/* The description covers both plans, so it is attached to the first
          graphic only — pointing both at it would read the whole thing twice. */}
      {snapshots.map((snapshot, i) => (
        <Snapshot
          key={i}
          snapshot={snapshot}
          size={size}
          ariaLabel={ariaLabel}
          describedBy={i === 0 ? describedBy : undefined}
        />
      ))}
    </div>
  );
}

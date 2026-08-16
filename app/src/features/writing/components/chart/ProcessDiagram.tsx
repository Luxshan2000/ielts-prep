/**
 * `kind: "process"` — the stage diagram an Academic Task 1 "how X is made"
 * prompt shows (05 §2.2: "lays out steps left-to-right by topological order with
 * arrows", linear or branching DAG).
 *
 * Layout: stages are placed in columns by longest-path depth, so a branch fans
 * out vertically and a merge pulls back together. A purely linear chain of more
 * than four stages wraps into a boustrophedon grid instead — six 90px columns
 * would clip every label, and the plan's own example has six stages.
 */

import { useId } from "react";
import type { ChartStep } from "../../store";
import { LABEL_FONT, wrapLines } from "./palette";
import type { ChartSpecLike } from "./spec";

export interface ProcessDiagramProps {
  spec: ChartSpecLike;
  width: number;
  ariaLabel: string;
  /** id of the full text alternative, announced after the label. */
  describedBy?: string;
}

interface Node {
  step: ChartStep;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
}

const BOX_FONT = LABEL_FONT + 1;
const LINE_H = 13;
const PAD_Y = 10;
const GAP_X = 34;
const GAP_Y = 26;

/** Longest-path depth per node; cycles (never valid, but never fatal) collapse. */
function depths(steps: ChartStep[]): Map<string, number> {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (id: string): number => {
    if (depth.has(id)) return depth.get(id) as number;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = steps.filter((s) => (s.next ?? []).includes(id));
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((p) => walk(p.id) + 1));
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };

  for (const step of steps) if (byId.has(step.id)) walk(step.id);
  return depth;
}

function isLinearChain(steps: ChartStep[]): boolean {
  return steps.every((step) => (step.next ?? []).length <= 1);
}

export function ProcessDiagram({ spec, width, ariaLabel, describedBy }: ProcessDiagramProps) {
  // Marker ids must be unique per instance: two diagrams on one page would
  // otherwise both resolve to whichever `<defs>` mounted first.
  const arrowId = `br-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const steps = (spec.steps ?? []).filter((step) => step && step.id);
  if (steps.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        This process diagram has no stages. Use the table view.
      </p>
    );
  }

  const linear = isLinearChain(steps);
  const columns = linear
    ? Math.min(steps.length, width < 460 ? 2 : 3)
    : Math.max(...Array.from(depths(steps).values())) + 1;

  const boxW = Math.max(96, Math.floor((width - GAP_X * (columns - 1)) / columns));

  const boxOf = (step: ChartStep, index: number, col: number): Node => {
    const lines = wrapLines(step.label, boxW - 16, BOX_FONT, 4);
    return {
      step,
      index,
      x: col * (boxW + GAP_X),
      y: 0,
      w: boxW,
      h: lines.length * LINE_H + PAD_Y * 2,
      lines,
    };
  };

  const nodes: Node[] = [];
  if (linear) {
    // Boustrophedon: row 0 left→right, row 1 right→left, so the arrow between
    // rows is a short vertical hop instead of a long sweep back.
    const rows: Node[][] = [];
    steps.forEach((step, index) => {
      const row = Math.floor(index / columns);
      const posInRow = index % columns;
      const col = row % 2 === 0 ? posInRow : columns - 1 - posInRow;
      (rows[row] ??= []).push(boxOf(step, index, col));
    });
    let offset = 0;
    for (const row of rows) {
      const rowHeight = Math.max(...row.map((n) => n.h));
      for (const node of row) {
        node.h = rowHeight;
        node.y = offset;
        nodes.push(node);
      }
      offset += rowHeight + GAP_Y;
    }
  } else {
    const depth = depths(steps);
    const perColumn: ChartStep[][] = Array.from({ length: columns }, () => []);
    steps.forEach((step) => perColumn[Math.min(columns - 1, depth.get(step.id) ?? 0)].push(step));

    const columnNodes = perColumn.map((col, c) => {
      let cursor = 0;
      return col.map((step) => {
        const node = boxOf(step, steps.indexOf(step), c);
        node.y = cursor;
        cursor += node.h + GAP_Y;
        return node;
      });
    });
    const columnHeights = columnNodes.map((col) =>
      col.length === 0 ? 0 : col[col.length - 1].y + col[col.length - 1].h,
    );
    const tallest = Math.max(...columnHeights, 0);
    // Center each column vertically against the tallest one.
    columnNodes.forEach((col, c) => {
      const shift = (tallest - columnHeights[c]) / 2;
      col.forEach((node) => {
        node.y += shift;
        nodes.push(node);
      });
    });
  }

  const svgW = columns * boxW + GAP_X * (columns - 1);
  const svgH = Math.max(...nodes.map((n) => n.y + n.h)) + 8;
  const byId = new Map(nodes.map((n) => [n.step.id, n]));

  const edges: { from: Node; to: Node }[] = [];
  if (linear) {
    for (let i = 0; i < nodes.length - 1; i += 1) edges.push({ from: nodes[i], to: nodes[i + 1] });
  } else {
    steps.forEach((step) => {
      const from = byId.get(step.id);
      if (!from) return;
      (step.next ?? []).forEach((id) => {
        const to = byId.get(id);
        if (to) edges.push({ from, to });
      });
    });
  }

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <svg
        width={svgW}
        height={svgH}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        className="block select-none"
      >
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,1 L9,5 L0,9 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        {edges.map(({ from, to }, i) => {
          const sameRow = Math.abs(from.y - to.y) < 4;
          const rightward = to.x > from.x;
          let d: string;
          if (sameRow && rightward) {
            d = `M${from.x + from.w},${from.y + from.h / 2}H${to.x - 4}`;
          } else if (sameRow && !rightward) {
            d = `M${from.x},${from.y + from.h / 2}H${to.x + to.w + 4}`;
          } else if (Math.abs(from.x - to.x) < 4) {
            d = `M${from.x + from.w / 2},${from.y + from.h}V${to.y - 4}`;
          } else {
            const startX = rightward ? from.x + from.w : from.x;
            const midX = rightward ? startX + GAP_X / 2 : startX - GAP_X / 2;
            const endX = rightward ? to.x - 4 : to.x + to.w + 4;
            d = `M${startX},${from.y + from.h / 2}H${midX}V${to.y + to.h / 2}H${endX}`;
          }
          return (
            <path
              key={i}
              d={d}
              fill="none"
              className="stroke-muted-foreground"
              strokeWidth={1.5}
              markerEnd={`url(#${arrowId})`}
            />
          );
        })}

        {nodes.map((node) => (
          <g key={node.step.id}>
            <rect
              x={node.x}
              y={node.y}
              width={node.w}
              height={node.h}
              rx={8}
              className="fill-muted stroke-border"
              strokeWidth={1}
            />
            <text
              x={node.x + node.w / 2}
              y={node.y + node.h / 2 - ((node.lines.length - 1) * LINE_H) / 2}
              textAnchor="middle"
              fontSize={BOX_FONT}
              className="fill-foreground"
            >
              {node.lines.map((line, i) => (
                <tspan key={i} x={node.x + node.w / 2} dy={i === 0 ? "0.32em" : LINE_H}>
                  {line}
                </tspan>
              ))}
            </text>
            <text
              x={node.x + 8}
              y={node.y + 12}
              fontSize={LABEL_FONT - 1}
              className="fill-muted-foreground tabular"
            >
              {node.index + 1}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * The text alternative — a first-class feature, not an afterthought.
 *
 * In Academic Task 1 the chart *is* the question. A screen-reader candidate who
 * gets "Bar chart: Household spending" and nothing else cannot attempt the task
 * at all. So every spec is turned into a reading that carries **the same facts a
 * sighted candidate can read off the visual**: every axis, every category, every
 * figure with its unit, every stage of a process, every feature on a map and
 * where it sits.
 *
 * Two rules govern what goes in:
 *
 * 1. **Data, never interpretation.** No "rose sharply", no "the clear leader".
 *    Selecting and grouping the figures is the skill being assessed; a
 *    description that does it for the candidate hands over the overview and
 *    makes the task easier for one group than another. Sighted candidates get
 *    marks and numbers; so does this.
 * 2. **Readable in order.** Blocks are short and headed, so a screen reader can
 *    be navigated rather than sat through, and the same DOM is what the visible
 *    "Text description" disclosure shows.
 */

import type { ChartFeature, ChartSnapshot } from "../../store";
import { formatValue } from "./palette";
import { CARTESIAN_KINDS, kindLabel, pieRings, type ChartSpecLike } from "./spec";

export interface DescriptionBlock {
  heading?: string;
  lines: string[];
}

export interface ChartDescription {
  /** Short accessible name for the graphic itself (`aria-label`). */
  label: string;
  blocks: DescriptionBlock[];
  /** The whole thing as plain text, for the clipboard and for tests. */
  text: string;
}

const clean = (value: unknown): string => String(value ?? "").trim();

/** "24", "1,480", "12.5" — the same rounding the drawn labels use. */
const num = (value: unknown): string =>
  typeof value === "number" && Number.isFinite(value) ? formatValue(value) : "no figure";

/** Attach the unit to a figure unless the unit is already a suffix like "%". */
function withUnit(value: unknown, unit: string): string {
  const text = num(value);
  if (!unit || text === "no figure") return text;
  if (unit === "%" || unit.startsWith("%")) return `${text}%`;
  return `${text} ${unit}`;
}

/**
 * A short unit for repeating on every figure; long units stay in the heading.
 * Percentages are the exception — "% of households" is too long to repeat but
 * the bare "89" is unwritable, so the sign alone rides along.
 */
function terseUnit(unit: string): string {
  const trimmed = clean(unit);
  if (!trimmed) return "";
  if (trimmed.includes("%")) return "%";
  return trimmed.length <= 14 ? trimmed : "";
}

// ------------------------------------------------------------------ per kind ---

function describeCartesian(spec: ChartSpecLike, unit: string): DescriptionBlock[] {
  const categories = (spec.x_axis?.categories ?? []).map(clean);
  const series = spec.series ?? [];
  const short = terseUnit(unit);
  const blocks: DescriptionBlock[] = [];

  const axes: string[] = [];
  axes.push(
    `Horizontal axis${spec.x_axis?.label ? ` (${clean(spec.x_axis.label)})` : ""}: ${
      categories.length
    } points, left to right — ${categories.join(", ")}.`,
  );
  const yLabel = clean(spec.y_axis?.label) || clean(unit);
  const { min, max } = spec.y_axis ?? {};
  const range =
    Number.isFinite(min) && Number.isFinite(max)
      ? ` It runs from ${num(min)} to ${num(max)}.`
      : "";
  axes.push(`Vertical axis: ${yLabel || "value"}.${range}`);
  if (spec.kind === "stacked_bar") {
    axes.push(
      `Each bar is a stack of ${series.length} parts, listed below from the bottom of the stack upwards.`,
    );
  }
  blocks.push({ heading: "Axes", lines: axes });

  series.forEach((entry, index) => {
    const name = clean(entry.name) || `Series ${index + 1}`;
    const values = entry.values ?? [];
    const lines = categories.map(
      (category, i) => `${category}: ${short ? withUnit(values[i], short) : num(values[i])}`,
    );
    for (let i = categories.length; i < values.length; i += 1) {
      lines.push(`Extra figure ${i + 1}: ${num(values[i])}`);
    }
    blocks.push({
      heading: series.length > 1 ? name : `${name} — every figure`,
      lines: lines.length > 0 ? lines : ["No figures were supplied for this series."],
    });
  });

  return blocks;
}

function describePie(spec: ChartSpecLike, unit: string): DescriptionBlock[] {
  const categories = (spec.x_axis?.categories ?? []).map(clean);
  const rings = pieRings(spec);
  const short = terseUnit(unit) || "%";
  const blocks: DescriptionBlock[] = [];

  if (rings.length === 0) {
    return [
      {
        heading: "How to read it",
        lines: [
          categories.length > 0
            ? `A pie chart of ${categories.length} segments — ${categories.join(", ")} — but no figures were supplied for them.`
            : "A pie chart with no segments and no figures.",
        ],
      },
    ];
  }

  const segmentCount = categories.length || rings[0].values.length;
  blocks.push({
    heading: "How to read it",
    lines: [
      rings.length === 1
        ? `One pie chart divided into ${segmentCount} segments.`
        : `${rings.length} pie charts, each divided into the same ${segmentCount} segments, so the shares can be compared chart by chart.`,
      `Segments, clockwise from the top: ${
        categories.length > 0 ? categories.join(", ") : "unlabelled"
      }.`,
    ],
  });

  rings.forEach((ring) => {
    blocks.push({
      heading: rings.length > 1 ? `Pie chart: ${ring.name}` : "Segments",
      lines: ring.values.map(
        (value, i) => `${categories[i] ?? `Segment ${i + 1}`}: ${withUnit(value, short)}`,
      ),
    });
  });

  return blocks;
}

function describeTable(spec: ChartSpecLike): DescriptionBlock[] {
  const rows = spec.rows ?? [];
  if (rows.length === 0) return [{ lines: ["This table has no rows."] }];
  const [header, ...body] = rows;
  const heads = header.map(clean);
  return [
    {
      heading: "Columns",
      lines: [
        `${heads.length} columns and ${body.length} data rows.`,
        `Reading across: ${heads.join(", ")}.`,
      ],
    },
    ...body.map((row) => ({
      heading: clean(row[0]) || "Row",
      lines: row
        .slice(1)
        .map((value, i) => `${heads[i + 1] ?? `Column ${i + 2}`}: ${num(value)}`),
    })),
  ];
}

function describeProcess(spec: ChartSpecLike): DescriptionBlock[] {
  const steps = (spec.steps ?? []).filter((step) => step && step.id);
  const byId = new Map(steps.map((step) => [step.id, clean(step.label)]));
  return [
    {
      heading: "How to read it",
      lines: [
        `A diagram of ${steps.length} stages joined by arrows. Each stage below names what happens and which stage the arrow leads to.`,
      ],
    },
    {
      heading: "Stages",
      lines: steps.map((step, index) => {
        const next = (step.next ?? []).map((id) => byId.get(id) ?? id);
        const arrow =
          next.length === 0
            ? "no arrow leaves this stage — it is the end of the process"
            : `arrow to ${next.join(", and to ")}`;
        return `Stage ${index + 1}, ${clean(step.label)} — ${arrow}.`;
      }),
    },
  ];
}

/** 0–100 grid, y measured downward from the top of the plan (north). */
function compass(feature: ChartFeature): string {
  const cx = (Number(feature.x) || 0) + (Number(feature.w) || 0) / 2;
  const cy = (Number(feature.y) || 0) + (Number(feature.h) || 0) / 2;
  const vertical = cy < 38 ? "north" : cy > 62 ? "south" : "";
  const horizontal = cx < 38 ? "west" : cx > 62 ? "east" : "";
  if (!vertical && !horizontal) return "in the centre";
  if (vertical && horizontal) return `in the ${vertical}-${horizontal}`;
  return `in the ${vertical || horizontal}`;
}

function describeFeature(feature: ChartFeature): string {
  const label = clean(feature.label) || "Unlabelled feature";
  const w = Number(feature.w) || 0;
  const h = Number(feature.h) || 0;
  const where = compass(feature);
  if (feature.shape === "road" || feature.shape === "river") {
    const run = w >= h ? "east to west" : "north to south";
    return `${label} — a ${feature.shape} running ${run}, ${where}.`;
  }
  if (feature.shape === "tree") return `${label} — trees, ${where}.`;
  // Footprint on the 0–100 × 0–100 plan: 30×30 reads as large, 16×16 as small.
  const area = w * h;
  const size = area >= 900 ? "a large block" : area >= 250 ? "a medium block" : "a small block";
  return `${label} — ${size}, ${where}.`;
}

function describeMap(spec: ChartSpecLike): DescriptionBlock[] {
  const snapshots = (spec.snapshots ?? []) as ChartSnapshot[];
  return [
    {
      heading: "How to read it",
      lines: [
        `${snapshots.length} plans of the same place, to be compared. Positions below are given as compass directions: the top of each plan is north.`,
      ],
    },
    ...snapshots.map((snapshot, index) => ({
      heading: clean(snapshot.label) || `Plan ${index + 1}`,
      lines:
        (snapshot.features ?? []).length > 0
          ? (snapshot.features ?? []).map(describeFeature)
          : ["No features are marked on this plan."],
    })),
  ];
}

// -------------------------------------------------------------------- entry ---

function blocksFor(spec: ChartSpecLike): DescriptionBlock[] {
  const unit = clean(spec.unit);
  if (CARTESIAN_KINDS.has(spec.kind)) return describeCartesian(spec, unit);
  if (spec.kind === "pie") return describePie(spec, unit);
  if (spec.kind === "table") return describeTable(spec);
  if (spec.kind === "process") return describeProcess(spec);
  if (spec.kind === "map") return describeMap(spec);
  // Unknown kind: say so, then read out whatever figures are attached.
  const fallback: DescriptionBlock[] = [
    {
      heading: "How to read it",
      lines: [
        `This visual is of a type (“${clean(spec.kind) || "unnamed"}”) that cannot be drawn here, so its figures are given below and in the table.`,
      ],
    },
  ];
  if ((spec.series ?? []).length > 0 && (spec.x_axis?.categories ?? []).length > 0) {
    return [...fallback, ...describeCartesian(spec, unit)];
  }
  if ((spec.rows ?? []).length > 0) return [...fallback, ...describeTable(spec)];
  return fallback;
}

function headline(spec: ChartSpecLike): string {
  const unit = clean(spec.unit);
  const title = clean(spec.title);
  return [
    `${kindLabel(spec.kind, spec)}${title ? `: ${title}` : ""}.`,
    unit ? `Figures are in ${unit}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Build the full text alternative for a spec, `mixed` included (each panel is
 * described in turn, numbered, so the candidate knows there are two visuals).
 */
export function describeChart(spec: ChartSpecLike | null | undefined): ChartDescription {
  if (!spec || typeof spec !== "object" || typeof spec.kind !== "string") {
    return {
      label: "Visual with no data attached",
      blocks: [{ lines: ["No chart data was attached to this prompt."] }],
      text: "No chart data was attached to this prompt.",
    };
  }

  const notes = clean(spec.notes);
  const blocks: DescriptionBlock[] = [];
  const intro: string[] = [headline(spec)];
  if (notes) intro.push(notes);

  if (spec.kind === "mixed") {
    const panels = (spec.panels ?? []).filter(
      (panel) => panel && typeof panel === "object" && panel.kind !== "mixed",
    );
    intro.push(
      `This task shows ${panels.length === 2 ? "two visuals" : `${panels.length} visual(s)`} which must be described together.`,
    );
    blocks.push({ heading: "Overview of the task", lines: intro });
    panels.forEach((panel, index) => {
      const panelNotes = clean(panel.notes);
      blocks.push({
        heading: `Visual ${index + 1} of ${panels.length}: ${kindLabel(panel.kind, panel)}${
          clean(panel.title) ? ` — ${clean(panel.title)}` : ""
        }`,
        lines: [
          clean(panel.unit) ? `Figures are in ${clean(panel.unit)}.` : "",
          panelNotes,
        ].filter(Boolean),
      });
      for (const block of blocksFor(panel)) {
        blocks.push({
          heading: block.heading ? `Visual ${index + 1} — ${block.heading}` : undefined,
          lines: block.lines,
        });
      }
    });
  } else {
    blocks.push({ heading: "Overview of the task", lines: intro });
    blocks.push(...blocksFor(spec));
  }

  const text = blocks
    .map((block) => [block.heading, ...block.lines].filter(Boolean).join("\n"))
    .join("\n\n");

  return { label: headline(spec), blocks, text };
}

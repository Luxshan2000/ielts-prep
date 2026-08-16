/**
 * `chart_spec` v2 — the shape layer the renderer builds on.
 *
 * v2 (staging-writing/DESIGN.md §6) adds exactly three things to v1 and breaks
 * nothing: `kind: "mixed"` carrying two child `panels` (the combined task), a
 * `pie` with 2–3 `series` (one ring each), and a `notes` caption. Anything a v1
 * spec could say, a v2 spec still says the same way.
 *
 * The app-wide `ChartSpec` in `../../store` is the v1 type and is not owned by
 * this module, so the v2 surface is declared here as a structural superset:
 * every `ChartSpec` is a `ChartSpecLike`, so nothing upstream has to change for
 * the renderer to understand v2.
 *
 * The other job of this file is `inspectSpec` — the renderer must never show a
 * blank box. Every spec is classified before a single mark is drawn:
 *
 *   ok        → draw it
 *   degraded  → draw/tabulate what is there, and say plainly what is missing
 *   unusable  → do not pretend; explain what the visual was supposed to be
 */

import type { ChartSpec } from "../../store";
import { SERIES_MAX } from "./palette";

/**
 * A chart spec at v2. `kind` widens to `string` on purpose: an unknown kind
 * arriving from a newer content pack is a case the renderer must survive, not a
 * type error, and `inspectSpec` is where it gets caught.
 */
export type ChartSpecLike = Omit<ChartSpec, "kind"> & {
  kind: string;
  /** 2 when the spec uses a v2 addition; absent means 1. */
  spec_version?: number;
  /** ≤ 120-char caption — a rounding note, a "one response per person" note. */
  notes?: string;
  /** `mixed` only: exactly two complete child specs. */
  panels?: ChartSpecLike[];
  /** `mixed` only: teaching data (how the panels relate). Never rendered. */
  panel_link?: string;
};

export const CARTESIAN_KINDS: ReadonlySet<string> = new Set([
  "bar",
  "grouped_bar",
  "stacked_bar",
  "line",
]);

/** Kinds with a drawn form; anything else is data we can only tabulate. */
export const DRAWABLE_KINDS: ReadonlySet<string> = new Set([
  ...CARTESIAN_KINDS,
  "pie",
  "process",
  "map",
]);

export const KNOWN_KINDS: ReadonlySet<string> = new Set([...DRAWABLE_KINDS, "table", "mixed"]);

/** Human name for a kind, used in captions and in the text alternative. */
const KIND_LABEL: Record<string, string> = {
  bar: "Bar chart",
  grouped_bar: "Grouped bar chart",
  stacked_bar: "Stacked bar chart",
  line: "Line graph",
  pie: "Pie chart",
  table: "Table",
  process: "Process diagram",
  map: "Map pair",
  mixed: "Combined visual",
};

export function kindLabel(kind: string, spec?: ChartSpecLike): string {
  if (kind === "pie" && (spec?.series?.length ?? 0) > 1) {
    return (spec?.series?.length ?? 0) > 2 ? "Pie charts (three)" : "Pie charts (pair)";
  }
  return KIND_LABEL[kind] ?? "Visual";
}

// --------------------------------------------------------------- inspection ---

export type SpecStatus = "ok" | "degraded" | "unusable";

export interface SpecReport {
  status: SpecStatus;
  kind: string;
  /** Plain-English problems, safe to show a candidate. Never empty when degraded. */
  issues: string[];
  /** True when the drawn form must be replaced by the tabular reading. */
  tableOnly: boolean;
  /** `mixed` only — the panels worth rendering (child `mixed` panels dropped). */
  panels: ChartSpecLike[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteCount = (values: unknown): number =>
  Array.isArray(values) ? values.filter((v) => Number.isFinite(v)).length : 0;

function inspectCartesian(spec: ChartSpecLike, issues: string[]): SpecStatus {
  const categories = spec.x_axis?.categories ?? [];
  const series = spec.series ?? [];
  if (categories.length === 0) {
    issues.push("The horizontal axis has no categories, so there is nothing to plot against.");
    return "unusable";
  }
  if (series.length === 0) {
    issues.push("No data series were supplied for this chart.");
    return "unusable";
  }
  let status: SpecStatus = "ok";
  const plotted = series.filter((s) => finiteCount(s.values) > 0);
  if (plotted.length === 0) {
    issues.push("Every data series is empty.");
    return "unusable";
  }
  series.forEach((s, index) => {
    const count = finiteCount(s.values);
    if (count === 0) {
      issues.push(`“${s.name || `Series ${index + 1}`}” carries no readable figures.`);
      status = "degraded";
    } else if (count !== categories.length) {
      issues.push(
        `“${s.name || `Series ${index + 1}`}” has ${count} figures for ${categories.length} categories.`,
      );
      status = "degraded";
    }
  });
  return status;
}

function inspectPie(spec: ChartSpecLike, issues: string[]): SpecStatus {
  const series = (spec.series ?? []).filter((s) => finiteCount(s.values) > 0);
  if (series.length === 0) {
    issues.push("This pie chart has no segment values.");
    return "unusable";
  }
  const categories = spec.x_axis?.categories ?? [];
  let status: SpecStatus = "ok";
  if (categories.length === 0) {
    issues.push("The segments are unlabelled, so each one is shown by its position only.");
    status = "degraded";
  }
  if (series.length > 3) {
    issues.push(`Only the first three of ${series.length} pies are drawn.`);
    status = "degraded";
  }
  return status;
}

/**
 * Classify a spec before drawing. Never throws, whatever arrives — a content
 * pack, a generated prompt or a hand-edited row.
 */
export function inspectSpec(spec: unknown): SpecReport {
  const empty: SpecReport = {
    status: "unusable",
    kind: "unknown",
    issues: ["No chart data was attached to this prompt."],
    tableOnly: false,
    panels: [],
  };
  if (!isRecord(spec)) return empty;

  const typed = spec as ChartSpecLike;
  const kind = typeof typed.kind === "string" ? typed.kind : "";
  if (!kind) {
    return { ...empty, issues: ["This visual does not say what kind of chart it is."] };
  }

  const issues: string[] = [];

  if (!KNOWN_KINDS.has(kind)) {
    return {
      status: "degraded",
      kind,
      issues: [
        `“${kind}” is a visual type this version of BandReady cannot draw. Its figures are shown as a table so nothing is lost.`,
      ],
      tableOnly: true,
      panels: [],
    };
  }

  if (kind === "mixed") {
    const raw = Array.isArray(typed.panels) ? typed.panels : [];
    // A child `mixed` is not a legal panel (DESIGN §6.4) — drop it rather than recurse.
    const panels = raw.filter((panel) => isRecord(panel) && panel.kind !== "mixed") as ChartSpecLike[];
    if (panels.length === 0) {
      return {
        status: "unusable",
        kind,
        issues: ["This combined task carries no visuals."],
        tableOnly: false,
        panels: [],
      };
    }
    if (panels.length !== 2) {
      issues.push(
        `A combined task shows two visuals; this one carries ${panels.length}. What is present is shown in full.`,
      );
    }
    const childStatuses = panels.map((panel) => inspectSpec(panel));
    for (const child of childStatuses) {
      if (child.status === "unusable") issues.push(...child.issues);
    }
    const unusable = childStatuses.every((child) => child.status === "unusable");
    return {
      status: unusable ? "unusable" : issues.length > 0 ? "degraded" : "ok",
      kind,
      issues,
      tableOnly: false,
      panels,
    };
  }

  let status: SpecStatus = "ok";
  if (CARTESIAN_KINDS.has(kind)) {
    status = inspectCartesian(typed, issues);
    const seriesCount = typed.series?.length ?? 0;
    if (status !== "unusable" && seriesCount > SERIES_MAX) {
      issues.push(
        `This visual carries ${seriesCount} data series, more than the ${SERIES_MAX} the chart palette can tell apart. It is shown as a table so no figure is lost.`,
      );
      return { status: "degraded", kind, issues, tableOnly: true, panels: [] };
    }
  } else if (kind === "pie") {
    status = inspectPie(typed, issues);
  } else if (kind === "table") {
    const rows = typed.rows ?? [];
    if (rows.length === 0) {
      issues.push("This table has no rows.");
      status = "unusable";
    } else if (rows.length === 1) {
      issues.push("This table has column headings but no data rows.");
      status = "degraded";
    }
  } else if (kind === "process") {
    const steps = (typed.steps ?? []).filter((step) => step && step.id);
    if (steps.length === 0) {
      issues.push("This process diagram has no stages.");
      status = "unusable";
    } else {
      const ids = new Set(steps.map((step) => step.id));
      const dangling = steps
        .flatMap((step) => step.next ?? [])
        .filter((id) => !ids.has(id));
      if (dangling.length > 0) {
        issues.push(`${dangling.length} arrow(s) point to a stage that is not shown.`);
        status = "degraded";
      }
    }
  } else if (kind === "map") {
    const snapshots = (typed.snapshots ?? []).filter((snapshot) => isRecord(snapshot));
    if (snapshots.length === 0) {
      issues.push("This map prompt has no plans attached.");
      status = "unusable";
    } else if (snapshots.length === 1) {
      issues.push("A map task compares two plans; only one was supplied.");
      status = "degraded";
    }
    if (snapshots.every((snapshot) => (snapshot.features ?? []).length === 0)) {
      issues.push("Neither plan has any labelled features.");
      status = "unusable";
    }
  }

  return { status, kind, issues, tableOnly: status === "unusable", panels: [] };
}

/** Pie rings, capped at the three DESIGN §6.5 allows. */
export function pieRings(spec: ChartSpecLike): { name: string; values: number[] }[] {
  return (spec.series ?? [])
    .filter((series) => finiteCount(series.values) > 0)
    .slice(0, 3)
    .map((series, index) => ({
      name: series.name || (index === 0 ? "Share of the total" : `Chart ${index + 1}`),
      values: series.values ?? [],
    }));
}

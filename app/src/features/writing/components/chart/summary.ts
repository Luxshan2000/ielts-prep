/**
 * Client mirror of the sidecar's `bandready.scoring.writing.chart_to_text`
 * (05 §2.2). It is NOT sent to the model — the sidecar builds its own copy for
 * the evaluator — but it is what the SVG announces to a screen reader and what
 * "Copy the data as text" puts on the clipboard, so the two stay in the same
 * shape deliberately.
 */

import type { ChartSpec } from "../../store";

const KIND_LABEL: Record<string, string> = {
  bar: "Bar chart",
  grouped_bar: "Grouped bar chart",
  stacked_bar: "Stacked bar chart",
  line: "Line graph",
  pie: "Pie chart",
  table: "Table",
  process: "Process diagram",
  map: "Map pair",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? "Visual";
}

const fmt = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  return String(value ?? "");
};

export function chartToSummary(spec: ChartSpec | null): string {
  if (!spec) return "";
  const unit = (spec.unit ?? "").trim();
  const head = `${kindLabel(spec.kind)}: ${(spec.title ?? "").trim()}${
    unit ? ` (units: ${unit})` : ""
  }`;
  const lines: string[] = [head];
  const categories = (spec.x_axis?.categories ?? []).map(String);

  if (spec.kind === "bar" || spec.kind === "grouped_bar" || spec.kind === "stacked_bar" || spec.kind === "line") {
    if (spec.x_axis?.label) {
      lines.push(`Horizontal axis (${spec.x_axis.label}): ${categories.join(", ")}`);
    }
    if (spec.y_axis?.label) {
      const { min, max } = spec.y_axis;
      const bounds =
        typeof min === "number" && typeof max === "number" ? ` from ${fmt(min)} to ${fmt(max)}` : "";
      lines.push(`Vertical axis: ${spec.y_axis.label}${bounds}`);
    }
    for (const series of spec.series ?? []) {
      const pairs = (series.values ?? [])
        .map((value, i) => `${categories[i] ?? `#${i + 1}`} ${fmt(value)}`)
        .join(", ");
      lines.push(`${series.name || "Series"}: ${pairs}`);
    }
  } else if (spec.kind === "pie") {
    const values = spec.series?.[0]?.values ?? [];
    lines.push(
      `Segments: ${values.map((value, i) => `${categories[i] ?? `#${i + 1}`} ${fmt(value)}`).join(", ")}`,
    );
  } else if (spec.kind === "table") {
    const rows = spec.rows ?? [];
    if (rows.length > 0) {
      lines.push(`Columns: ${rows[0].map(fmt).join(", ")}`);
      for (const row of rows.slice(1)) lines.push(row.map(fmt).join(" | "));
    }
  } else if (spec.kind === "process") {
    const steps = spec.steps ?? [];
    const byId = new Map(steps.map((step) => [step.id, step.label]));
    steps.forEach((step, index) => {
      const next = (step.next ?? []).map((id) => byId.get(id) ?? id);
      const arrow = next.length > 0 ? ` → ${next.join("; ")}` : " (final stage)";
      lines.push(`Stage ${index + 1}: ${step.label}${arrow}`);
    });
  } else if (spec.kind === "map") {
    for (const snapshot of spec.snapshots ?? []) {
      const features = (snapshot.features ?? [])
        .map((feature) => `${feature.label} (${feature.shape})`)
        .join(", ");
      lines.push(`${snapshot.label || "Snapshot"}: ${features}`);
    }
  }
  return lines.join("\n");
}

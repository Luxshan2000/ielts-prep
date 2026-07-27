/**
 * Client mirror of the sidecar's `bandready.scoring.writing.chart_to_text`
 * (05 §2.2, extended for chart_spec v2 in staging-writing/DESIGN.md §6.6). It is
 * NOT sent to the model — the sidecar builds its own copy for the evaluator —
 * but it is what "Copy the data as text" puts on the clipboard, so the two stay
 * in the same shape deliberately.
 *
 * The *accessible* reading of a chart is `describe.ts`, which is longer and
 * written for a person; this one is the terse machine-parity form.
 */

import { kindLabel, pieRings, type ChartSpecLike } from "./spec";

export { kindLabel };

const fmt = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  return String(value ?? "");
};

function bodyLines(spec: ChartSpecLike, lines: string[]): void {
  const categories = (spec.x_axis?.categories ?? []).map(String);

  if (
    spec.kind === "bar" ||
    spec.kind === "grouped_bar" ||
    spec.kind === "stacked_bar" ||
    spec.kind === "line"
  ) {
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
    const rings = pieRings(spec);
    const single = rings.length <= 1;
    for (const ring of rings) {
      const pairs = ring.values
        .map((value, i) => `${categories[i] ?? `#${i + 1}`} ${fmt(value)}`)
        .join(", ");
      lines.push(`${single ? "Segments" : `Segments in ${ring.name}`}: ${pairs}`);
    }
    if (rings.length === 0) {
      lines.push(`Segments: ${categories.join(", ")}`);
    }
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
}

function head(spec: ChartSpecLike): string {
  const unit = (spec.unit ?? "").trim();
  return `${kindLabel(spec.kind, spec)}: ${(spec.title ?? "").trim()}${
    unit ? ` (units: ${unit})` : ""
  }`;
}

export function chartToSummary(spec: ChartSpecLike | null | undefined): string {
  if (!spec || typeof spec !== "object" || typeof spec.kind !== "string") return "";
  const lines: string[] = [head(spec)];
  const notes = (spec.notes ?? "").trim();
  if (notes) lines.push(`Note: ${notes}`);

  if (spec.kind === "mixed") {
    const panels = (spec.panels ?? []).filter(
      (panel) => panel && typeof panel === "object" && panel.kind !== "mixed",
    );
    panels.forEach((panel, index) => {
      lines.push(`Visual ${index + 1}: ${head(panel)}`);
      const panelNotes = (panel.notes ?? "").trim();
      if (panelNotes) lines.push(`Note: ${panelNotes}`);
      bodyLines(panel, lines);
    });
    return lines.join("\n");
  }

  bodyLines(spec, lines);
  return lines.join("\n");
}

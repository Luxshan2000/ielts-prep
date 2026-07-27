/**
 * Tabular reading of any chart spec — `kind: "table"`'s only renderer, and the
 * "View as table" relief every other kind offers (12 §6 dataviz conventions, and
 * the light-mode contrast relief the palette validator requires).
 */

import { formatValue } from "./palette";
import { kindLabel, type ChartSpecLike } from "./spec";

const cell = (value: string | number): string =>
  typeof value === "number" ? formatValue(value) : String(value ?? "");

const isNumeric = (value: unknown): boolean => typeof value === "number";

function Grid({ head, rows, caption }: { head: string[]; rows: (string | number)[][]; caption?: string }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-[13px]">
        {caption && <caption className="pb-2 text-left text-[12px] text-muted-foreground">{caption}</caption>}
        <thead>
          <tr>
            {head.map((label, i) => (
              <th
                key={`${label}-${i}`}
                scope="col"
                className={`border-b border-border px-2.5 py-2 font-medium text-foreground ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="even:bg-muted/40">
              {row.map((value, c) => (
                <td
                  key={c}
                  className={`border-b border-border/60 px-2.5 py-1.5 ${
                    c === 0 ? "text-left text-foreground" : "text-right tabular text-muted-foreground"
                  }`}
                >
                  {cell(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataTableView({ spec }: { spec: ChartSpecLike }) {
  const unit = (spec.unit ?? "").trim();
  const notes = (spec.notes ?? "").trim();
  const caption = [unit ? `Figures in ${unit}.` : "", notes].filter(Boolean).join(" ") || undefined;

  // A combined task tabulates as two tables, one per visual, in panel order.
  if (spec.kind === "mixed") {
    const panels = (spec.panels ?? []).filter(
      (panel) => panel && typeof panel === "object" && panel.kind !== "mixed",
    );
    if (panels.length === 0) return <NoData />;
    return (
      <div className="space-y-5">
        {panels.map((panel, index) => (
          <div key={index} className="min-w-0">
            <p className="mb-1.5 text-[12px] font-semibold text-foreground">
              Visual {index + 1} of {panels.length} — {kindLabel(panel.kind, panel)}
              {panel.title ? `: ${panel.title}` : ""}
            </p>
            <DataTableView spec={panel} />
          </div>
        ))}
      </div>
    );
  }

  if (spec.kind === "table") {
    const rows = spec.rows ?? [];
    if (rows.length === 0) return <NoData />;
    const [header, ...body] = rows;
    return <Grid head={header.map((h) => String(h))} rows={body} caption={caption} />;
  }

  if (spec.kind === "process") {
    const steps = spec.steps ?? [];
    if (steps.length === 0) return <NoData />;
    const byId = new Map(steps.map((step) => [step.id, step.label]));
    return (
      <Grid
        head={["Stage", "What happens", "Leads to"]}
        rows={steps.map((step, i) => [
          `${i + 1}`,
          step.label,
          (step.next ?? []).map((id) => byId.get(id) ?? id).join("; ") || "final stage",
        ])}
      />
    );
  }

  if (spec.kind === "map") {
    const snapshots = spec.snapshots ?? [];
    if (snapshots.length === 0) return <NoData />;
    return (
      <div className="space-y-4">
        {snapshots.map((snapshot, i) => (
          <Grid
            key={i}
            head={[snapshot.label || `Plan ${i + 1}`, "Kind"]}
            rows={(snapshot.features ?? []).map((feature) => [feature.label, feature.shape])}
          />
        ))}
      </div>
    );
  }

  // Cartesian + pie: categories down the side, one column per series.
  const categories = (spec.x_axis?.categories ?? []).map(String);
  const series = spec.series ?? [];
  if (categories.length === 0 || series.length === 0) return <NoData />;

  const stacked = spec.kind === "stacked_bar";
  const head = [
    spec.x_axis?.label || "Category",
    ...series.map((s) => s.name || "Series"),
    ...(stacked && series.length > 1 ? ["Total"] : []),
  ];
  const rows: (string | number)[][] = categories.map((category, index) => {
    const cells = series.map((s) => {
      const value = s.values?.[index];
      return isNumeric(value) ? (value as number) : "—";
    });
    const total = cells.reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
    return [category, ...cells, ...(stacked && series.length > 1 ? [total] : [])];
  });
  if (series.length > 1) {
    rows.push([
      "All categories",
      ...series.map((s) => (s.values ?? []).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0)),
      ...(stacked
        ? [
            series.reduce(
              (sum, s) => sum + (s.values ?? []).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0),
              0,
            ),
          ]
        : []),
    ]);
  }
  return <Grid head={head} rows={rows} caption={caption} />;
}

function NoData() {
  return (
    <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">
      This visual has no tabular data attached.
    </p>
  );
}

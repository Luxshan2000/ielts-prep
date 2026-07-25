/**
 * Renderer contract tests for the Writing desk's non-trivial pure logic and for
 * the chart renderer's ability to draw every `kind` without producing NaN
 * geometry (an invalid path attribute is the failure mode this catches).
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartRenderer } from "../chart/ChartRenderer";
import { chartToSummary } from "../chart/summary";
import { barPath, formatTick, niceScale } from "../chart/palette";
import { diffStats, diffWords } from "../diff";
import { countEssayWords, type ChartSpec } from "../../store";

const grouped: ChartSpec = {
  kind: "grouped_bar",
  title: "Household spending by category in two countries, 2024",
  unit: "% of household budget",
  x_axis: { label: "Category", categories: ["Housing", "Food", "Transport", "Leisure", "Other"] },
  y_axis: { label: "% of budget", min: 0, max: 40 },
  series: [
    { name: "Norland", values: [31, 18, 14, 12, 25] },
    { name: "Sudonia", values: [22, 27, 10, 8, 33] },
  ],
};

const process: ChartSpec = {
  kind: "process",
  title: "How recycled glass bottles are made into new bottles",
  steps: [
    { id: "collect", label: "Used bottles collected from banks", next: ["sort"] },
    { id: "sort", label: "Sorted by colour", next: ["wash"] },
    { id: "wash", label: "Washed in high-pressure water", next: ["crush"] },
    { id: "crush", label: "Crushed into cullet", next: ["melt"] },
    { id: "melt", label: "Melted in furnace (1500°C)", next: ["mould"] },
    { id: "mould", label: "Moulded into new bottles", next: [] },
  ],
};

const specs: ChartSpec[] = [
  { ...grouped, kind: "bar", series: [grouped.series![0]] },
  grouped,
  { ...grouped, kind: "stacked_bar" },
  { ...grouped, kind: "line" },
  {
    kind: "pie",
    title: "Where the town's waste goes",
    unit: "%",
    x_axis: { categories: ["Landfill", "Recycled", "Composted", "Incinerated"] },
    series: [{ name: "Share", values: [42, 31, 17, 10] }],
  },
  {
    kind: "table",
    title: "Visitor numbers by month",
    rows: [
      ["Month", "2023", "2024"],
      ["January", 1200, 1500],
      ["February", 1100, 1650],
    ],
  },
  process,
  {
    kind: "process",
    title: "Branching example",
    steps: [
      { id: "a", label: "Start", next: ["b", "c"] },
      { id: "b", label: "Left branch", next: ["d"] },
      { id: "c", label: "Right branch", next: ["d"] },
      { id: "d", label: "Merge", next: [] },
    ],
  },
  {
    kind: "map",
    title: "Redevelopment of Hartley village",
    snapshots: [
      {
        label: "1985",
        features: [
          { label: "Farmland", shape: "rect", x: 10, y: 10, w: 50, h: 40 },
          { label: "Main road", shape: "road", x: 0, y: 60, w: 100, h: 8 },
          { label: "Oak", shape: "tree", x: 70, y: 20, w: 14, h: 14 },
        ],
      },
      {
        label: "2024",
        features: [
          { label: "Housing estate", shape: "rect", x: 10, y: 10, w: 50, h: 40 },
          { label: "River Hart", shape: "river", x: 0, y: 80, w: 100, h: 10 },
          { label: "Roundabout", shape: "circle", x: 65, y: 55, w: 20, h: 20 },
        ],
      },
    ],
  },
];

describe("chart renderer", () => {
  it.each(specs.map((spec) => [spec.kind, spec] as const))(
    "renders %s without invalid geometry",
    (_kind, spec) => {
      const { container, unmount } = render(<ChartRenderer spec={spec} />);
      expect(container.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
      expect(screen.getByText(spec.title)).toBeInTheDocument();
      unmount();
    },
  );

  it("falls back to the table view for an unknown kind", () => {
    const { container } = render(
      <ChartRenderer spec={{ kind: "bubble" as ChartSpec["kind"], title: "Odd one out" }} />,
    );
    // No plotted geometry, no chart/table toggle — just the tabular reading.
    expect(container.querySelector("svg[role='img']")).toBeNull();
    expect(screen.queryByRole("button", { name: /view as table/i })).toBeNull();
  });

  it("keeps every drawn label inside the canvas", () => {
    const { container } = render(<ChartRenderer spec={grouped} />);
    const svg = container.querySelector("svg[role='img']") as SVGSVGElement;
    const height = Number(svg.getAttribute("height"));
    const width = Number(svg.getAttribute("width"));
    for (const text of Array.from(svg.querySelectorAll("text"))) {
      const x = Number(text.getAttribute("x"));
      const y = Number(text.getAttribute("y"));
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
    }
  });

  it("nudges converging line end-labels apart", () => {
    const converging: ChartSpec = {
      kind: "line",
      title: "Converging",
      x_axis: { categories: ["2000", "2010", "2020"] },
      series: [
        { name: "Alpha", values: [10, 30, 50] },
        { name: "Beta", values: [90, 70, 50.2] },
        { name: "Gamma", values: [40, 45, 50.1] },
      ],
    };
    const { container } = render(<ChartRenderer spec={converging} />);
    const svg = container.querySelector("svg[role='img']") as SVGSVGElement;
    const labelYs = Array.from(svg.querySelectorAll("text"))
      .filter((text) => ["Alpha", "Beta", "Gamma"].includes(text.textContent ?? ""))
      .map((text) => Number(text.getAttribute("y")))
      .sort((a, b) => a - b);
    expect(labelYs).toHaveLength(3);
    expect(labelYs[1] - labelYs[0]).toBeGreaterThanOrEqual(13);
    expect(labelYs[2] - labelYs[1]).toBeGreaterThanOrEqual(13);
  });

  it("survives an empty spec of every kind", () => {
    for (const kind of ["bar", "line", "pie", "process", "map", "table"] as const) {
      const { container, unmount } = render(<ChartRenderer spec={{ kind, title: "Empty" }} />);
      expect(container.innerHTML).not.toMatch(/NaN/);
      unmount();
    }
  });
});

describe("chart summary", () => {
  it("mirrors the sidecar's chart_to_text shape", () => {
    expect(chartToSummary(grouped).split("\n")).toEqual([
      "Grouped bar chart: Household spending by category in two countries, 2024 (units: % of household budget)",
      "Horizontal axis (Category): Housing, Food, Transport, Leisure, Other",
      "Vertical axis: % of budget from 0 to 40",
      "Norland: Housing 31, Food 18, Transport 14, Leisure 12, Other 25",
      "Sudonia: Housing 22, Food 27, Transport 10, Leisure 8, Other 33",
    ]);
  });

  it("names each process stage with its successor", () => {
    expect(chartToSummary(process)).toContain(
      "Stage 1: Used bottles collected from banks → Sorted by colour",
    );
    expect(chartToSummary(process)).toContain("Stage 6: Moulded into new bottles (final stage)");
  });
});

describe("scales", () => {
  it("honours explicit axis bounds", () => {
    const scale = niceScale(3, 37, { min: 0, max: 40 });
    expect(scale.min).toBe(0);
    expect(scale.max).toBe(40);
  });

  it("produces round ticks when unbounded", () => {
    const scale = niceScale(0, 93);
    expect(scale.ticks[0]).toBe(0);
    expect(scale.ticks.every((t) => Number.isFinite(t))).toBe(true);
    expect(scale.max).toBeGreaterThanOrEqual(93);
  });

  it("never emits a zero-width range", () => {
    const scale = niceScale(5, 5);
    expect(scale.max).toBeGreaterThan(scale.min);
  });

  it("compacts large tick values", () => {
    expect(formatTick(12_500)).toBe("12.5k");
    expect(formatTick(2_400_000)).toBe("2.4M");
    expect(formatTick(42)).toBe("42");
  });

  it("draws no path for a zero-height bar", () => {
    expect(barPath(0, 10, 20, 0)).toBe("");
  });
});

describe("word diff", () => {
  it("reassembles the new text from the kept and inserted chunks", () => {
    const before = "Some people believe that education should be free for everyone.";
    const after = "Many people argue that university education should be free for all citizens.";
    const chunks = diffWords(before, after);
    const rebuilt = chunks
      .filter((chunk) => chunk.op !== "delete")
      .map((chunk) => chunk.text)
      .join("");
    expect(rebuilt).toBe(after);
  });

  it("reassembles the old text from the kept and deleted chunks", () => {
    const before = "The chart shows a sharp rise in 2010.";
    const after = "The chart shows a gradual rise between 2010 and 2015.";
    const chunks = diffWords(before, after);
    const rebuilt = chunks
      .filter((chunk) => chunk.op !== "insert")
      .map((chunk) => chunk.text)
      .join("");
    expect(rebuilt.trim()).toBe(before.trim());
  });

  it("counts additions and removals", () => {
    const stats = diffStats(diffWords("one two three", "one two three four"));
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(0);
    expect(stats.kept).toBe(3);
  });

  it("handles empty inputs", () => {
    expect(diffWords("", "")).toEqual([]);
    expect(diffStats(diffWords("", "hello world")).added).toBe(2);
  });
});

describe("word count parity with the sidecar", () => {
  it("counts hyphenated words once and ignores bare punctuation", () => {
    expect(countEssayWords("well-being matters — a lot")).toBe(4);
    expect(countEssayWords("  ")).toBe(0);
    expect(countEssayWords("In 2024, 15% rose.")).toBe(4);
  });
});

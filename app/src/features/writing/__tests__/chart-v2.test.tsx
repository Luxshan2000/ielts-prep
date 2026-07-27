/**
 * chart_spec v2 renderer contract (W-B3).
 *
 * The specs below are the real authored ones from
 * `content/core-en/staging-writing/prompts/` — grouped and stacked bars,
 * multi-series lines, pie pairs and trios, and the combined `mixed` task — so a
 * regression here is a regression against shipping content, not against a
 * fixture invented to pass.
 *
 * Three things are asserted throughout, in rough order of how badly they hurt
 * when they break:
 *
 * 1. **The text alternative.** In Academic Task 1 the chart *is* the question,
 *    so every kind must produce a reading that carries the same figures a
 *    sighted candidate can see, wired to the graphic with `aria-describedby`.
 * 2. **Nothing is ever a blank box.** Unknown kinds, empty series, a `mixed`
 *    with no panels: each has to say what went wrong in words.
 * 3. **Colour is a token, never a literal.** Marks paint through `currentColor`
 *    so both themes work; a hard-coded `fill="#…"` is a bug.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChartRenderer } from "../components/chart/ChartRenderer";
import { chartToSummary } from "../components/chart/summary";
import { describeChart } from "../components/chart/describe";
import { inspectSpec, type ChartSpecLike } from "../components/chart/spec";

// --------------------------------------------------------------- fixtures ---

const bar: ChartSpecLike = {
  kind: "bar",
  title: "Household waste recycled by material, Norland, 2024",
  unit: "% of that material recycled",
  x_axis: {
    label: "Material",
    categories: ["Glass", "Paper", "Metal", "Plastic", "Textiles", "Garden waste"],
  },
  y_axis: { label: "% recycled", min: 0, max: 80 },
  series: [{ name: "2024", values: [68, 61, 44, 22, 14, 57] }],
};

const groupedBar: ChartSpecLike = {
  kind: "grouped_bar",
  title: "Weekly hours of unpaid household work by task and age group, Norland, 2023",
  unit: "hours per week",
  x_axis: {
    label: "Kind of unpaid work",
    categories: [
      "Cooking and food preparation",
      "Cleaning and laundry",
      "Childcare",
      "Shopping and errands",
      "Repairs and gardening",
    ],
  },
  y_axis: { label: "Hours per week", min: 0, max: 12 },
  series: [
    { name: "Aged 25-39", values: [6.2, 4.8, 11.2, 2.8, 1.6] },
    { name: "Aged 40-59", values: [6.5, 5.4, 3.1, 3.2, 3.4] },
    { name: "Aged 60 and over", values: [7.2, 6.1, 1.4, 4.0, 5.5] },
  ],
};

const stackedBar: ChartSpecLike = {
  kind: "stacked_bar",
  title: "Composition of export earnings by region, Norland, 2024",
  unit: "% of the region's export earnings",
  notes: "Each region's four shares total 100%.",
  x_axis: {
    label: "Region",
    categories: [
      "Northern Isles",
      "Western Uplands",
      "Southern Lowlands",
      "East Coast",
      "Central Plain",
      "Capital Region",
    ],
  },
  y_axis: { label: "% of export earnings", min: 0, max: 100 },
  series: [
    { name: "Agriculture and fishing", values: [38, 31, 24, 17, 10, 4] },
    { name: "Manufacturing", values: [13, 18, 24, 29, 33, 34] },
    { name: "Mining and energy", values: [12, 13, 12, 12, 11, 12] },
    { name: "Services", values: [37, 38, 40, 42, 46, 50] },
  ],
};

const multiLine: ChartSpecLike = {
  kind: "line",
  title: "Households with a fixed telephone line and with broadband, Verdon, 1999-2024",
  unit: "% of households",
  notes: "Households with both services are counted in both lines.",
  x_axis: { label: "Year", categories: ["1999", "2004", "2009", "2014", "2019", "2024"] },
  y_axis: { label: "% of households", min: 0, max: 100 },
  series: [
    { name: "Fixed telephone line", values: [92, 88, 79, 64, 48, 33] },
    { name: "Fixed broadband", values: [4, 26, 58, 76, 85, 89] },
    { name: "Mobile broadband only", values: [0, 2, 6, 14, 27, 41] },
  ],
};

const singlePie: ChartSpecLike = {
  kind: "pie",
  title: "Where the town's waste goes, 2024",
  unit: "%",
  x_axis: { categories: ["Landfill", "Recycled", "Composted", "Incinerated", "Exported"] },
  series: [{ name: "Share", values: [38, 29, 17, 11, 5] }],
};

const piePair: ChartSpecLike = {
  spec_version: 2,
  kind: "pie",
  title: "Composition of average household monthly spending, Verdon, 2004 and 2024",
  unit: "% of monthly spending",
  notes: "Each chart totals 100%. Spending is shown as shares, not as amounts of money.",
  x_axis: {
    label: "Category of spending",
    categories: [
      "Housing and fuel",
      "Food and drink",
      "Transport",
      "Health and insurance",
      "Clothing",
      "Communications and subscriptions",
      "Leisure and eating out",
    ],
  },
  series: [
    { name: "2004", values: [24, 21, 15, 8, 9, 5, 18] },
    { name: "2024", values: [33, 16, 13, 11, 5, 12, 10] },
  ],
};

const pieTrio: ChartSpecLike = {
  spec_version: 2,
  kind: "pie",
  title: "Main source of daily news by age group, Norland, 2024",
  unit: "% of the age group naming it as their main source",
  x_axis: {
    label: "Main source of news",
    categories: [
      "Social media",
      "Television",
      "News websites and apps",
      "Radio",
      "Printed newspapers",
      "Podcasts",
      "Friends and family",
    ],
  },
  series: [
    { name: "Aged 18-29", values: [38, 9, 24, 5, 2, 14, 8] },
    { name: "Aged 30-54", values: [26, 21, 27, 9, 5, 7, 5] },
    { name: "Aged 55 and over", values: [10, 38, 16, 15, 12, 4, 5] },
  ],
};

const table: ChartSpecLike = {
  kind: "table",
  title: "Rent, commuting and car ownership by district, Verdon, 2024",
  unit: "mixed: Verdon dollars, minutes and percentages",
  notes: "Rent is for a two-bedroom flat. Journey times are one way, to the city centre.",
  rows: [
    [
      "District",
      "Average monthly rent (V$)",
      "Average journey to work (minutes)",
      "Households with no car (%)",
    ],
    ["Riverside", 1480, 24, 58],
    ["Old Town", 1320, 19, 64],
    ["Hillcrest", 1180, 38, 31],
    ["Northgate", 910, 41, 27],
    ["Eastfield", 760, 47, 19],
  ],
};

const process: ChartSpecLike = {
  kind: "process",
  title: "How ceramic floor tiles are manufactured",
  steps: [
    { id: "quarry", label: "Raw clay dug from an open quarry", next: ["blend"] },
    { id: "blend", label: "Clay blended with sand and water in a mixing tank", next: ["mill"] },
    { id: "mill", label: "Mixture ground to a fine powder and passed through a sieve", next: ["press"] },
    { id: "press", label: "Powder pressed into square moulds under high pressure", next: ["dry"] },
    { id: "dry", label: "Pressed tiles left to dry for 24 hours in a warm room", next: ["glaze"] },
    { id: "glaze", label: "Coloured glaze sprayed onto the upper surface", next: ["kiln"] },
    { id: "kiln", label: "Tiles fired in a kiln at 1,100°C", next: ["pack"] },
    { id: "pack", label: "Cooled tiles graded, stacked and packed for delivery", next: [] },
  ],
};

const map: ChartSpecLike = {
  kind: "map",
  title: "The centre of Ashfield in 1995 and today",
  snapshots: [
    {
      label: "Ashfield town centre, 1995",
      features: [
        { label: "High Street", shape: "road", x: 0, y: 46, w: 100, h: 6 },
        { label: "Row of small shops", shape: "rect", x: 8, y: 18, w: 24, h: 18 },
        { label: "Cattle market and pens", shape: "rect", x: 6, y: 66, w: 26, h: 20 },
        { label: "Public gardens", shape: "tree", x: 74, y: 78, w: 20, h: 16 },
      ],
    },
    {
      label: "Ashfield town centre, today",
      features: [
        { label: "High Street (pedestrianised)", shape: "road", x: 0, y: 46, w: 100, h: 6 },
        { label: "Chain stores and cafés", shape: "rect", x: 8, y: 18, w: 24, h: 18 },
        { label: "Multi-storey car park", shape: "rect", x: 6, y: 66, w: 26, h: 20 },
        { label: "Bus interchange", shape: "rect", x: 38, y: 82, w: 24, h: 12 },
      ],
    },
  ],
};

const mixed: ChartSpecLike = {
  spec_version: 2,
  kind: "mixed",
  title: "Household waste in Norland: composition and recycling rates",
  notes: "The pie covers all household waste; the graph covers three of its materials.",
  panel_link:
    "The pie says what the waste stream is made of; the line says how much of the three largest materials is recycled.",
  panels: [
    {
      kind: "pie",
      title: "Composition of household waste, 2024",
      unit: "% of household waste by weight",
      x_axis: {
        label: "Material",
        categories: [
          "Food and garden waste",
          "Paper and card",
          "Plastic",
          "Glass",
          "Metal",
          "Other",
        ],
      },
      series: [{ name: "2024", values: [34, 22, 18, 10, 6, 10] }],
    },
    {
      kind: "line",
      title: "Proportion of each material sent for recycling, 2004-2024",
      unit: "% of that material recycled",
      x_axis: { label: "Year", categories: ["2004", "2009", "2014", "2019", "2024"] },
      y_axis: { label: "% recycled", min: 0, max: 80 },
      series: [
        { name: "Paper and card", values: [28, 42, 55, 64, 70] },
        { name: "Glass", values: [40, 48, 54, 58, 60] },
        { name: "Plastic", values: [6, 9, 14, 22, 34] },
      ],
    },
  ],
};

const EVERY_KIND: [string, ChartSpecLike][] = [
  ["bar", bar],
  ["grouped_bar", groupedBar],
  ["stacked_bar", stackedBar],
  ["line (3 series)", multiLine],
  ["pie (single)", singlePie],
  ["pie (pair)", piePair],
  ["pie (trio)", pieTrio],
  ["table", table],
  ["process", process],
  ["map", map],
  ["mixed", mixed],
];

/** The description node the graphic points at, via aria-describedby. */
function textAlternative(container: HTMLElement): HTMLElement {
  const graphic = container.querySelector("svg[role='img'][aria-describedby]");
  expect(graphic, "every drawn chart must point at a text alternative").not.toBeNull();
  const id = graphic?.getAttribute("aria-describedby") ?? "";
  const node = container.querySelector(`#${CSS.escape(id)}`);
  expect(node, `aria-describedby="${id}" must resolve to a node`).not.toBeNull();
  return node as HTMLElement;
}

// ------------------------------------------------------------------- tests ---

describe("chart_spec v2 — every kind draws", () => {
  it.each(EVERY_KIND)("renders %s with clean geometry and its title", (_name, spec) => {
    const { container, unmount } = render(<ChartRenderer spec={spec} />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(container.innerHTML).not.toContain('="undefined"');
    expect(screen.getByText(spec.title)).toBeInTheDocument();
    // Everything except the table is drawn; the table's tabular reading *is* the chart.
    if (spec.kind !== "table") {
      expect(container.querySelectorAll("svg[role='img']").length).toBeGreaterThan(0);
    }
    expect(inspectSpec(spec).status).toBe("ok");
    unmount();
  });

  it("paints every mark through a design token, never a literal colour", () => {
    for (const [, spec] of EVERY_KIND) {
      const { container, unmount } = render(<ChartRenderer spec={spec} />);
      for (const svg of Array.from(container.querySelectorAll("svg[role='img']"))) {
        for (const node of Array.from(svg.querySelectorAll("*"))) {
          for (const attribute of ["fill", "stroke"]) {
            const value = node.getAttribute(attribute);
            // `url(#hatch-…)` is a reference to a token-styled pattern, not a colour.
            if (value) expect(value).not.toMatch(/(^|\s)#[0-9a-f]{3}|rgba?\(|hsla?\(/i);
          }
        }
      }
      unmount();
    }
  });

  it("keeps a grouped bar's series legend and its four axis facts", () => {
    render(<ChartRenderer spec={groupedBar} />);
    for (const name of ["Aged 25-39", "Aged 40-59", "Aged 60 and over"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/units: hours per week/)).toBeInTheDocument();
  });

  it("spells the unit onto the vertical axis when the spec gives no axis label", () => {
    const { container } = render(
      <ChartRenderer spec={{ ...bar, y_axis: undefined, unit: "millions of tonnes" }} />,
    );
    const svg = container.querySelector("svg[role='img']") as SVGSVGElement;
    const labels = Array.from(svg.querySelectorAll("text")).map((t) => t.textContent);
    expect(labels).toContain("millions of tonnes");
  });

  it("shows a spec's notes caption", () => {
    render(<ChartRenderer spec={stackedBar} />);
    // Once as the figure caption, once inside the text alternative.
    expect(screen.getAllByText("Each region's four shares total 100%.")).toHaveLength(2);
  });
});

describe("pie pairs and trios", () => {
  it("draws one ring per series with the series name under it", () => {
    const { container } = render(<ChartRenderer spec={piePair} />);
    const svg = container.querySelector("svg[role='img']") as SVGSVGElement;
    // 7 segments × 2 rings, each a wedge painted through currentColor.
    expect(svg.querySelectorAll('path[fill="currentColor"]')).toHaveLength(14);
    const captions = Array.from(svg.querySelectorAll("text")).map((t) => t.textContent);
    expect(captions).toContain("2004");
    expect(captions).toContain("2024");
  });

  it("draws three rings for a trio", () => {
    const { container } = render(<ChartRenderer spec={pieTrio} />);
    const svg = container.querySelector("svg[role='img']") as SVGSVGElement;
    expect(svg.querySelectorAll('path[fill="currentColor"]')).toHaveLength(21);
  });

  it("gives segments 6 and 7 a hatch rather than recycling a hue", () => {
    const { container } = render(<ChartRenderer spec={piePair} />);
    const svg = container.querySelector("svg[role='img']") as SVGSVGElement;
    expect(svg.querySelectorAll("pattern")).toHaveLength(1);
    // Two hatched segments per ring, two rings.
    expect(svg.querySelectorAll('path[fill^="url(#hatch"]')).toHaveLength(4);
  });

  it("names every segment once, in one shared legend", () => {
    render(<ChartRenderer spec={piePair} />);
    expect(screen.getAllByText("Communications and subscriptions")).toHaveLength(1);
  });

  it("keeps the single-pie label-on-a-leader-line treatment", () => {
    const { container } = render(<ChartRenderer spec={singlePie} />);
    const svg = container.querySelector("svg[role='img']") as SVGSVGElement;
    const labels = Array.from(svg.querySelectorAll("text")).map((t) => t.textContent);
    expect(labels).toContain("Landfill 38%");
  });
});

describe("the combined (mixed) task", () => {
  it("renders both panels, numbered, each with its own drawn visual", () => {
    const { container } = render(<ChartRenderer spec={mixed} />);
    expect(screen.getByText("Visual 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Visual 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Composition of household waste, 2024")).toBeInTheDocument();
    expect(
      screen.getByText("Proportion of each material sent for recycling, 2004-2024"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg[role='img']")).toHaveLength(2);
  });

  it("describes both visuals in one text alternative", () => {
    const { container } = render(<ChartRenderer spec={mixed} />);
    const alt = textAlternative(container);
    expect(alt.textContent).toContain("Visual 1 of 2");
    expect(alt.textContent).toContain("Visual 2 of 2");
    expect(alt.textContent).toContain("Food and garden waste: 34%");
    expect(alt.textContent).toContain("2024: 70%");
  });

  it("never leaks panel_link, which is teaching data and not the candidate's", () => {
    const { container } = render(<ChartRenderer spec={mixed} />);
    expect(container.textContent).not.toContain("The pie says what the waste stream");
  });

  it("refuses a child mixed panel rather than recursing forever", () => {
    const nested: ChartSpecLike = {
      kind: "mixed",
      title: "Nested",
      panels: [mixed, bar],
    };
    const report = inspectSpec(nested);
    expect(report.panels).toHaveLength(1);
    expect(report.panels[0].kind).toBe("bar");
  });

  it("switches every panel to its table together", () => {
    const { container } = render(<ChartRenderer spec={mixed} />);
    fireEvent.click(screen.getByRole("button", { name: /view as table/i }));
    expect(container.querySelectorAll("svg[role='img']")).toHaveLength(0);
    expect(container.querySelectorAll("table").length).toBeGreaterThanOrEqual(2);
  });
});

describe("the text alternative", () => {
  it.each(EVERY_KIND.filter(([, spec]) => spec.kind !== "table"))(
    "%s is wired to its graphic and present before anyone asks",
    (_name, spec) => {
      const { container, unmount } = render(<ChartRenderer spec={spec} />);
      const alt = textAlternative(container);
      // Collapsed it is off-screen, NOT display:none — so it stays announceable.
      expect(alt.className).toContain("sr-only");
      expect((alt.textContent ?? "").length).toBeGreaterThan(120);
      unmount();
    },
  );

  it("carries every figure a sighted candidate can read off a grouped bar", () => {
    const { text } = describeChart(groupedBar);
    for (const series of groupedBar.series ?? []) {
      for (const [index, value] of (series.values ?? []).entries()) {
        const category = groupedBar.x_axis?.categories?.[index] as string;
        expect(text).toContain(`${category}: ${value} hours per week`);
      }
    }
    expect(text).toContain("Vertical axis: Hours per week. It runs from 0 to 12.");
  });

  it("reads each pie of a pair separately, so shares can be compared", () => {
    const { text } = describeChart(piePair);
    expect(text).toContain("Pie chart: 2004");
    expect(text).toContain("Pie chart: 2024");
    expect(text).toContain("Housing and fuel: 24%");
    expect(text).toContain("Housing and fuel: 33%");
    expect(text).toContain("2 pie charts, each divided into the same 7 segments");
  });

  it("reads a table row by row with its column headings", () => {
    const { text } = describeChart(table);
    expect(text).toContain("Riverside");
    expect(text).toContain("Average monthly rent (V$): 1,480");
    expect(text).toContain("Households with no car (%): 19");
  });

  it("reads a process as numbered stages with the arrows out of each", () => {
    const { text } = describeChart(process);
    expect(text).toContain("Stage 1, Raw clay dug from an open quarry — arrow to Clay blended");
    expect(text).toContain("no arrow leaves this stage — it is the end of the process");
  });

  it("places every map feature on the compass, which is the whole task", () => {
    const { text } = describeChart(map);
    expect(text).toContain("the top of each plan is north");
    expect(text).toContain("Row of small shops — a medium block, in the north-west.");
    expect(text).toContain("High Street — a road running east to west, in the centre.");
    expect(text).toContain("Bus interchange — a medium block, in the south.");
  });

  it("describes the figures and never the reading of them", () => {
    // The overview is the band-7 skill being assessed; handing it over in the
    // alt text would make the task easier for screen-reader users, not fairer.
    const { text } = describeChart(multiLine);
    expect(text.toLowerCase()).not.toMatch(/\b(rose|fell|sharply|overall|the highest|dominant)\b/);
    expect(text).toContain("Fixed broadband");
    expect(text).toContain("2024: 89%");
  });

  it("expands into a visible panel on request", () => {
    const { container } = render(<ChartRenderer spec={groupedBar} />);
    const toggle = screen.getByRole("button", { name: /text description/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /hide text description/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const alt = container.querySelector(`#${CSS.escape(toggle.getAttribute("aria-controls") ?? "")}`);
    expect(alt?.className).not.toContain("sr-only");
    expect(within(alt as HTMLElement).getByText(/Childcare: 11.2 hours per week/)).toBeInTheDocument();
  });

  it("gives a table its reading too, even though it has no drawn form", () => {
    const { text } = describeChart(table);
    expect(text).toContain("4 columns and 5 data rows");
  });
});

describe("malformed and unknown specs", () => {
  it("explains an unknown kind instead of showing a blank box", () => {
    const { container } = render(
      <ChartRenderer spec={{ kind: "sankey", title: "Flows of migration" } as ChartSpecLike} />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/cannot draw/i);
    expect(screen.getByRole("status").textContent).toContain("sankey");
    expect(container.querySelector("svg[role='img']")).toBeNull();
    expect(container.textContent).toContain("Flows of migration");
  });

  it("tabulates an unknown kind that still carries figures", () => {
    const odd = { ...groupedBar, kind: "radar" } as ChartSpecLike;
    render(<ChartRenderer spec={odd} />);
    expect(screen.getByRole("status").textContent).toContain("radar");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(describeChart(odd).text).toContain("Childcare: 11.2 hours per week");
  });

  it("names the problem when a spec has no data at all", () => {
    for (const broken of [
      { kind: "bar", title: "No categories", series: [{ name: "A", values: [1, 2] }] },
      { kind: "line", title: "No series", x_axis: { categories: ["2020", "2021"] } },
      { kind: "pie", title: "No values", x_axis: { categories: ["A", "B"] } },
      { kind: "table", title: "No rows", rows: [] },
      { kind: "process", title: "No steps", steps: [] },
      { kind: "map", title: "No plans", snapshots: [] },
      { kind: "mixed", title: "No panels", panels: [] },
    ] as ChartSpecLike[]) {
      const { unmount } = render(<ChartRenderer spec={broken} />);
      const notice = screen.getByRole("status");
      expect(notice.textContent).toMatch(/could not be drawn/i);
      expect(notice.textContent?.length ?? 0).toBeGreaterThan(40);
      unmount();
    }
  });

  it("survives a spec that is not an object", () => {
    for (const junk of [null, undefined, "bar", 42, []]) {
      expect(inspectSpec(junk).status).toBe("unusable");
      expect(describeChart(junk as unknown as ChartSpecLike).text.length).toBeGreaterThan(10);
    }
  });

  it("draws what it can when one series of several is empty", () => {
    const holed: ChartSpecLike = {
      ...groupedBar,
      series: [groupedBar.series![0], { name: "Aged 40-59", values: [] }],
    };
    const { container } = render(<ChartRenderer spec={holed} />);
    expect(inspectSpec(holed).status).toBe("degraded");
    expect(screen.getByRole("status").textContent).toContain("carries no readable figures");
    expect(container.querySelector("svg[role='img']")).not.toBeNull();
  });

  it("falls back to the table past the five colours the palette can separate", () => {
    const tooMany: ChartSpecLike = {
      ...multiLine,
      series: [1, 2, 3, 4, 5, 6].map((n) => ({
        name: `Series ${n}`,
        values: [n, n * 2, n * 3, n * 4, n * 5, n * 6],
      })),
    };
    const { container } = render(<ChartRenderer spec={tooMany} />);
    expect(screen.getByRole("status").textContent).toMatch(/more than the 5/);
    expect(container.querySelector("svg[role='img']")).toBeNull();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("flags an arrow pointing at a stage that is not on the diagram", () => {
    const dangling: ChartSpecLike = {
      kind: "process",
      title: "Broken chain",
      steps: [
        { id: "a", label: "Start", next: ["ghost"] },
        { id: "b", label: "End", next: [] },
      ],
    };
    const report = inspectSpec(dangling);
    expect(report.status).toBe("degraded");
    expect(report.issues.join(" ")).toMatch(/not shown/);
  });
});

describe("chart summary (sidecar parity)", () => {
  it("emits one Visual block per panel of a combined task", () => {
    const lines = chartToSummary(mixed).split("\n");
    expect(lines[0]).toBe(
      "Combined visual: Household waste in Norland: composition and recycling rates",
    );
    expect(lines).toContain(
      "Visual 1: Pie chart: Composition of household waste, 2024 (units: % of household waste by weight)",
    );
    expect(lines.some((line) => line.startsWith("Visual 2: Line graph:"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Paper and card: 2004 28"))).toBe(true);
  });

  it("names the pie each set of segments belongs to", () => {
    const lines = chartToSummary(piePair).split("\n");
    expect(lines.some((line) => line.startsWith("Segments in 2004: Housing and fuel 24"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Segments in 2024: Housing and fuel 33"))).toBe(true);
  });

  it("keeps the single-pie wording unchanged", () => {
    expect(chartToSummary(singlePie)).toContain("Segments: Landfill 38, Recycled 29");
  });

  it("carries the notes caption", () => {
    expect(chartToSummary(stackedBar)).toContain("Note: Each region's four shares total 100%.");
  });
});

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Label,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineChartIcon, Table2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Select,
  SkeletonChart,
  Tabs,
} from "@/components/ui";
import { formatBand } from "@/lib/format";
import { BAND_DOMAIN, BAND_TICKS, useChartTheme, type SeriesKey } from "../chartTheme";
import { SKILL_KEYS, SKILL_LABELS, type TrajectoryDoc } from "../types";

type Selection = "all" | SeriesKey;

interface Props {
  trajectories: Partial<Record<SeriesKey, TrajectoryDoc>>;
  weeks: number;
  targetBand: number;
  loading: boolean;
  error?: string;
  onWeeksChange: (weeks: number) => void;
}

interface Row {
  week: string;
  label: string;
  listening?: number | null;
  reading?: number | null;
  writing?: number | null;
  speaking?: number | null;
  overall?: number | null;
  /**
   * `[low, high]` for the selected skill. Recharts renders a two-value Area as a
   * band; a stacked pair would drag the y-domain back down to zero and squash
   * the fixed 4–9 band axis.
   */
  range?: [number, number] | null;
}

const SERIES_ORDER: readonly SeriesKey[] = [...SKILL_KEYS, "overall"] as const;

const WEEK_OPTIONS = [
  { value: "8", label: "Last 8 weeks" },
  { value: "12", label: "Last 12 weeks" },
  { value: "26", label: "Last 26 weeks" },
  { value: "52", label: "Last 52 weeks" },
];

/** "2026-W30" → "Wk 30". */
function weekTick(week: string): string {
  const match = /W(\d{1,2})$/.exec(week);
  return match ? `Wk ${Number(match[1])}` : week;
}

function buildRows(
  trajectories: Partial<Record<SeriesKey, TrajectoryDoc>>,
  selection: Selection,
): Row[] {
  const weeks = new Set<string>();
  for (const key of SERIES_ORDER) {
    for (const point of trajectories[key]?.points ?? []) weeks.add(point.week);
  }
  const ordered = [...weeks].sort();

  return ordered.map((week) => {
    const row: Row = { week, label: weekTick(week) };
    for (const key of SERIES_ORDER) {
      const point = trajectories[key]?.points.find((p) => p.week === week);
      row[key] = point ? point.band : null;
    }
    if (selection !== "all") {
      const point = trajectories[selection]?.points.find((p) => p.week === week);
      // An insufficient week is a gap — never shade a range around a missing band.
      const usable =
        point && point.band !== null && point.range_low !== null && point.range_high !== null;
      row.range = usable
        ? [point.range_low as number, point.range_high as number]
        : null;
    }
    return row;
  });
}

interface EndLabelProps {
  index?: number;
  x?: number | string;
  y?: number | string;
  value?: number | string | null;
}

/**
 * Direct label on the final point of a line — "selective direct labels", and the
 * relief the light-mode aqua/yellow slots require.
 */
function renderEndLabel(
  props: EndLabelProps,
  options: { index: number; fill: string },
): JSX.Element {
  const index = typeof props.index === "number" ? props.index : -1;
  const value = typeof props.value === "number" ? props.value : null;
  if (index !== options.index || value === null) return <g />;
  return (
    <text
      x={Number(props.x ?? 0) + 8}
      y={Number(props.y ?? 0) + 4}
      fill={options.fill}
      fontSize={10}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {formatBand(value)}
    </text>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  surface,
  border,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | null; color?: string; dataKey?: string }[];
  label?: string;
  surface: string;
  border: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(
    (entry) =>
      entry.dataKey !== "range" &&
      entry.value !== null &&
      entry.value !== undefined,
  );
  if (!rows.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-[11px] shadow-xl"
      style={{ background: surface, borderColor: border }}
    >
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <ul className="space-y-0.5">
        {rows.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2 text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">{entry.name}</span>
            <span className="tabular text-foreground">{formatBand(entry.value ?? null)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Band trajectory (10 §7). One line per skill, the colour of a skill fixed
 * across every chart on the page; y-axis pinned 4–9 with 0.5-band gridlines and
 * the target band as a dashed reference line. Weeks with insufficient evidence
 * render as gaps, never interpolated. The data table below is not decoration —
 * two of the light-mode series sit under 3:1 on white, and the table plus the
 * final-point labels are the required relief.
 */
export function TrajectoryChart({
  trajectories,
  weeks,
  targetBand,
  loading,
  error,
  onWeeksChange,
}: Props) {
  const theme = useChartTheme();
  const [selection, setSelection] = useState<Selection>("all");
  const [showTable, setShowTable] = useState(false);

  const rows = useMemo(() => buildRows(trajectories, selection), [trajectories, selection]);
  const visible: SeriesKey[] = selection === "all" ? [...SERIES_ORDER] : [selection];
  const hasData = rows.some((row) => visible.some((key) => row[key] !== null));

  const lastValueIndex = useMemo(() => {
    const map = new Map<SeriesKey, number>();
    for (const key of visible) {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (rows[i][key] !== null && rows[i][key] !== undefined) {
          map.set(key, i);
          break;
        }
      }
    }
    return map;
  }, [rows, visible]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Band trajectory</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Estimated band — not a guarantee. Weeks without enough scored practice are left
            blank rather than joined up.
          </p>
        </div>
        <Select
          className="w-[10.5rem] shrink-0"
          aria-label="Trajectory time range"
          value={String(weeks)}
          options={WEEK_OPTIONS}
          onChange={(value) => onWeeksChange(Number(value))}
        />
      </CardHeader>

      <CardContent className="space-y-3">
        <Tabs
          aria-label="Trajectory series"
          value={selection}
          onChange={(value) => setSelection(value as Selection)}
          items={[
            { value: "all", label: "All skills" },
            ...SERIES_ORDER.map((key) => ({ value: key, label: SKILL_LABELS[key] })),
          ]}
        />

        {error ? (
          <EmptyState
            icon={LineChartIcon}
            title="The trajectory could not be loaded"
            description={error}
          />
        ) : loading && rows.length === 0 ? (
          <SkeletonChart aspect="aspect-[16/7]" />
        ) : !hasData ? (
          <EmptyState
            icon={LineChartIcon}
            title="No band history yet"
            description="Every scored attempt appends one estimate per skill. After your first week of practice this chart starts to show a direction."
          />
        ) : (
          <>
            {/* The target line is keyed here rather than labelled in the plot —
                an in-plot label collides with whichever series is near target. */}
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <svg width="22" height="6" aria-hidden="true" className="shrink-0">
                <line
                  x1="0"
                  y1="3"
                  x2="22"
                  y2="3"
                  stroke={theme.target}
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                />
              </svg>
              Target band {formatBand(targetBand)}
            </p>

            <div className="scrollbar-thin overflow-x-auto">
              <div className="h-[300px] min-w-[520px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows} margin={{ top: 12, right: 24, bottom: 28, left: 4 }}>
                    <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: theme.axisText, fontSize: 11 }}
                      stroke={theme.axis}
                      tickMargin={8}
                    >
                      <Label
                        value="Study week (ISO week number)"
                        position="insideBottom"
                        offset={-18}
                        style={{ fill: theme.axisText, fontSize: 11 }}
                      />
                    </XAxis>
                    <YAxis
                      domain={BAND_DOMAIN}
                      ticks={BAND_TICKS}
                      tickFormatter={(value: number) => value.toFixed(1)}
                      tick={{ fill: theme.axisText, fontSize: 11 }}
                      stroke={theme.axis}
                      width={44}
                    >
                      <Label
                        value="IELTS band"
                        angle={-90}
                        position="insideLeft"
                        style={{ fill: theme.axisText, fontSize: 11, textAnchor: "middle" }}
                      />
                    </YAxis>

                    {selection !== "all" && (
                      <Area
                        type="monotone"
                        dataKey="range"
                        stroke="none"
                        fill={theme.series[selection]}
                        fillOpacity={0.16}
                        isAnimationActive={false}
                        legendType="none"
                        name="Likely range"
                        connectNulls={false}
                      />
                    )}

                    <ReferenceLine
                      y={targetBand}
                      stroke={theme.target}
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      ifOverflow="extendDomain"
                    />

                    {visible.map((key) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={SKILL_LABELS[key]}
                        stroke={theme.series[key]}
                        strokeWidth={2}
                        dot={{ r: 3, strokeWidth: 0, fill: theme.series[key] }}
                        activeDot={{ r: 5, stroke: theme.surface, strokeWidth: 2 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      >
                        {/* Direct labels only when one series is on screen — with all
                            five, identical bands would print on top of each other.
                            The data table below carries the numbers in that mode. */}
                        {visible.length === 1 && (
                          <LabelList
                            dataKey={key}
                            content={(props: unknown) =>
                              renderEndLabel(props as EndLabelProps, {
                                index: lastValueIndex.get(key) ?? -1,
                                fill: theme.axisText,
                              })
                            }
                          />
                        )}
                      </Line>
                    ))}

                    <RechartsTooltip
                      cursor={{ stroke: theme.axis, strokeWidth: 1 }}
                      content={
                        <ChartTooltip surface={theme.surface} border={theme.tooltipBorder} />
                      }
                    />
                    {visible.length > 1 && (
                      <Legend
                        verticalAlign="top"
                        align="left"
                        height={28}
                        iconType="plainline"
                        wrapperStyle={{ fontSize: 11 }}
                        // Text wears ink, never the series colour — the swatch
                        // beside it is what carries identity.
                        formatter={(value: string) => (
                          <span style={{ color: theme.axisText }}>{value}</span>
                        )}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
              {showTable ? "Hide the numbers" : "Show the numbers"}
            </Button>

            {showTable && (
              <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[420px] text-left text-[13px]">
                  <caption className="sr-only">
                    Weekly IELTS band estimate per skill, oldest week first
                  </caption>
                  <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Week
                      </th>
                      {SERIES_ORDER.map((key) => (
                        <th key={key} scope="col" className="px-3 py-2 text-right font-medium">
                          {SKILL_LABELS[key]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.week} className="border-t border-border">
                        <th scope="row" className="px-3 py-1.5 font-normal text-muted-foreground">
                          {row.week}
                        </th>
                        {SERIES_ORDER.map((key) => (
                          <td key={key} className="px-3 py-1.5 text-right tabular">
                            {formatBand(row[key] ?? null)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

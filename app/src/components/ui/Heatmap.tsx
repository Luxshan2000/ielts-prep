import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

export interface HeatmapDay {
  /** ISO date, "YYYY-MM-DD". */
  date: string;
  minutes: number;
  /** Optional activity names for the tooltip, e.g. ["Speaking", "Vocab"]. */
  activities?: string[];
}

export interface HeatmapProps {
  weeks?: number;
  data: HeatmapDay[];
  className?: string;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 5-step sequential ramp of the primary hue; step 0 = the empty-cell surface. */
function level(minutes: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (minutes <= 0) return 0;
  if (minutes < 10) return 1;
  if (minutes < 20) return 2;
  if (minutes < 40) return 3;
  if (minutes < 60) return 4;
  return 5;
}

/**
 * Study-activity calendar (12 §6.7). Columns are weeks, rows Mon→Sun, 2px gaps
 * between cells; the tooltip carries date, minutes and activities.
 */
export function Heatmap({ weeks = 12, data, className }: HeatmapProps) {
  const [hover, setHover] = useState<HeatmapDay | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, HeatmapDay>();
    for (const d of data) map.set(d.date, d);
    return map;
  }, [data]);

  const columns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Roll back to the Monday of the current week, then back `weeks - 1` weeks.
    const offsetToMonday = (today.getDay() + 6) % 7;
    const start = new Date(today.getTime() - (offsetToMonday + (weeks - 1) * 7) * DAY_MS);

    return Array.from({ length: weeks }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
        const key = isoDay(date);
        return (
          byDate.get(key) ?? { date: key, minutes: date > today ? -1 : 0, activities: [] }
        );
      }),
    );
  }, [byDate, weeks]);

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <div className="flex gap-[2px]">
        <div className="mr-1 flex flex-col gap-[2px]">
          {WEEKDAYS.map((label, i) => (
            <span
              key={i}
              className="flex h-[13px] w-6 items-center text-[9px] leading-none text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
        {columns.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[2px]">
            {week.map((day) => {
              const future = day.minutes < 0;
              const lvl = future ? 0 : level(day.minutes);
              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={future}
                  onMouseEnter={() => setHover(future ? null : day)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(future ? null : day)}
                  onBlur={() => setHover(null)}
                  aria-label={`${formatDate(day.date)}: ${Math.max(day.minutes, 0)} minutes`}
                  className={cn(
                    "h-[13px] w-[13px] rounded-[3px] transition-transform",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    future ? "opacity-30" : "hover:scale-110",
                  )}
                  style={{ backgroundColor: `hsl(var(--heat-${lvl}))` }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
        <span className="min-h-[1rem]">
          {hover
            ? `${formatDate(hover.date)} — ${hover.minutes} min${
                hover.activities?.length ? ` · ${hover.activities.join(", ")}` : ""
              }`
            : `Last ${weeks} weeks`}
        </span>
        <span className="flex items-center gap-1">
          Less
          {[1, 2, 3, 4, 5].map((l) => (
            <span
              key={l}
              className="h-[10px] w-[10px] rounded-[2px]"
              style={{ backgroundColor: `hsl(var(--heat-${l}))` }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

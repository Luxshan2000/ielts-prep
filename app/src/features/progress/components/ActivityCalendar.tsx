import { CalendarDays } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Heatmap,
  Skeleton,
  type HeatmapDay,
} from "@/components/ui";
import type { HeatmapDoc } from "../types";

interface Props {
  heatmap: HeatmapDoc | null;
  loading: boolean;
  /** The thrown value, so the panel can name an offline service or a bad provider. */
  error?: unknown;
}

/**
 * Study-activity calendar (10 §7). The shared `Heatmap` primitive owns the grid
 * and the sequential ramp; this only maps the sidecar's cells onto it and spells
 * out what a cell means.
 */
export function ActivityCalendar({ heatmap, loading, error }: Props) {
  const days: HeatmapDay[] = (heatmap?.cells ?? [])
    .filter((cell) => !cell.future)
    .map((cell) => ({
      date: cell.date,
      minutes: cell.minutes,
      activities: cell.is_rest_day && cell.minutes === 0 ? ["rest day"] : undefined,
    }));

  const studied = days.filter((d) => d.minutes > 0).length;
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  // The sidecar returns a cell for every past day, so `days` is never empty on a
  // fresh install — it is 16 weeks of zeroes under "Days studied 0 · Total 0".
  // A grid that can only say "nothing, everywhere" is the blank panel rule 4 is
  // about, so it waits until there is one minute to draw.
  const nothingLogged = total === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity calendar</CardTitle>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {heatmap
            ? `Minutes studied per day over the last ${heatmap.weeks} weeks, against your ${heatmap.daily_goal_min}-minute daily goal. Rest days in your plan are never counted against you.`
            : "Minutes studied per day, against your daily goal."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <ErrorState
            error={error}
            title="The activity calendar could not be loaded"
            fallback="Your study minutes could not be read."
          />
        ) : loading && heatmap === null ? (
          <Skeleton className="h-[130px] w-full" />
        ) : nothingLogged ? (
          <EmptyState
            size="sm"
            icon={CalendarDays}
            title="No study minutes yet"
            description="Every minute you spend in a room is counted here, one square per day, darker as the day gets longer. Finish a block from today's session and the first square appears."
          />
        ) : (
          <>
            {/* The grid is wider than a narrow window: it scrolls inside its own box. */}
            <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1">
              <Heatmap weeks={heatmap?.weeks ?? 16} data={days} />
            </div>
            <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Days studied</dt>
                <dd className="tabular font-medium text-foreground">{studied}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total minutes</dt>
                <dd className="tabular font-medium text-foreground">{total}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Daily goal</dt>
                <dd className="tabular font-medium text-foreground">
                  {heatmap?.daily_goal_min ?? 60} min
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

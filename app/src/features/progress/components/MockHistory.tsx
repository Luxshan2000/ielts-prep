import { ClipboardList, Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import { formatBand, formatDate } from "@/lib/format";
import { useChartTheme } from "../chartTheme";
import { SKILL_KEYS, SKILL_LABELS, type MockSitting } from "../types";

interface Props {
  mocks: MockSitting[];
  loading: boolean;
  supported: boolean;
  /** The thrown value, so the panel can name an offline service or a bad provider. */
  error?: unknown;
}

/** Mean of the recorded skill bands, rounded the IELTS way (.25 and .75 round up). */
function sittingOverall(sitting: MockSitting): number | null {
  const bands = SKILL_KEYS.map((skill) => sitting.bands[skill]).filter(
    (band): band is number => typeof band === "number",
  );
  if (bands.length === 0) return null;
  const mean = bands.reduce((a, b) => a + b, 0) / bands.length;
  const doubled = mean * 2;
  const floor = Math.floor(doubled);
  const remainder = doubled - floor;
  return (remainder >= 0.5 ? floor + 1 : floor) / 2;
}

/**
 * Mock-test history (10 §10).
 *
 * The sidecar exposes no single mock-history route, so the table is stitched
 * from the per-module attempt lists and grouped by day. Reading has no attempt
 * list endpoint at all, which is stated in the footnote rather than papered over
 * with a permanently blank column.
 */
export function MockHistory({ mocks, loading, supported, error }: Props) {
  const theme = useChartTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mock test history</CardTitle>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Full mocks run in strict exam mode and carry double weight in your band estimates.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error || !supported ? (
          <ErrorState
            error={error}
            title="Your mock history could not be loaded"
            fallback="BandReady could not read your past sittings. Your results are still saved — this list is built from them, so nothing is lost."
          />
        ) : loading && mocks.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : mocks.length === 0 ? (
          <EmptyState
            size="sm"
            icon={ClipboardList}
            title="No mocks sat yet"
            description="Sitting two full mocks is one of the readiness checks. Your plan schedules them in the final two weeks, and you can start one earlier from the Listening, Reading, Writing or Speaking room."
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <caption className="sr-only">
                Completed mock sittings with the band recorded for each skill
              </caption>
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Sitting date
                  </th>
                  {SKILL_KEYS.map((skill) => (
                    <th key={skill} scope="col" className="px-3 py-2 text-right font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: theme.series[skill] }}
                          aria-hidden="true"
                        />
                        {SKILL_LABELS[skill]}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Overall
                  </th>
                </tr>
              </thead>
              <tbody>
                {mocks.map((sitting) => (
                  <tr key={sitting.date} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 font-normal text-foreground">
                      {formatDate(sitting.date)}
                    </th>
                    {SKILL_KEYS.map((skill) => (
                      <td key={skill} className="px-3 py-2 text-right tabular">
                        <span className={sitting.bands[skill] === undefined ? "text-muted-foreground" : ""}>
                          {formatBand(sitting.bands[skill] ?? null)}
                        </span>
                        {sitting.detail[skill] && (
                          <span className="block text-[11px] text-muted-foreground">
                            {sitting.detail[skill]}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular font-medium">
                      {formatBand(sittingOverall(sitting))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Only alongside the table it explains. Before the first sitting it
            described columns that are not on screen. */}
        {mocks.length > 0 && !error && supported && (
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Built from your Listening, Writing and Speaking results. Reading mocks are not
            listed here yet, so the overall column averages only the skills shown — it is not
            a full four-skill band.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

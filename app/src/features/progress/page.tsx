import { useEffect } from "react";
import { AlertCircle, HelpCircle, PlugZap, RefreshCw } from "lucide-react";
import {
  Badge,
  BandScore,
  Button,
  Card,
  CardContent,
  EmptyState,
  SkeletonCard,
  Tooltip,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { formatBand } from "@/lib/format";
import { useChartTheme } from "./chartTheme";
import { useProgressFeatureStore } from "./store";
import { ActivityCalendar } from "./components/ActivityCalendar";
import { CriteriaPanel } from "./components/CriteriaPanel";
import { MockHistory } from "./components/MockHistory";
import { ReadinessChecklist } from "./components/ReadinessChecklist";
import { TrajectoryChart } from "./components/TrajectoryChart";
import { SKILL_KEYS, SKILL_LABELS, type SkillEstimate, type SkillKey } from "./types";

function SkillTile({
  skill,
  estimate,
  color,
  stale,
}: {
  skill: SkillKey;
  estimate: SkillEstimate | undefined;
  color: string;
  stale: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <span
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{SKILL_LABELS[skill]}</p>
        <p className="text-[11px] tabular text-muted-foreground">
          {estimate && estimate.band !== null
            ? `likely ${formatBand(estimate.range_low)}–${formatBand(estimate.range_high)}`
            : "not enough scored practice yet"}
        </p>
        {estimate?.method === "self_assessed" && (
          <p className="text-[11px] text-muted-foreground">Self-rated starting point</p>
        )}
        {stale && <p className="text-[11px] text-warning">Estimate is getting stale</p>}
      </div>
      {estimate?.band !== null && estimate !== undefined ? (
        <BandScore band={estimate.band as number} size="sm" />
      ) : (
        <span className="shrink-0 text-sm font-semibold tabular text-muted-foreground">—</span>
      )}
    </div>
  );
}

/**
 * The progress screen (10 §7 + §10). Charts follow the dataviz conventions: one
 * colour per skill everywhere, a band axis pinned 4–9 with 0.5-band gridlines,
 * spelled-out axis labels and legends, and every wide element scrolling inside
 * its own container so the page itself never scrolls sideways.
 */
export function ProgressPage() {
  const theme = useChartTheme();
  const {
    summary,
    trajectories,
    criteria,
    heatmap,
    readiness,
    mocks,
    mocksSupported,
    initialized,
    loading,
    weeks,
    errors,
    recomputing,
    savingItem,
    load,
    loadCriteria,
    setWeeks,
    recompute,
    setReadinessItem,
  } = useProgressFeatureStore();

  useEffect(() => {
    if (!initialized) void load();
  }, [initialized, load]);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card after it comes back (12 §9).
  useSidecarRecovery(() => void load());

  const overall = summary?.estimates.overall;
  const targetBand = summary?.profile.target_band ?? 6.5;
  const stale = new Set(summary?.stale_skills ?? []);
  const offline = errors.summary?.includes("sidecar isn't responding") ?? false;

  return (
    <PageShell
      title="Progress"
      description="Where your bands stand, what is moving, and what is left before exam day."
      actions={
        <Button
          variant="outline"
          size="sm"
          loading={recomputing}
          onClick={() => void recompute()}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Recompute estimates
        </Button>
      }
    >
      {!initialized ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard lines={4} className="lg:col-span-2" />
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      ) : summary === null ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={offline ? PlugZap : AlertCircle}
              title={
                offline
                  ? "The BandReady sidecar isn't responding"
                  : "Progress could not be loaded"
              }
              description={
                errors.summary ??
                "Your estimates live in the local sidecar process. Nothing is lost — it just needs to come back."
              }
              action={
                <Button onClick={() => void load()} loading={loading}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Try again
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
              <div className="flex items-center gap-4">
                {overall?.band !== null && overall !== undefined ? (
                  <BandScore band={overall.band} size="md" label="Overall" />
                ) : (
                  <span className="flex h-12 min-w-[3rem] items-center justify-center rounded-xl bg-muted px-3 text-[24px] font-semibold leading-none tabular text-muted-foreground">
                    —
                  </span>
                )}
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium tabular text-foreground">
                    {overall?.display ?? "No overall estimate yet"}
                    <Tooltip content={summary.tooltip} side="bottom">
                      <HelpCircle
                        className="h-3.5 w-3.5 text-muted-foreground"
                        tabIndex={0}
                        role="img"
                        aria-label={summary.tooltip}
                      />
                    </Tooltip>
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {summary.disclaimer}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="outline">Target {formatBand(summary.profile.target_band)}</Badge>
                {summary.profile.exam_in_days !== null && (
                  <Badge tone="outline">
                    Exam in {summary.profile.exam_in_days} days
                  </Badge>
                )}
                <Badge tone="outline">
                  {summary.profile.exam_format === "general_training"
                    ? "General Training"
                    : "Academic"}
                </Badge>
              </div>
            </CardContent>
            <CardContent className="grid gap-2 pt-0 sm:grid-cols-2 lg:grid-cols-4">
              {SKILL_KEYS.map((skill) => (
                <SkillTile
                  key={skill}
                  skill={skill}
                  estimate={summary.estimates[skill]}
                  color={theme.series[skill]}
                  stale={stale.has(skill)}
                />
              ))}
            </CardContent>
          </Card>

          <TrajectoryChart
            trajectories={trajectories}
            weeks={weeks}
            targetBand={targetBand}
            loading={loading}
            error={errors.trajectory}
            onWeeksChange={(next) => void setWeeks(next)}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <CriteriaPanel
              criteria={criteria}
              loading={loading}
              error={errors.criteria}
              onSelect={(skill) => void loadCriteria(skill)}
            />
            <ActivityCalendar heatmap={heatmap} loading={loading} error={errors.heatmap} />
          </div>

          <MockHistory
            mocks={mocks}
            loading={loading}
            supported={mocksSupported}
            error={errors.mocks}
          />

          <ReadinessChecklist
            readiness={readiness}
            targetBand={summary.profile.target_band}
            loading={loading}
            savingItem={savingItem}
            error={errors.readiness}
            onToggle={(id, checked) => void setReadinessItem(id, checked)}
          />
        </div>
      )}
    </PageShell>
  );
}

export default ProgressPage;

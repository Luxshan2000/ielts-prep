import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Compass, HelpCircle, RefreshCw } from "lucide-react";
import {
  Badge,
  BandScore,
  Button,
  Card,
  CardContent,
  ErrorState,
  SkeletonCard,
  Tooltip,
  classifyError,
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
import {
  SKILL_KEYS,
  SKILL_LABELS,
  type SkillEstimate,
  type SkillKey,
  type SummaryDoc,
} from "./types";

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
 * What fills this screen, when none of it is filled yet.
 *
 * Before the first scored attempt every panel below is an empty state, and the
 * audit's finding was that none of them offered a way out — a learner could land
 * here on day one and have nothing to press. This is that way out, and it names
 * the three different things the three groups of panels are waiting for.
 */
function GettingStarted({
  hasPlan,
  hasExamDate,
  onGo,
}: {
  hasPlan: boolean;
  hasExamDate: boolean;
  onGo: (path: string) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Compass className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Nothing has been scored yet
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              This screen is a record of work you have done, so it stays empty until there is
              some. Three things fill it:
            </p>
          </div>
        </div>

        <ol className="space-y-2 text-[13px]">
          <li className="flex gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <span className="tabular font-medium text-muted-foreground">1</span>
            <span className="min-w-0 flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">One scored attempt</span> in any
              skill — an essay, a speaking part, a reading passage, a listening section. That
              draws your first band estimate, and the trajectory and criterion breakdown
              follow it.
            </span>
          </li>
          <li className="flex gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <span className="tabular font-medium text-muted-foreground">2</span>
            <span className="min-w-0 flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">Practice minutes</span> from any
              room. They fill the activity calendar below, whether or not the work was scored.
            </span>
          </li>
          <li className="flex gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <span className="tabular font-medium text-muted-foreground">3</span>
            <span className="min-w-0 flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">Your test date</span>, which
              unlocks the exam-readiness checklist and paces the last two weeks as a taper.
            </span>
          </li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onGo("/onboarding")}>
            Take the placement test
          </Button>
          <Button variant="outline" onClick={() => onGo("/")}>
            {hasPlan ? "Go to today's session" : "Set up my plan"}
          </Button>
          {!hasExamDate && (
            <Button variant="ghost" onClick={() => onGo("/onboarding")}>
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Add my test date
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          The placement test takes about 30 minutes and covers all four skills; every section
          can be skipped on its own.
        </p>
      </CardContent>
    </Card>
  );
}

/** How many scored attempts stand behind the four skill estimates. */
function scoredAttempts(summary: SummaryDoc | null): number {
  if (!summary) return 0;
  return SKILL_KEYS.reduce((n, skill) => n + (summary.estimates[skill]?.attempts_used ?? 0), 0);
}

/**
 * The progress screen (10 §7 + §10). Charts follow the dataviz conventions: one
 * colour per skill everywhere, a band axis pinned 4–9 with 0.5-band gridlines,
 * spelled-out axis labels and legends, and every wide element scrolling inside
 * its own container so the page itself never scrolls sideways.
 */
export function ProgressPage() {
  const navigate = useNavigate();
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
  const overallBand = overall?.band ?? null;
  const targetBand = summary?.profile.target_band ?? 6.5;
  const stale = new Set(summary?.stale_skills ?? []);
  const attempts = scoredAttempts(summary);

  return (
    <PageShell
      title="Progress"
      description="Where your bands stand, what is moving, and what is left before exam day."
      onRefresh={() => void load()}
      refreshing={loading}
      refreshLabel="Reload your progress"
      actions={
        // Re-marking old attempts is only meaningful once some exist; before that
        // it is a button whose whole effect is to leave the screen unchanged.
        attempts > 0 ? (
          <Button
            variant="outline"
            size="sm"
            loading={recomputing}
            onClick={() => void recompute()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Update my estimates
          </Button>
        ) : undefined
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
            <ErrorState
              error={errors.summary}
              // The offline heading is the shared one; anything else is ours.
              title={
                classifyError(errors.summary) === "offline"
                  ? undefined
                  : "Your progress could not be loaded"
              }
              fallback="Your band estimates could not be read."
              onRetry={() => void load()}
              retrying={loading}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
              <div className="flex items-center gap-4">
                {overallBand !== null ? (
                  <BandScore band={overallBand} size="md" label="Overall" />
                ) : (
                  <span className="flex h-12 min-w-[3rem] items-center justify-center rounded-xl bg-muted px-3 text-[24px] font-semibold leading-none tabular text-muted-foreground">
                    —
                  </span>
                )}
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium tabular text-foreground">
                    {overallBand !== null ? overall?.display : "No overall band yet"}
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
                    {overallBand !== null
                      ? summary.disclaimer
                      : "An overall band needs an estimate in all four skills. One scored attempt per skill is enough to start."}
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

          {attempts === 0 && (
            <GettingStarted
              hasPlan={summary.plan_id !== null}
              hasExamDate={summary.profile.exam_date !== null}
              onGo={(path) => navigate(path)}
            />
          )}

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
            onAddExamDate={() => navigate("/onboarding")}
          />
        </div>
      )}
    </PageShell>
  );
}

export default ProgressPage;

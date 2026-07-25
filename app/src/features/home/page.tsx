import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, PlugZap, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  SkeletonCard,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { greeting } from "@/lib/format";
import { needsOnboarding } from "./firstRun";
import { todaysSession, useHomeStore } from "./store";
import { EstimateTiles } from "./components/EstimateTiles";
import { FocusCard } from "./components/FocusCard";
import { ExamCountdownCard, StreakCard, VocabCard } from "./components/SideTiles";
import { TodaySessionCard } from "./components/TodaySessionCard";

function LoadingDashboard() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SkeletonCard lines={4} className="lg:col-span-2" />
      <SkeletonCard lines={5} />
      <SkeletonCard lines={3} className="lg:col-span-2" />
      <SkeletonCard lines={3} />
    </div>
  );
}

/**
 * The dashboard (10 §5/§7 + 12 §6.1). Entry route of the app, so it also owns
 * the first-run redirect into `/onboarding` — `App.tsx` is auto-discovery
 * territory and never hand-edited.
 */
export function HomePage() {
  const navigate = useNavigate();
  const {
    summary,
    plan,
    loading,
    initialized,
    error,
    dismissing,
    generating,
    actionError,
    busySession,
    load,
    generatePlan,
    dismissCallout,
    startSession,
    completeSession,
    skipSession,
    clearActionError,
  } = useHomeStore();

  useEffect(() => {
    if (!initialized) void load();
  }, [initialized, load]);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card after it comes back (12 §9).
  useSidecarRecovery(() => void load());

  if (initialized && needsOnboarding(summary)) {
    return <Navigate to="/onboarding" replace />;
  }

  const session = todaysSession(summary, plan);
  const busy = busySession !== null;

  return (
    <PageShell
      title={greeting()}
      description="Your plan for today, and where your bands stand."
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/progress")}>
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            Progress
          </Button>
        </>
      }
    >
      {actionError && (
        <Card className="mb-4 border-destructive/40 bg-destructive/[0.06]">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[13px] text-foreground">{actionError}</p>
            <Button variant="ghost" size="sm" onClick={clearActionError}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {!initialized || (loading && summary === null && error === null) ? (
        <LoadingDashboard />
      ) : error !== null ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={error.offline ? PlugZap : AlertCircle}
              title={
                error.offline
                  ? "The BandReady sidecar isn't responding"
                  : "Your dashboard could not be loaded"
              }
              description={
                error.offline
                  ? "Your plan and progress live in the local sidecar process. Nothing is lost — it just needs to come back."
                  : error.detail
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
      ) : summary === null ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Sparkles}
              title="Let's set up your preparation"
              description="Tell BandReady your target band, exam date and weekly time budget and it will build a day-by-day plan."
              action={<Button onClick={() => navigate("/onboarding")}>Start setup</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {summary.needs_placement && (
            <Card className="border-primary/40 bg-primary/[0.05]">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">
                    Your band estimates are self-rated so far.
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    A ~30-minute placement test — or three scored attempts per skill — firms
                    them up and sharpens the plan.
                  </p>
                </div>
                <Button size="sm" onClick={() => navigate("/onboarding")}>
                  Take the placement test
                </Button>
              </CardContent>
            </Card>
          )}

          {summary.milestones_earned.length > 0 && (
            <Card className="border-success/40 bg-success/[0.06]">
              <CardContent className="flex flex-wrap items-center gap-2 p-4 text-[13px]">
                <span className="font-medium text-foreground">Milestone reached:</span>
                {summary.milestones_earned.map((id) => (
                  <Badge key={id} tone="success">
                    {id.replace(/-/g, " ")}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <TodaySessionCard
                session={session}
                planId={summary.plan_id}
                hint={plan?.hint}
                busy={busy}
                generating={generating}
                onGenerate={() => void generatePlan()}
                onStart={(id) => void startSession(id)}
                onComplete={(id) => void completeSession(id)}
                onSkip={(id) => void skipSession(id)}
              />
              <FocusCard
                callouts={summary.callouts}
                weakest={summary.weakest_criteria}
                dismissed={dismissing}
                onDismiss={(id) => void dismissCallout(id)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <VocabCard vocab={summary.vocab} />
                <ExamCountdownCard profile={summary.profile} />
              </div>
            </div>

            <div className="space-y-4">
              <EstimateTiles summary={summary} />
              <StreakCard streak={summary.streak} />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default HomePage;

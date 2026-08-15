import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  SkeletonCard,
  classifyError,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { greeting } from "@/lib/format";
import { milestoneLabel } from "./blocks";
import { needsOnboarding } from "./firstRun";
import { todaysSession, useHomeStore } from "./store";
import { EstimateTiles } from "./components/EstimateTiles";
import { FocusCard } from "./components/FocusCard";
import { ExamCountdownCard, StreakCard, VocabCard } from "./components/SideTiles";
import { TodaySessionCard } from "./components/TodaySessionCard";

function LoadingDashboard() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <SkeletonCard lines={4} className="xl:col-span-2" />
      <SkeletonCard lines={5} />
      <SkeletonCard lines={3} className="xl:col-span-2" />
      <SkeletonCard lines={3} />
    </div>
  );
}

/**
 * The dashboard (10 §5/§7 + 12 §6.1). Entry route of the app, so it also owns
 * the first-run redirect into `/onboarding` — `App.tsx` is auto-discovery
 * territory and never hand-edited.
 *
 * The three-column split waits for `xl`. At exactly 1024 (`lg`) minus the
 * sidebar there are ~250 px per column, which turned "Estimated band — not a
 * guarantee" into three lines beside a single dash.
 */
export function HomePage() {
  const navigate = useNavigate();
  const {
    summary,
    plan,
    vocabDue,
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
  const hasPlan = summary !== null && summary.plan_id !== null;

  return (
    <PageShell
      title={greeting()}
      description="Your plan for today, and where your bands stand."
      onRefresh={() => void load()}
      refreshing={loading}
      refreshLabel="Reload your dashboard"
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
            <ErrorState
              error={error}
              // The offline heading is the shared one; anything else is ours.
              title={
                classifyError(error) === "offline"
                  ? undefined
                  : "Your dashboard could not be loaded"
              }
              fallback="Your plan and your band estimates could not be read."
              onRetry={() => void load()}
              retrying={loading}
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
          {/* Only once a plan exists. Before that "Set up my plan" below is the
              one thing to do, and two setup prompts read as two chores. */}
          {summary.needs_placement && hasPlan && (
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
                    {milestoneLabel(id)}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <TodaySessionCard
                session={session}
                planId={summary.plan_id}
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
                <VocabCard vocab={summary.vocab} due={vocabDue} />
                <ExamCountdownCard profile={summary.profile} hasPlan={hasPlan} />
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

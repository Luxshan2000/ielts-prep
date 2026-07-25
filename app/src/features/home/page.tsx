import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Flame, ListChecks, PlugZap } from "lucide-react";
import {
  BandScore,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { bandsOf, useProgressStore, useSessionStore } from "@/stores";
import { daysUntil, formatBand, greeting, pluralize } from "@/lib/format";

const SKILLS = [
  ["speaking", "Speaking"],
  ["writing", "Writing"],
  ["reading", "Reading"],
  ["listening", "Listening"],
] as const;

/**
 * Placeholder dashboard (12 §6.1). The curriculum agent replaces this with the
 * real plan-driven Home; until then it renders live data when the sidecar has
 * it and honest empty states when it doesn't.
 */
export function HomePage() {
  const navigate = useNavigate();
  const offlineSidecar = useSessionStore((s) => s.offline);
  const { summary, plan, loading, offline, refresh, loadedAt } = useProgressStore();

  useEffect(() => {
    let active = true;
    if (!loadedAt && active) void refresh();
    return () => {
      active = false;
    };
  }, [loadedAt, refresh]);

  const bands = bandsOf(summary);
  const streak = summary?.streak_days ?? 0;
  const examDate = summary?.exam_date ?? null;
  const targetBand = summary?.target_band ?? null;
  const todaysPlan = plan?.today ?? [];
  const isOffline = offline || offlineSidecar;

  return (
    <PageShell
      title={`${greeting()}`}
      description="Your practice dashboard."
      actions={
        streak > 0 ? (
          <Badge tone="warning" className="gap-1.5 px-2.5 py-1 text-[13px]">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {pluralize(streak, "day")} streak
          </Badge>
        ) : null
      }
    >
      {isOffline && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <CardContent className="flex items-center gap-3 p-4">
            <PlugZap className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="font-medium text-foreground">The BandReady sidecar isn&apos;t responding.</p>
              <p className="text-muted-foreground">
                Your progress and plan can&apos;t load until it comes back.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && !summary ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard lines={3} className="lg:col-span-2" />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Today&apos;s plan</CardTitle>
            </CardHeader>
            <CardContent>
              {todaysPlan.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No study plan yet"
                  description="Take the placement test and BandReady will build a plan around your target band and exam date."
                  action={<Button onClick={() => navigate("/progress")}>Set up my plan</Button>}
                />
              ) : (
                <ul className="divide-y divide-border">
                  {todaysPlan.map((session) => (
                    <li key={session.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                      <span className="min-w-0 flex-1 truncate text-sm">{session.title}</span>
                      {session.minutes !== undefined && (
                        <span className="text-[11px] text-muted-foreground">
                          {session.minutes} min
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!session.route}
                        onClick={() => session.route && navigate(session.route)}
                      >
                        Start
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Band estimate</CardTitle>
            </CardHeader>
            <CardContent>
              {bands.overall === null ? (
                <p className="text-[13px] text-muted-foreground">
                  Complete your first scored practice to see a band estimate.
                </p>
              ) : (
                <div className="flex items-center gap-6">
                  <BandScore band={bands.overall} size="md" label="Overall" />
                  <div className="grid flex-1 grid-cols-2 gap-2">
                    {SKILLS.map(([key, label]) =>
                      bands[key] === null ? (
                        <span key={key} className="text-[13px] text-muted-foreground">
                          {label} —
                        </span>
                      ) : (
                        <BandScore
                          key={key}
                          band={bands[key] as number}
                          size="sm"
                          label={label}
                          className="justify-self-start"
                        />
                      ),
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exam countdown</CardTitle>
            </CardHeader>
            <CardContent>
              {examDate ? (
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold tabular">
                      {pluralize(Math.max(daysUntil(examDate), 0), "day")} to your test
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      Target band {formatBand(targetBand)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  No exam date set. Add one in Settings and BandReady will pace your plan to it.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

export default HomePage;

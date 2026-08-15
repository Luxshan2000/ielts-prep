import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Flame } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Skeleton,
} from "@/components/ui";
import { useSettingsStore } from "@/stores";
import { cn } from "@/lib/cn";
import { MATURITY_META, MODULE_LABELS, percent, shortDate } from "../labels";
import { useVocabStore } from "../store";
import type { SrsStats } from "../types";

/** §8 dashboard: how the bank is doing, plus the two daily limits that shape it. */
export function StatsPanel() {
  const stats = useVocabStore((s) => s.stats);
  const loading = useVocabStore((s) => s.statsLoading);
  const error = useVocabStore((s) => s.statsError);
  const load = useVocabStore((s) => s.loadStats);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !stats) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Statistics could not be loaded"
        description={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="30-day retention"
          value={percent(stats.retention_30d)}
          hint={
            stats.retention_30d === null
              ? "needs a few reviews of mature cards"
              : `target ${percent(stats.limits.desired_retention)}`
          }
        />
        <Metric
          label="Streak"
          value={String(stats.streak)}
          hint={stats.streak === 1 ? "day in a row" : "days in a row"}
          icon={<Flame className="h-3.5 w-3.5 text-warning" aria-hidden="true" />}
        />
        <Metric
          label="Reviews today"
          value={String(stats.reviews_today)}
          hint={`${stats.reviews_total} all time`}
        />
        <Metric
          label="Words in bank"
          value={String(stats.counts.entries)}
          hint={`${stats.counts.scheduled} scheduled`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MaturityCard stats={stats} />
        <ForecastCard stats={stats} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SourcesCard stats={stats} />
        <LimitsCard stats={stats} />
      </div>
    </div>
  );
}

function MaturityCard({ stats }: { stats: SrsStats }) {
  const rows = [
    { label: "New", value: stats.counts.new, className: "bg-muted-foreground/40" },
    { label: "Learning", value: stats.counts.learning, className: "bg-warning" },
    { label: MATURITY_META.young.label, value: stats.counts.young, className: "bg-primary/70" },
    { label: MATURITY_META.mature.label, value: stats.counts.mature, className: "bg-success" },
    { label: "Suspended", value: stats.counts.suspended, className: "bg-border" },
    { label: "Known", value: stats.counts.known, className: "bg-primary/30" },
  ];
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where your words are</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nothing in the bank yet — accept a suggestion or add a deck.
          </p>
        ) : (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {rows
                .filter((row) => row.value > 0)
                .map((row) => (
                  <div
                    key={row.label}
                    className={cn("h-full", row.className)}
                    style={{ width: `${(100 * row.value) / total}%` }}
                  />
                ))}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", row.className)} aria-hidden="true" />
                    {row.label}
                  </dt>
                  <dd className="tabular font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ForecastCard({ stats }: { stats: SrsStats }) {
  const max = Math.max(1, ...stats.forecast.map((point) => point.count));
  const empty = stats.forecast.every((point) => point.count === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coming up — next 14 days</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {empty ? (
          <p className="text-[13px] text-muted-foreground">
            Nothing is scheduled in the next two weeks.
          </p>
        ) : (
          <>
            <div className="flex h-32 items-end gap-1" role="img" aria-label="Reviews due per day for the next 14 days">
              {stats.forecast.map((point) => (
                <div key={point.date} className="group/bar relative flex flex-1 flex-col items-center gap-1">
                  <span className="tabular text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/bar:opacity-100">
                    {point.count}
                  </span>
                  <div
                    className="w-full rounded-t bg-primary/70 transition-colors group-hover/bar:bg-primary"
                    style={{ height: `${Math.max(2, (100 * point.count) / max)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{shortDate(stats.forecast[0]?.date)}</span>
              <span>{shortDate(stats.forecast[stats.forecast.length - 1]?.date)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SourcesCard({ stats }: { stats: SrsStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where your words came from</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {stats.sources.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No words have been collected yet.</p>
        ) : (
          stats.sources.map((source) => (
            <div key={source.module} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span>{MODULE_LABELS[source.module] ?? source.module}</span>
                <span className="tabular text-muted-foreground">
                  {source.entries} · {source.pct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${source.pct}%` }} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** The two daily limits live in the settings document (`study.srs_*`). */
function LimitsCard({ stats }: { stats: SrsStats }) {
  const doc = useSettingsStore((s) => s.doc);
  const loadSettings = useSettingsStore((s) => s.load);
  const saveSettings = useSettingsStore((s) => s.save);
  const saving = useSettingsStore((s) => s.saving);
  const reloadStats = useVocabStore((s) => s.loadStats);

  const [newPerDay, setNewPerDay] = useState(String(stats.limits.new_per_day));
  const [reviewCap, setReviewCap] = useState(String(stats.limits.review_cap));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) void loadSettings();
  }, [doc, loadSettings]);

  useEffect(() => {
    setNewPerDay(String(stats.limits.new_per_day));
    setReviewCap(String(stats.limits.review_cap));
  }, [stats.limits.new_per_day, stats.limits.review_cap]);

  const parsed = useMemo(
    () => ({
      newPerDay: Math.max(0, Math.min(100, Number.parseInt(newPerDay || "0", 10) || 0)),
      reviewCap: Math.max(0, Math.min(1000, Number.parseInt(reviewCap || "0", 10) || 0)),
    }),
    [newPerDay, reviewCap],
  );

  const dirty =
    parsed.newPerDay !== stats.limits.new_per_day || parsed.reviewCap !== stats.limits.review_cap;

  const save = async () => {
    setError(null);
    setSaved(false);
    const ok = await saveSettings({
      study: {
        srs_new_per_day: parsed.newPerDay,
        srs_max_reviews_per_day: parsed.reviewCap,
      },
    });
    if (!ok) {
      setError("Those limits could not be saved.");
      return;
    }
    setSaved(true);
    await reloadStats();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily limits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          New cards are introduced a few at a time so the queue never snowballs. Both limits reset
          at 4 AM local time.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New cards per day" hint="0 pauses new words entirely.">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                value={newPerDay}
                onChange={(e) => setNewPerDay(e.target.value)}
                className="tabular"
              />
            )}
          </Field>
          <Field label="Review cap per day" hint="0 means no cap.">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={1000}
                value={reviewCap}
                onChange={(e) => setReviewCap(e.target.value)}
                className="tabular"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => void save()} disabled={!dirty} loading={saving}>
            Save limits
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {stats.new_available} new card{stats.new_available === 1 ? "" : "s"} are available today.
          </span>
        </div>

        {saved && !dirty && (
          <p className="flex items-center gap-2 text-[13px] text-success">
            <Check className="h-4 w-4" aria-hidden="true" />
            Saved — it applies to your next session.
          </p>
        )}
        {error && (
          <p className="flex items-start gap-2 text-[13px] text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </p>
        <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

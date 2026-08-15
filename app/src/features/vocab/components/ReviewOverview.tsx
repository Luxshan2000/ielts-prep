import { useNavigate } from "react-router-dom";
import { AlertCircle, Flame, Inbox, Layers, Play } from "lucide-react";
import { Badge, Button, Card, CardContent, EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { MATURITY_META, percent } from "../labels";
import { useVocabStore } from "../store";
import type { SrsStats } from "../types";

export interface ReviewOverviewProps {
  onOpenTab: (tab: "inbox" | "browse" | "decks" | "stats") => void;
}

/** The Review tab: what is due, and the one button that starts the session. */
export function ReviewOverview({ onOpenTab }: ReviewOverviewProps) {
  const navigate = useNavigate();
  const stats = useVocabStore((s) => s.stats);
  const loading = useVocabStore((s) => s.statsLoading);
  const error = useVocabStore((s) => s.statsError);
  const loadStats = useVocabStore((s) => s.loadStats);
  const startSession = useVocabStore((s) => s.startSession);
  const sessionLoading = useVocabStore((s) => s.session.loading);

  const start = async () => {
    await startSession();
    navigate("/vocab/review");
  };

  if (loading && !stats) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Your vocabulary bank could not be read"
        description={error}
        action={<Button onClick={() => void loadStats()}>Try again</Button>}
      />
    );
  }

  if (!stats) return null;

  const due = stats.due_today;
  const hasEntries = stats.counts.entries > 0;

  /**
   * A bank with nothing in it has nothing to count, and six tiles of zero beside a
   * disabled button is the worst first screen this module can show. So the empty
   * state says what fills it and offers the two ways in.
   */
  if (!hasEntries) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-6">
            <h2 className="text-base font-semibold">Your word bank is empty — that is the normal start</h2>
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              Nothing is added for you. Words arrive in one of three ways: you opt into a study deck
              and take its words in a batch, you accept a word the other modules noticed you
              struggling with, or you type one in yourself. Once a word is in, it comes back on a
              schedule that stretches every time you get it right.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => onOpenTab("decks")}>
                <Layers className="h-4 w-4" />
                Choose a study deck
              </Button>
              <Button variant="outline" onClick={() => onOpenTab("browse")}>
                Add a word myself
              </Button>
              {stats.counts.suggested > 0 && (
                <Button variant="outline" onClick={() => onOpenTab("inbox")}>
                  <Inbox className="h-4 w-4" />
                  {stats.counts.suggested} waiting in your inbox
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Due today
            </p>
            <p className="tabular text-5xl font-semibold leading-none">{due}</p>
            <p className="text-[13px] text-muted-foreground">
              {due === 0
                ? hasEntries
                  ? "Nothing is scheduled for now — come back later or add new words."
                  : "Your bank is empty. Accept a suggestion or opt into a study deck to begin."
                : `${pluralize(stats.new_available, "new card")} mixed in, ${stats.due_now} overdue.`}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button size="lg" onClick={() => void start()} loading={sessionLoading} disabled={due === 0}>
              <Play className="h-4 w-4" />
              {due === 0 ? "Nothing to review" : `Review ${Math.min(due, 20)} cards`}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Space shows the answer · 1–4 rate · Esc leaves
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="New" value={stats.counts.new} hint={`${stats.limits.new_per_day}/day cap`} />
        <Tile label="Learning" value={stats.counts.learning} />
        <Tile
          label={MATURITY_META.young.label}
          value={stats.counts.young}
          hint="back within 3 weeks"
        />
        <Tile
          label={MATURITY_META.mature.label}
          value={stats.counts.mature}
          hint="back less often than that"
        />
        <Tile
          label="Retention"
          value={percent(stats.retention_30d)}
          hint={stats.retention_30d === null ? "no data yet" : "last 30 days"}
        />
        <Tile
          label="Streak"
          value={stats.streak}
          hint={`${stats.reviews_today} reviewed today`}
          icon={<Flame className="h-3.5 w-3.5 text-warning" aria-hidden="true" />}
        />
      </div>

      <IngestExplainer stats={stats} onOpenTab={onOpenTab} />
    </div>
  );
}

function IngestExplainer({
  stats,
  onOpenTab,
}: {
  stats: SrsStats;
  onOpenTab: ReviewOverviewProps["onOpenTab"];
}) {
  const suggested = stats.counts.suggested;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Inbox className="h-4 w-4 text-primary" aria-hidden="true" />
            Words never enter your review queue on their own
          </p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Speaking, Writing, Reading and Listening only <em>suggest</em> words. You decide what
            gets scheduled — from your inbox, from a study deck, or by adding a word yourself.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant={suggested > 0 ? "primary" : "outline"} onClick={() => onOpenTab("inbox")}>
            Inbox
            {suggested > 0 && (
              <Badge tone={suggested > 0 ? "default" : "outline"}>{suggested}</Badge>
            )}
          </Button>
          <Button variant="outline" onClick={() => onOpenTab("decks")}>
            <Layers className="h-4 w-4" />
            Study decks
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card px-3 py-2.5", className)}>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="tabular mt-0.5 text-xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

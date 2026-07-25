import { useNavigate } from "react-router-dom";
import { BookMarked, CalendarClock, Flame, Info } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui";
import { formatBand, pluralize } from "@/lib/format";
import { featureAvailable } from "../blocks";
import type { ProfileDoc, StreakDoc, VocabTile } from "../types";

/** Streak + today's daily goal (10 §9) — never punitive, never loss-framed. */
export function StreakCard({ streak }: { streak: StreakDoc }) {
  const goal = Math.max(1, streak.daily_goal_min);
  const pct = Math.min(100, Math.round((streak.today_minutes / goal) * 100));
  const repaired = streak.repaired_dates.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle>Streak</CardTitle>
        {streak.current > 0 && (
          <Badge tone="warning" className="shrink-0 gap-1">
            <Flame className="h-3 w-3" aria-hidden="true" />
            {pluralize(streak.current, "day")}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress
          value={pct}
          tone={streak.today_goal_met ? "success" : "primary"}
          label="Today"
          detail={`${streak.today_minutes} / ${goal} min`}
        />
        <dl className="grid grid-cols-2 gap-2 text-[13px]">
          <div>
            <dt className="text-muted-foreground">Current</dt>
            <dd className="tabular font-medium text-foreground">
              {pluralize(streak.current, "day")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Longest</dt>
            <dd className="tabular font-medium text-foreground">
              {pluralize(streak.longest, "day")}
            </dd>
          </div>
        </dl>
        {streak.next_milestone !== null && (
          <p className="text-[11px] text-muted-foreground">
            Next milestone at {streak.next_milestone} days. Rest days you configured never
            break a streak.
          </p>
        )}
        {repaired && (
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            We covered {streak.repaired_dates.join(", ")} for you — one free repair every 30
            days.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Days-to-exam countdown, or a nudge to add a date so the plan can be paced. */
export function ExamCountdownCard({ profile }: { profile: ProfileDoc }) {
  const days = profile.exam_in_days;
  const format = profile.exam_format === "general_training" ? "General Training" : "Academic";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exam countdown</CardTitle>
      </CardHeader>
      <CardContent>
        {profile.exam_date === null || days === null ? (
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">
              No exam date yet. Without one BandReady paces you on a rolling 8-week horizon
              and there is no taper phase.
            </p>
            <p className="text-[13px] text-muted-foreground">
              Add a date in Settings and the plan regenerates around it.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <CalendarClock
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular text-foreground">
                {days > 0
                  ? `${pluralize(days, "day")} to your test`
                  : days === 0
                    ? "Your test is today"
                    : `Your test date passed ${pluralize(Math.abs(days), "day")} ago`}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {profile.exam_date} · {format} · target band{" "}
                {formatBand(profile.target_band)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Vocabulary due count + 7-day retention (08-vocabulary-srs.md owns the semantics). */
export function VocabCard({ vocab }: { vocab: VocabTile }) {
  const navigate = useNavigate();
  const vocabReady = featureAvailable("vocab");
  const retention =
    vocab.retention_7d === null ? null : `${Math.round(vocab.retention_7d * 100)} %`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vocabulary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {vocab.cards === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No cards yet. Words you look up while reading, listening or writing become cards
            automatically — or import a starter deck.
          </p>
        ) : (
          <dl className="grid grid-cols-3 gap-2 text-[13px]">
            <div>
              <dt className="text-muted-foreground">Due today</dt>
              <dd className="tabular text-lg font-semibold text-foreground">
                {vocab.due_today}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cards</dt>
              <dd className="tabular text-lg font-semibold text-foreground">{vocab.cards}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">7-day recall</dt>
              <dd className="tabular text-lg font-semibold text-foreground">
                {retention ?? "—"}
              </dd>
            </div>
          </dl>
        )}
        {retention === null && vocab.cards > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Recall appears after your first week of reviews.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={!vocabReady}
          onClick={() => navigate("/vocab")}
        >
          <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
          {vocab.due_today > 0 ? `Review ${vocab.due_today} cards` : "Open vocabulary"}
        </Button>
        {!vocabReady && (
          <p className="text-[11px] text-muted-foreground">
            The vocabulary room is not available in this build yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

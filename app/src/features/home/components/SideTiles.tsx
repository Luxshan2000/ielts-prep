import { useNavigate } from "react-router-dom";
import { BookMarked, CalendarClock, CalendarPlus, Flame, Info } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
} from "@/components/ui";
import { formatBand, pluralize } from "@/lib/format";
import { featureAvailable } from "../blocks";
import type { ProfileDoc, StreakDoc, VocabTile } from "../types";

/** Streak + today's daily goal (10 §9) — never punitive, never loss-framed. */
export function StreakCard({ streak }: { streak: StreakDoc }) {
  const goal = Math.max(1, streak.daily_goal_min);
  const pct = Math.min(100, Math.round((streak.today_minutes / goal) * 100));
  const repaired = streak.repaired_dates.length > 0;
  // Nothing has ever been logged. "Current 0 · Longest 0" under an empty bar is
  // three zeros that say nothing; the sentence says what turns them into numbers.
  const unstarted =
    streak.current === 0 && streak.longest === 0 && streak.total_minutes_400d === 0;

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
        {unstarted ? (
          <EmptyState
            size="sm"
            icon={Flame}
            title="Your streak starts with your first session"
            description={`A session, a vocabulary review or a single drill all count. Your daily goal is ${goal} minutes, and rest days in your plan never break a streak.`}
          />
        ) : (
          <>
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
                Next milestone at {streak.next_milestone} days. Rest days in your plan never
                break a streak.
              </p>
            )}
            {repaired && (
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                We covered {streak.repaired_dates.join(", ")} for you. You get one free repair
                every 30 days.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Days-to-exam countdown, or a way to add the date.
 *
 * The date is only editable in the setup wizard, which is why this points at
 * `/onboarding` rather than at Settings: the old copy told the learner to "add a
 * date in Settings", where no such field exists.
 */
export function ExamCountdownCard({
  profile,
  hasPlan,
}: {
  profile: ProfileDoc;
  /** Without one there is no pacing yet to describe — see the copy below. */
  hasPlan: boolean;
}) {
  const navigate = useNavigate();
  const days = profile.exam_in_days;
  const format = profile.exam_format === "general_training" ? "General Training" : "Academic";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exam countdown</CardTitle>
      </CardHeader>
      <CardContent>
        {profile.exam_date === null || days === null ? (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              {hasPlan
                ? "No test date yet, so BandReady is pacing you on a rolling 8-week plan with no taper, and the exam-readiness checklist stays locked."
                : "No test date yet. Without one BandReady paces you on a rolling 8-week horizon, and the exam-readiness checklist stays locked."}
            </p>
            <p className="text-[13px] text-muted-foreground">
              Add your date and your plan is built backwards from it, finishing with a
              two-week taper.
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate("/onboarding")}>
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Add my test date
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
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
            {/* A date in the past leaves the plan tapering towards a day that has
                been and gone, and this card was the only place saying so while
                offering nothing to press. The wizard is the one screen that can
                set the date, same as the "no date yet" branch above. */}
            {days < 0 && (
              <div className="space-y-2">
                <p className="text-[13px] text-muted-foreground">
                  If you have sat it, well done. If you have rebooked, put the new date in
                  and BandReady rebuilds the plan backwards from it.
                </p>
                <Button variant="outline" size="sm" onClick={() => navigate("/onboarding")}>
                  <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Set a new test date
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Vocabulary due count + 7-day retention (08-vocabulary-srs.md owns the semantics). */
export function VocabCard({ vocab, due }: { vocab: VocabTile; due: number | null }) {
  const navigate = useNavigate();
  const vocabReady = featureAvailable("vocab");
  // `due` is the review room's own number; the summary's is uncapped (see `VocabStats`).
  const dueToday = due ?? vocab.due_today;
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
            automatically. You can also import a starter deck.
          </p>
        ) : (
          <dl className="grid grid-cols-3 gap-2 text-[13px]">
            <div>
              <dt className="text-muted-foreground">Due today</dt>
              <dd className="tabular text-lg font-semibold text-foreground">{dueToday}</dd>
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
        {vocab.cards > 0 && dueToday === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Nothing due today. The rest of your deck comes round on its own schedule.
          </p>
        )}
        {retention === null && vocab.cards > 0 && dueToday > 0 && (
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
          {dueToday > 0 ? `Review ${dueToday} cards` : "Open vocabulary"}
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

import { useNavigate } from "react-router-dom";
import { CalendarRange, PartyPopper, Sparkles } from "lucide-react";
import {
  Badge,
  BandScore,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { formatBand, formatDate } from "@/lib/format";
import { useOnboardingStore } from "../store";
import {
  SKILL_LABELS,
  type PlacementEstimate,
  type PlacementResult,
  type SkillKey,
} from "../types";

const SKILLS: SkillKey[] = ["listening", "reading", "writing", "speaking"];

/** Plan-generator activity ids → the words a learner would use. */
const ACTIVITY_LABELS: Record<string, string> = {
  task2_essay: "Task 2 essay",
  task1_report: "Task 1 report",
  rewrite_with_feedback: "Rewrite with feedback",
  p1_interview: "Part 1 interview",
  p2_long_turn: "Part 2 long turn",
  p3_discussion: "Part 3 discussion",
  passage_timed: "Timed passage",
  qtype_drill: "Question-type drill",
  skimming_set: "Skimming set",
  part_set: "Listening part set",
  part34_set: "Listening parts 3 and 4",
  dictation: "Dictation",
  section_test: "Full section test",
  review_day: "Review day",
  srs_deep_session: "Deep vocabulary session",
  vocab_recall_sprint: "Vocabulary recall sprint",
  full_mock: "Full mock test",
  mock_speaking: "Mock speaking",
  mock_review: "Mock review",
  mock_error_review: "Mock error review",
  readiness_checklist: "Readiness checklist",
  gra_complex_sentences: "Complex sentences",
  cc_cohesion_linkers: "Cohesion and linkers",
  ta_answer_the_question: "Answer the question",
  lr_paraphrase_sprint: "Paraphrase sprint",
  fc_fluency_shadowing: "Fluency shadowing",
  minimal_pairs: "Minimal pairs",
};

function blockLabel(kind: string, module?: string | null, activity?: string | null): string {
  if (kind === "warmup_srs") return "Vocabulary warm-up";
  const key = activity ?? module ?? "practice";
  const name =
    ACTIVITY_LABELS[key] ??
    (() => {
      const words = key.replace(/[_-]+/g, " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    })();
  return kind === "micro_drill" ? `Micro-drill: ${name}` : name;
}

/**
 * Where a band came from, in one short line.
 *
 * `/placement/complete` reports a section whose marking call failed exactly like
 * a section the learner skipped: `skipped: true`, band from the self-rating. So
 * a learner who typed a 150-word essay would be told it came "from your
 * self-rating", which is the app knowing one thing and saying another. Until the
 * sidecar carries that third state, the wizard remembers which sections were
 * actually worked and says the truer thing here.
 */
function provenance(
  estimate: PlacementEstimate | undefined,
  worked: boolean,
  skill: SkillKey,
  markingWasDown: boolean,
): string {
  if (estimate === undefined) return "Not measured";
  if (estimate.skipped !== true) {
    return skill === "speaking" ? "From your typed sample" : "From the sampler";
  }
  if (worked) {
    return markingWasDown
      ? "You answered this, but it could not be marked, so your self-rating stands"
      : "You answered this, but it could not be marked this time";
  }
  return "From your self-rating";
}

/** The wizard's final screen: starting bands plus the plan they produced. */
export function PlacementResultView({ result }: { result: PlacementResult }) {
  const navigate = useNavigate();
  const answered = useOnboardingStore((s) => s.answered);
  const scoringAtStart = useOnboardingStore((s) => s.scoringAtStart);
  const scoring = useOnboardingStore((s) => s.scoring);
  const markingUnset = scoring !== null && scoring.ok !== true;
  const plan = result.plan;
  const preview = (plan?.sessions ?? []).slice(0, 5);

  return (
    <div className="scrollbar-thin h-full min-h-0 overflow-y-auto animate-fade-in">
      <div className="mx-auto w-full max-w-2xl space-y-5 px-6 py-10">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <PartyPopper className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">You&apos;re set up</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.nag ??
                "These are your starting bands. They will move as soon as real scored attempts come in."}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <CardTitle>Starting band estimates</CardTitle>
            <Badge tone="outline" className="shrink-0">
              {result.confidence} confidence
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {SKILLS.map((skill) => {
                // Optional chaining, not decoration: a truncated or older `/complete` body
                // with no `estimates` threw here, and this screen is the *end* of setup —
                // crashing on it strands somebody who has just done thirty minutes of work.
                const estimate = result.estimates?.[skill];
                return (
                  <div
                    key={skill}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground">
                        {SKILL_LABELS[skill]}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {provenance(
                          estimate,
                          answered.includes(skill),
                          skill,
                          scoringAtStart === false,
                        )}
                      </p>
                    </div>
                    {estimate ? (
                      <BandScore band={estimate.band} size="sm" />
                    ) : (
                      <span className="text-sm tabular text-muted-foreground">—</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {result.disclaimer ?? "Estimated band, not a guarantee"}. Each band carries about
              ±1.0 of uncertainty at this stage; three scored attempts per skill tighten it.
            </p>
          </CardContent>
        </Card>

        {markingUnset && (
          <Card className="border-border">
            <CardContent className="space-y-1 p-4 text-[13px]">
              <p className="font-medium text-foreground">Start with Reading or Vocabulary</p>
              <p className="text-muted-foreground">
                They are ready now and marked on this machine. Writing and Speaking still need
                a marking model. You can write and record without one, but nothing there gets a
                band until it is set up in Settings.
              </p>
            </CardContent>
          </Card>
        )}

        {plan && (
          <Card>
            <CardHeader>
              <CardTitle>Your plan</CardTitle>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {plan.horizon_weeks} week{plan.horizon_weeks === 1 ? "" : "s"} to target band{" "}
                {formatBand(plan.goal_band)}
                {plan.exam_date ? ` · exam ${formatDate(plan.exam_date)}` : " · no exam date set"}
                . Skills
                further from target get more of your weekly minutes, recomputed every week.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {preview.map((session) => (
                <div
                  key={session.session_id}
                  className="rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <CalendarRange
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="text-[13px] font-medium text-foreground">
                      {formatDate(session.date)}
                    </span>
                    <span className="text-[11px] tabular text-muted-foreground">
                      {session.duration_min} min · {session.phase}
                    </span>
                  </div>
                  <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                    {session.blocks
                      .map((b) => blockLabel(b.kind, b.module, b.activity))
                      .join(" → ")}
                  </p>
                </div>
              ))}
              {(plan.sessions ?? []).length > preview.length && (
                <p className="text-[11px] text-muted-foreground">
                  and {plan.sessions.length - preview.length} more sessions scheduled.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => navigate("/", { replace: true })}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Go to my dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate("/progress", { replace: true })}>
            See the full picture
          </Button>
        </div>
      </div>
    </div>
  );
}

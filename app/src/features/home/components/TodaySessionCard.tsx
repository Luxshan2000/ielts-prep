import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarPlus,
  Check,
  CircleSlash,
  Dumbbell,
  Layers,
  ListChecks,
  Lock,
  Play,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  useConfirm,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { activeBlockIndex, blockSubtitle, blockTarget, blockTitle } from "../blocks";
import type { PlanBlock, PlanSession } from "../types";

const BLOCK_ICONS = {
  warmup_srs: Layers,
  main: Sparkles,
  micro_drill: Dumbbell,
} as const;

const STATUS_TONE = {
  scheduled: "outline",
  in_progress: "primary",
  completed: "success",
  partial: "warning",
  skipped: "default",
} as const;

const STATUS_LABEL = {
  scheduled: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  partial: "Finished early",
  skipped: "Skipped",
} as const;

interface Props {
  session: PlanSession | null;
  /**
   * The next session the plan still has scheduled, from `GET /plan`. On a rest
   * day it is the only thing on the card worth saying, and after today's session
   * is finished it is the difference between "tomorrow" and the truth.
   */
  next: PlanSession | null;
  planId: string | null;
  busy: boolean;
  generating: boolean;
  onGenerate: () => void;
  onStart: (sessionId: string) => void;
  onComplete: (sessionId: string) => void;
  onSkip: (sessionId: string) => void;
}

/**
 * "Mon 17 Aug — Speaking, Part 1 interview (60 min)".
 *
 * `null` when `GET /plan` did not come back, which is the one case where the card
 * still has to fall back to saying nothing about what comes next.
 */
function nextSessionLine(next: PlanSession | null): string | null {
  if (!next) return null;
  const main = next.blocks.find((b) => b.kind === "main") ?? next.blocks[0];
  // blockTitle reads "Speaking — Part 1 interview"; inside a sentence that already
  // has a dash in it, a second one is two dashes doing different jobs.
  const what = main ? blockTitle(main).replace(": ", ", ") : null;
  return `${formatDate(next.date)}${what ? `: ${what}` : ""} (${next.duration_min} min)`;
}

function BlockRow({
  block,
  index,
  active,
  done,
  onStart,
}: {
  block: PlanBlock;
  index: number;
  active: boolean;
  done: boolean;
  onStart: (path: string) => void;
}) {
  const Icon = BLOCK_ICONS[block.kind] ?? Sparkles;
  const target = blockTarget(block);
  const subtitle = blockSubtitle(block);

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5",
        active ? "border-primary/60 bg-primary/[0.06]" : "border-border",
        done && "opacity-60",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {blockTitle(block)}
        </span>
        {subtitle && (
          <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
        )}
        {target.path === null && (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
            {target.unavailableReason}
          </span>
        )}
      </span>

      <span className="shrink-0 tabular text-[11px] text-muted-foreground">
        {block.minutes} min
      </span>

      <Button
        size="sm"
        variant={active ? "primary" : "outline"}
        disabled={target.path === null}
        onClick={() => target.path && onStart(target.path)}
        aria-label={`Start block ${index + 1}: ${blockTitle(block)}`}
      >
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
        Start
      </Button>
    </li>
  );
}

/**
 * Today's planned session with its three blocks (10 §5). Each block routes into
 * the room that runs it; a room this build does not ship yet is disabled with
 * the reason spelled out instead of a Start button that 404s.
 */
export function TodaySessionCard({
  session,
  next,
  planId,
  busy,
  generating,
  onGenerate,
  onStart,
  onComplete,
  onSkip,
}: Props) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [confirmingLong, setConfirmingLong] = useState(false);

  if (planId === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s session</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={ListChecks}
            title="No study plan yet"
            // The sidecar's own hint for this state reads "Generate a plan
            // from…", which is an instruction for something the learner cannot
            // do directly; the button under it is how a plan gets built.
            description="BandReady builds a day-by-day plan from your target band, your test date and how much time you have each week. Answer those three and today's session appears here."
            action={
              <Button onClick={() => navigate("/onboarding")}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Set up my plan
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  if (session === null) {
    // A rest day used to end on "See my plan and progress", which promised a plan
    // the Progress screen does not carry — it holds bands, trajectory, the activity
    // calendar and the readiness checklist, and nothing about the schedule. The
    // plan document already knows what comes next, so the card says it here rather
    // than sending the learner somewhere to look for it.
    const upcoming = nextSessionLine(next);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s session</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={CalendarPlus}
            title="Today is a rest day"
            description={
              upcoming
                ? `Nothing is scheduled. Your next session is ${upcoming}. Rest days are part of the plan and never break your streak. You can still practise on your own from any room.`
                : "Nothing is scheduled. Rest days are part of the plan and never break your streak. You can still practise on your own from any room."
            }
            action={
              <Button variant="outline" onClick={() => navigate("/progress")}>
                See my progress
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const activeIndex = activeBlockIndex(session);
  const finished = session.status === "completed";
  // Only meaningful once today is done: the sidecar's `next` still points at today
  // while today's session is unfinished.
  const upcoming = nextSessionLine(next);
  const longSession = session.blocks.some((b) => Boolean(b.params?.confirm_long_session));
  const loggedPct = session.duration_min
    ? Math.min(100, Math.round((session.minutes_logged / session.duration_min) * 100))
    : 0;

  const startBlock = async (path: string) => {
    if (longSession && !confirmingLong) {
      const ok = await confirm({
        title: "This session runs about 2 h 35",
        message:
          "Full mocks are timed end to end: Listening, Reading and Writing back to back. Start only if you can sit the whole block.",
        confirmLabel: "Start the mock",
      });
      if (!ok) return;
      setConfirmingLong(true);
    }
    if (session.status === "scheduled") onStart(session.session_id);
    navigate(path);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Today&apos;s session</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {formatDate(session.date)} · {session.duration_min} min ·{" "}
            {session.phase === "taper" ? "Taper week" : "Build phase"}
          </p>
        </div>
        <Badge tone={STATUS_TONE[session.status]} className="shrink-0">
          {STATUS_LABEL[session.status]}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        {session.minutes_logged > 0 && !finished && (
          <Progress
            value={loggedPct}
            label="Minutes logged today"
            detail={`${session.minutes_logged} / ${session.duration_min} min`}
          />
        )}

        <ul className="space-y-2">
          {session.blocks.map((block, index) => (
            <BlockRow
              key={`${block.kind}-${index}`}
              block={block}
              index={index}
              active={!finished && index === activeIndex}
              done={finished || index < activeIndex}
              onStart={(path) => void startBlock(path)}
            />
          ))}
        </ul>

        {!finished ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={() => onComplete(session.session_id)}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Mark session done
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: "Skip today's session?",
                  message:
                    "Skipped sessions are never rescheduled. Next week's weighting picks up the slack instead.",
                  confirmLabel: "Skip today",
                });
                if (ok) onSkip(session.session_id);
              }}
            >
              <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />
              Skip today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              loading={generating}
              onClick={onGenerate}
            >
              Rebuild my plan
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* "Tomorrow's session is already scheduled" is false whenever tomorrow
                is a rest day — with the default six study days that is every
                Saturday evening. The plan says which day it actually is. */}
            <p className="flex-1 text-[13px] text-muted-foreground">
              {session.minutes_logged} minutes logged.{" "}
              {upcoming
                ? `Your next session is ${upcoming}.`
                : "Your plan picks up again on your next study day."}
            </p>
            <Button variant="ghost" size="sm" loading={generating} onClick={onGenerate}>
              Rebuild my plan
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

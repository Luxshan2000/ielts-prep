import { useState } from "react";
import { AlertTriangle, CalendarCheck, Check, ChevronDown, Lock, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  Skeleton,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBand, pluralize } from "@/lib/format";
import type { ReadinessDoc, ReadinessItem } from "../types";

interface Props {
  readiness: ReadinessDoc | null;
  targetBand: number | null;
  loading: boolean;
  savingItem: string | null;
  error?: string;
  onToggle: (itemId: string, checked: boolean) => void;
}

const VERDICT: Record<ReadinessDoc["verdict"], { label: string; tone: "success" | "warning" | "default"; copy: string }> = {
  ready: {
    label: "Ready",
    tone: "success",
    copy: "Every automatic check has passed. Keep the routine light and rest well.",
  },
  nearly: {
    label: "Nearly",
    tone: "warning",
    copy: "Most checks have passed. The unticked ones below are where the remaining risk sits.",
  },
  keep_building: {
    label: "Keep building",
    tone: "default",
    copy: "There is still ground to cover. Work the unticked checks in order — they are ordered by how much they move your band.",
  },
};

/** Why an automatic check exists — shown when the learner expands an item. */
const ITEM_DETAIL: Record<string, string> = {
  "auto-two-mocks":
    "Two full mocks is the smallest sample that tells you how you hold up over three hours rather than over one exercise.",
  "auto-overall-near-target":
    "Your overall estimate is within half a band of your target. Half a band is roughly the width of the estimate's own uncertainty.",
  "auto-every-skill-near-target":
    "The overall band hides a weak skill. This check wants every skill within half a band of target, at medium confidence or better.",
  "auto-timed-lr":
    "Listening and Reading are lost on the clock more often than on the questions. This checks your last two sittings finished inside the official limits.",
  "auto-writing-word-minimums":
    "Under-length answers are penalised before the content is even read: 150 words for Task 1, 250 for Task 2.",
  "auto-vocab-retention":
    "85 % seven-day recall means the words you have studied are actually available under pressure.",
  "manual-exam-booked":
    "Confirm the booking and that your ID matches the name on it exactly.",
  "manual-logistics":
    "Know the venue, the travel time and the reporting time. Computer-delivered and paper sittings differ.",
  "manual-format-known":
    "Paper and computer sittings differ in note-taking, transfer time and answer entry. Practise the one you booked.",
  "manual-recorded-self":
    "Listening back to yourself is the fastest way to catch fillers, flat intonation and rushed endings.",
  "manual-sleep-plan":
    "Plan the week, not just the night before. Sleep debt costs more marks than one more practice test earns.",
};

function ItemRow({
  item,
  saving,
  onToggle,
}: {
  item: ReadinessItem;
  saving: boolean;
  onToggle: (itemId: string, checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const detail = ITEM_DETAIL[item.id];
  const auto = item.kind === "auto";

  return (
    <li className="rounded-lg border border-border">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {auto ? (
          <span
            role="img"
            aria-label={item.checked ? "Passed" : "Not met yet"}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
              item.checked ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {item.checked ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </span>
        ) : (
          <input
            id={`readiness-${item.id}`}
            type="checkbox"
            checked={item.checked}
            disabled={saving}
            onChange={(e) => onToggle(item.id, e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border-input bg-background text-primary accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
          />
        )}

        <div className="min-w-0 flex-1">
          {auto ? (
            <p className="text-[13px] text-foreground">{item.label}</p>
          ) : (
            <label htmlFor={`readiness-${item.id}`} className="cursor-pointer text-[13px] text-foreground">
              {item.label}
            </label>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {auto
              ? item.checked
                ? "Passed · checked automatically from your data"
                : "Not met yet · checked automatically from your data"
              : "You tick this one"}
            {item.checked_at ? ` · ${item.checked_at.slice(0, 10)}` : ""}
          </p>
          {open && detail && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{detail}</p>
          )}
        </div>

        {detail && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-expanded={open}
            aria-label={open ? `Hide detail for ${item.label}` : `Show detail for ${item.label}`}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </Button>
        )}
      </div>
    </li>
  );
}

/** Exam-readiness checklist (10 §10). Unlocked once an exam date exists. */
export function ReadinessChecklist({
  readiness,
  targetBand,
  loading,
  savingItem,
  error,
  onToggle,
}: Props) {
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exam readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertTriangle}
            title="The checklist could not be loaded"
            description={error}
          />
        </CardContent>
      </Card>
    );
  }

  if (loading && readiness === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exam readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (readiness === null) return null;

  if (!readiness.unlocked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exam readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Lock}
            title="Add your exam date to unlock the checklist"
            description="The readiness checks are paced against a real date — how many mocks you have sat, how close each skill is to target, and the practical test-day items."
          />
        </CardContent>
      </Card>
    );
  }

  const verdict = VERDICT[readiness.verdict];
  const auto = readiness.items.filter((i) => i.kind === "auto");
  const manual = readiness.items.filter((i) => i.kind === "manual");
  const pct = Math.round((readiness.auto_done / Math.max(1, readiness.auto_total)) * 100);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Exam readiness</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">{verdict.copy}</p>
        </div>
        <Badge tone={verdict.tone} className="shrink-0">
          {verdict.label}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[13px]">
          <CalendarCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-foreground">
            {readiness.exam_date}
            {readiness.days_out !== null &&
              ` · ${readiness.days_out >= 0 ? `${pluralize(readiness.days_out, "day")} to go` : "date has passed"}`}
          </span>
          {targetBand !== null && (
            <span className="text-muted-foreground">target {formatBand(targetBand)}</span>
          )}
        </div>

        <Progress
          value={pct}
          tone={readiness.verdict === "ready" ? "success" : "primary"}
          label="Automatic checks passed"
          detail={`${readiness.auto_done} / ${readiness.auto_total}`}
        />

        {readiness.reality_check && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.06] px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-[13px] text-foreground">
              Your exam is close and several automatic checks are still open. It is worth
              asking whether the target band or the date is the thing to move — BandReady will
              never change either for you. The trajectory chart above shows what the data says.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Checked from your data
          </p>
          <ul className="space-y-2">
            {auto.map((item) => (
              <ItemRow key={item.id} item={item} saving={false} onToggle={onToggle} />
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Yours to confirm
          </p>
          <ul className="space-y-2">
            {manual.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                saving={savingItem === item.id}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-muted-foreground">{readiness.disclaimer}</p>
      </CardContent>
    </Card>
  );
}

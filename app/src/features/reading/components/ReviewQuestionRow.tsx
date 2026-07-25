import { Check, ChevronDown, Crosshair, Flag, Lightbulb, Sparkles, X } from "lucide-react";
import { Badge, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { qtypeLabel } from "../qtypes";
import { questionDomId } from "../model";
import type { WhyWrongState } from "../store";
import type { ReviewQuestion } from "../types";

export interface ReviewQuestionRowProps {
  question: ReviewQuestion;
  expanded: boolean;
  onToggle: () => void;
  /** Milliseconds spent on this question, when the attempt recorded it. */
  timeMs?: number;
  why: WhyWrongState | undefined;
  onAskWhy: () => void;
  onLocate?: () => void;
  canLocate: boolean;
}

/**
 * One reviewable question: the learner's answer against every accepted variant,
 * the authored explanation and trap note, locate-in-passage, and the on-demand
 * LLM trap analysis (06 §6.1).
 */
export function ReviewQuestionRow({
  question,
  expanded,
  onToggle,
  timeMs,
  why,
  onAskWhy,
  onLocate,
  canLocate,
}: ReviewQuestionRowProps) {
  const given = question.given?.trim();
  const accepted = question.accepted_answers ?? [];

  return (
    <div
      id={questionDomId(question.number)}
      className={cn(
        "scroll-mt-4 overflow-hidden rounded-xl border bg-card",
        question.correct ? "border-border" : "border-destructive/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            question.correct ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
          )}
        >
          {question.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
        <span className="w-7 shrink-0 text-[13px] font-semibold tabular text-muted-foreground">
          {question.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-foreground">
            {question.prompt || qtypeLabel(question.qtype)}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{qtypeLabel(question.qtype)}</span>
            {question.flagged && (
              <span className="inline-flex items-center gap-1 text-warning">
                <Flag className="h-3 w-3" aria-hidden="true" />
                flagged
              </span>
            )}
            {!question.answered && <span>no answer</span>}
            {question.near_miss_spelling && (
              <span className="text-warning">spelling near-miss</span>
            )}
            {timeMs ? <span className="tabular">{formatDuration(timeMs / 1000)}</span> : null}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {question.prompt && (
            <p className="text-[13px] leading-relaxed text-foreground">{question.prompt}</p>
          )}

          {question.instructions && (
            <p className="text-[11px] italic text-muted-foreground">{question.instructions}</p>
          )}

          {question.options && question.options.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-border bg-muted/40 p-2.5">
              {question.options.map((option) => {
                const isKey = accepted.some(
                  (value) => value.toUpperCase() === option.key.toUpperCase(),
                );
                return (
                  <li
                    key={option.key}
                    className={cn(
                      "flex gap-2 text-[13px]",
                      isKey ? "font-medium text-success" : "text-muted-foreground",
                    )}
                  >
                    <span className="w-6 shrink-0 font-semibold tabular">{option.key}</span>
                    <span className="min-w-0">{option.text}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Your answer
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[13px] font-medium",
                  question.correct ? "text-success" : "text-destructive",
                )}
              >
                {given || "— left blank"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Accepted {accepted.length > 1 ? "answers" : "answer"}
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-foreground">
                {accepted.length > 0 ? accepted.join(" / ") : "—"}
              </p>
            </div>
          </div>

          {question.explanation && (
            <p className="text-[13px] leading-relaxed text-foreground">{question.explanation}</p>
          )}

          {question.trap_note && (
            <p className="rounded-lg border-l-2 border-warning bg-warning/10 px-2.5 py-2 text-[13px]">
              <span className="font-medium">Trap: </span>
              {question.trap_note}
            </p>
          )}

          {question.locate?.evidence_quote && (
            <blockquote className="border-l-2 border-primary bg-primary/[0.06] px-2.5 py-2 text-[13px] italic">
              “{question.locate.evidence_quote}”
              {question.locate.paragraph_id && (
                <span className="ml-1.5 not-italic text-[11px] text-muted-foreground">
                  paragraph {question.locate.paragraph_id}
                </span>
              )}
            </blockquote>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {canLocate && onLocate && (
              <Button size="sm" variant="outline" onClick={onLocate}>
                <Crosshair className="h-3.5 w-3.5" />
                Locate in passage
              </Button>
            )}
            {question.can_ask_why && (
              <Button
                size="sm"
                variant="secondary"
                loading={why?.status === "loading"}
                disabled={why?.status === "ready"}
                onClick={onAskWhy}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {why?.status === "ready" ? "Explained below" : "Why was I wrong?"}
              </Button>
            )}
          </div>

          {why?.status === "loading" && <Spinner label="Asking your language model…" />}
          {why?.status === "error" && why.error && (
            <p className="text-[13px] text-destructive">{why.error}</p>
          )}
          {why?.status === "ready" && why.data && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">Trap analysis</Badge>
                {why.data.trap && <Badge tone="warning">{why.data.trap}</Badge>}
                {why.data.cached && <Badge tone="outline">cached</Badge>}
              </div>
              {why.data.explanation && (
                <p className="text-[13px] leading-relaxed">{why.data.explanation}</p>
              )}
              {why.data.tip && (
                <p className="flex gap-2 text-[13px] leading-relaxed">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                  {why.data.tip}
                </p>
              )}
              {why.data.model && (
                <p className="text-[11px] text-muted-foreground">Generated by {why.data.model}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

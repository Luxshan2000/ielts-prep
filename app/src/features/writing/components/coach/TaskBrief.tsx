/**
 * The task tab: what this prompt is, what it teaches, and what it will require.
 *
 * Everything here is preparation material and none of it is gated — a learner who
 * reads the parts of the task before writing is doing exactly what we want. What is
 * withheld is the *answer*: no frames, no model sentences, no overview to copy. The
 * distinction runs through the whole coach.
 */

import { AlertTriangle, ListChecks, Target } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { criterionCode, criterionName, criterionStyle } from "./labels";
import { Callout, SectionHead } from "./primitives";
import type { WritingTeaching } from "./types";
import { GENRE_LABELS, TASK_MIN_WORDS, TASK_SHORT, genreLabel, type WritingPrompt } from "../../store";
import { ChartRenderer } from "../chart/ChartRenderer";

const DIFFICULTY_LABEL: Record<number, string> = { 1: "Easier", 2: "Standard", 3: "Harder" };

export interface TaskBriefProps {
  prompt: WritingPrompt;
  teaching: WritingTeaching | null;
  /** Jump to the language bank, where the watchlist is explained in full. */
  onOpenLanguage?: () => void;
}

export function TaskBrief({ prompt, teaching, onOpenLanguage }: TaskBriefProps) {
  const genre = GENRE_LABELS[prompt.genre] ? genreLabel(prompt.genre) : prompt.genre;
  const minutes = prompt.time_limit_s ? Math.round(prompt.time_limit_s / 60) : null;
  const minWords = prompt.min_words ?? TASK_MIN_WORDS[prompt.task_type];
  const watchlist = teaching?.error_watchlist ?? [];
  const parts = teaching?.parts_checklist ?? [];

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ the one behaviour --- */}
      {teaching?.band_move && (
        <div className="rounded-xl border border-primary/40 bg-primary/8 p-4">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            The one thing this prompt trains
          </p>
          <p className="mt-1.5 text-[15px] font-semibold leading-7 text-foreground">
            {teaching.band_move}
          </p>
          {teaching.teaches && (
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{teaching.teaches}</p>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- the task --- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{TASK_SHORT[prompt.task_type] ?? prompt.task_type}</Badge>
          <Badge tone="outline">{genre}</Badge>
          <Badge tone="default">
            {DIFFICULTY_LABEL[prompt.difficulty] ?? `Level ${prompt.difficulty}`}
          </Badge>
          {minutes && <Badge tone="outline">{minutes} minutes</Badge>}
          <Badge tone="outline">at least {minWords} words</Badge>
          {prompt.source === "generated" && <Badge tone="warning">AI-generated prompt</Badge>}
        </div>

        <p className="whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-[15px] leading-7 text-foreground">
          {prompt.prompt_text}
        </p>

        {prompt.letter_bullets.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-3.5">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your letter must cover
            </p>
            <ul className="space-y-1.5">
              {prompt.letter_bullets.map((bullet, index) => (
                <li key={index} className="flex gap-2 text-[14px] leading-6 text-foreground">
                  <span className="select-none text-muted-foreground" aria-hidden="true">
                    •
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {prompt.chart_spec && (
          <div className="rounded-xl border border-border bg-card p-3.5">
            <ChartRenderer spec={prompt.chart_spec} />
          </div>
        )}
      </section>

      {/* --------------------------------------- the parts of the task itself --- */}
      {parts.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="What a full response has to do"
            hint="Missing one of these is the single most expensive thing you can do on this task. It is what criterion 1 measures."
          />
          <ul className="space-y-2">
            {parts.map((part, i) => (
              <li key={i} className="rounded-xl border border-border bg-card p-3.5">
                <p className="flex items-start gap-2 text-[14px] font-semibold text-foreground">
                  <ListChecks
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {part.part}
                </p>
                <p className="mt-1 pl-6 text-[13px] leading-6 text-muted-foreground">
                  Check it by asking: {part.evidence_question}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* -------------------------------------------------------- forewarning --- */}
      {watchlist.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title={`This prompt will pull ${watchlist.length === 1 ? "one error" : `${watchlist.length} errors`} out of you`}
            hint="Named before you write, because an error you are watching for is one you can catch in the last three minutes."
          />
          <ul className="space-y-2">
            {watchlist.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3.5"
              >
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] font-semibold text-foreground">
                      {item.pattern}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        criterionStyle(item.criterion).chip,
                      )}
                      title={criterionName(item.criterion, prompt.task_type)}
                    >
                      {criterionCode(item.criterion)}
                    </span>
                    {i === 0 && <Badge tone="warning">Most likely</Badge>}
                  </p>
                  <p className="text-[13px] leading-6 text-muted-foreground">{item.why}</p>
                </div>
              </li>
            ))}
          </ul>
          {onOpenLanguage && (
            <button
              type="button"
              onClick={onOpenLanguage}
              className="rounded-sm text-[13px] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              See the wrong and right version of each →
            </button>
          )}
        </section>
      )}

      {teaching?.exam_note && (
        <Callout tone="info" title="One exam reality worth saying out loud">
          {teaching.exam_note}
        </Callout>
      )}

      {prompt.topic_tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {prompt.topic_tags.map((tag) => (
            <Badge key={tag} tone="outline">
              {tag.replace(/-/g, " ")}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

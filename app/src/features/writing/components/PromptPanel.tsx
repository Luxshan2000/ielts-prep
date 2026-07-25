/**
 * The prompt side of the editor (05 §3): instruction text, the three letter
 * bullets for GT Task 1, and the Academic Task 1 visual.
 */

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { GENRE_LABELS, TASK_SHORT, type WritingPrompt, genreLabel } from "../store";
import { ChartRenderer } from "./chart/ChartRenderer";

export interface PromptPanelProps {
  prompt: WritingPrompt;
  className?: string;
  /** Drops the badges row — used where the header already names the task. */
  bare?: boolean;
}

const DIFFICULTY_LABEL: Record<number, string> = { 1: "Easier", 2: "Standard", 3: "Harder" };

export function PromptPanel({ prompt, className, bare = false }: PromptPanelProps) {
  const genre = GENRE_LABELS[prompt.genre] ? genreLabel(prompt.genre) : prompt.genre;

  return (
    <div className={cn("space-y-4", className)}>
      {!bare && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{TASK_SHORT[prompt.task_type] ?? prompt.task_type}</Badge>
          <Badge tone="outline">{genre}</Badge>
          <Badge tone="default">{DIFFICULTY_LABEL[prompt.difficulty] ?? `Level ${prompt.difficulty}`}</Badge>
          {prompt.source === "generated" && <Badge tone="warning">AI-generated prompt</Badge>}
        </div>
      )}

      <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">{prompt.prompt_text}</p>

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

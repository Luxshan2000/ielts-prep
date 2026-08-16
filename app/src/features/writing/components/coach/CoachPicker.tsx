/**
 * The coach's front door, rendered as a tab on the Writing hub.
 *
 * The prompt bank answers "what shall I write?". This answers a different question
 * — "what does this prompt teach?" — so it leads with the one behaviour each prompt
 * trains rather than with its subject. Prompts with no teaching payload are still
 * listed, honestly labelled, because hiding half the bank would be a worse lie than
 * an empty card.
 *
 * It reads the shared prompt list rather than fetching its own, so the filter the
 * learner set on the bank tab still applies here and one list is loaded once.
 */

import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Lock, Search, Target } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, Select, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { hasTeaching } from "./types";
import {
  GENRE_LABELS,
  TASK_SHORT,
  genreLabel,
  useWritingStore,
  type AttemptSummary,
  type TaskType,
} from "../../store";

const TASK_OPTIONS = [
  { value: "all", label: "Every task type" },
  { value: "ac_task1", label: "Academic Task 1" },
  { value: "gt_task1", label: "General Training Task 1" },
  { value: "task2", label: "Task 2" },
];

/** Prompt ids the learner has actually submitted, so the gate state is honest here too. */
function attemptedIds(history: AttemptSummary[]): Set<string> {
  const ids = new Set<string>();
  for (const attempt of history) {
    if (attempt.status === "submitted" || attempt.status === "scored") ids.add(attempt.prompt_id);
  }
  return ids;
}

export function CoachPicker() {
  const navigate = useNavigate();

  const prompts = useWritingStore((s) => s.prompts);
  const loading = useWritingStore((s) => s.promptsLoading);
  const error = useWritingStore((s) => s.promptsError);
  const loadPrompts = useWritingStore((s) => s.loadPrompts);
  const filters = useWritingStore((s) => s.filters);
  const setFilter = useWritingStore((s) => s.setFilter);
  const history = useWritingStore((s) => s.history);

  useEffect(() => {
    if (prompts.length === 0) void loadPrompts();
  }, [loadPrompts, prompts.length]);

  const attempted = useMemo(() => attemptedIds(history), [history]);
  const taught = useMemo(() => prompts.filter((p) => hasTeaching(p.teaching)), [prompts]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label
            htmlFor="coach-search"
            className="mb-1 block text-[12px] font-medium text-muted-foreground"
          >
            Search
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="coach-search"
              value={filters.q}
              onChange={(event) => setFilter("q", event.target.value)}
              placeholder="a subject, a chart kind, a letter situation…"
              className="pl-8"
            />
          </div>
        </div>
        <div className="min-w-[12rem]">
          <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
            Task type
          </span>
          <Select
            aria-label="Task type"
            value={filters.task_type}
            onChange={(value) => setFilter("task_type", value as TaskType | "all")}
            options={TASK_OPTIONS}
          />
        </div>
      </div>

      {loading && prompts.length === 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && !loading && (
        <ErrorState error={error} title="The prompt bank could not be loaded" onRetry={() => void loadPrompts()} />
      )}

      {!loading && !error && prompts.length === 0 && (
        <EmptyState
          icon={Search}
          title="No prompts match that"
          description="Widen the task type or clear the search box."
        />
      )}

      {taught.length === 0 && prompts.length > 0 && !loading && (
        <div className="rounded-xl border border-border bg-muted/40 p-3.5">
          <p className="text-[13px] font-semibold text-foreground">
            None of these prompts carries teaching material yet
          </p>
          <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
            The coach still opens on any of them and shows the task, but the plan, the model
            answers and the language bank arrive with the authored content pack.
          </p>
        </div>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {prompts.map((prompt) => {
          const teaches = prompt.teaching?.band_move ?? prompt.teaching?.teaches ?? null;
          const rich = hasTeaching(prompt.teaching);
          const done = attempted.has(prompt.id);
          return (
            <li key={prompt.id}>
              <button
                type="button"
                onClick={() => navigate(`/writing/coach/${encodeURIComponent(prompt.id)}`)}
                className={cn(
                  "flex h-full w-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  rich
                    ? "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
                    : "border-dashed border-border bg-card/60 hover:bg-muted/50",
                )}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="primary">{TASK_SHORT[prompt.task_type] ?? prompt.task_type}</Badge>
                  <Badge tone="outline">
                    {GENRE_LABELS[prompt.genre] ? genreLabel(prompt.genre) : prompt.genre}
                  </Badge>
                  {done ? (
                    <Badge tone="success">Attempted</Badge>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                      title="Model answers unlock after you have written this one"
                    >
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      models locked
                    </span>
                  )}
                </span>

                {teaches ? (
                  <span className="flex items-start gap-2 text-[14px] font-semibold leading-6 text-foreground">
                    <Target className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {teaches}
                  </span>
                ) : (
                  <span className="flex items-start gap-2 text-[13px] leading-6 text-muted-foreground">
                    <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    No teaching payload on this prompt, so the coach shows the task only.
                  </span>
                )}

                <span className="line-clamp-3 text-[12.5px] leading-6 text-muted-foreground">
                  {prompt.chart_spec?.title ?? prompt.prompt_text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {prompts.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          {taught.length} of {prompts.length} prompts here carry a full teaching payload.{" "}
          <Button variant="ghost" size="sm" onClick={() => void loadPrompts()}>
            Refresh
          </Button>
        </p>
      )}
    </div>
  );
}

export default CoachPicker;

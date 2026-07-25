/**
 * Attempt history and lineage (`GET /api/v1/writing/attempts`). Drafts get a
 * "Resume" affordance — 05 §3 promises a draft survives a crash, and this is where
 * the learner finds it again.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CornerDownRight, FileText, RefreshCw } from "lucide-react";
import { Badge, BandScore, Button, EmptyState, Skeleton } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { TASK_SHORT, genreLabel, useWritingStore, type AttemptSummary } from "../store";

const STATUS_TONE = {
  draft: "warning",
  submitted: "primary",
  scored: "success",
  failed: "destructive",
} as const;

const STATUS_LABEL = {
  draft: "Draft",
  submitted: "Being marked",
  scored: "Marked",
  failed: "Marking failed",
} as const;

function Row({ attempt, onOpen }: { attempt: AttemptSummary; onOpen: (id: string) => void }) {
  const when = attempt.submitted_at ?? attempt.started_at;
  const isDraft = attempt.status === "draft" || attempt.status === "failed";

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(attempt.id)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors",
          "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span className="flex w-11 shrink-0 justify-center">
          {attempt.overall_band !== null ? (
            <BandScore band={attempt.overall_band} size="sm" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{TASK_SHORT[attempt.prompt?.task_type ?? "task2"]}</Badge>
            {attempt.prompt?.genre && <Badge tone="default">{genreLabel(attempt.prompt.genre)}</Badge>}
            <Badge tone={STATUS_TONE[attempt.status]}>{STATUS_LABEL[attempt.status]}</Badge>
            {attempt.mode === "exam" && <Badge tone="primary">Exam</Badge>}
            {attempt.parent_attempt_id && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <CornerDownRight className="h-3 w-3" aria-hidden="true" />
                rewrite
              </span>
            )}
          </span>
          <span className="mt-1 block truncate text-[13px] text-foreground">
            {attempt.prompt?.prompt_text ?? "Prompt unavailable"}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground tabular">
            {attempt.word_count} words · {formatDuration(attempt.seconds_elapsed)}
            {attempt.overtime_seconds > 0 ? ` (+${formatDuration(attempt.overtime_seconds)} over)` : ""}
            {when ? ` · ${formatDate(when)}` : ""}
          </span>
        </span>

        <span className="shrink-0 text-[12px] font-medium text-primary">
          {isDraft ? "Resume" : "Review"}
        </span>
      </button>
    </li>
  );
}

export function AttemptHistory({ promptId }: { promptId?: string }) {
  const navigate = useNavigate();
  const history = useWritingStore((s) => s.history);
  const loading = useWritingStore((s) => s.historyLoading);
  const error = useWritingStore((s) => s.historyError);
  const loadHistory = useWritingStore((s) => s.loadHistory);

  useEffect(() => {
    if (promptId !== undefined) {
      void loadHistory(promptId);
      return;
    }
    // The Writing home already loads the unfiltered list on mount; don't double-fetch.
    const state = useWritingStore.getState();
    if (state.history.length === 0 && !state.historyLoading) void loadHistory();
  }, [loadHistory, promptId]);

  if (loading && history.length === 0) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load your writing history"
        description={error}
        action={
          <Button variant="outline" onClick={() => void loadHistory(promptId)}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        }
      />
    );
  }

  if (history.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No writing attempts yet"
        description="Pick a prompt from the bank and write your first answer — every attempt is kept so you can see your bands converge."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {history.map((attempt) => (
        <Row
          key={attempt.id}
          attempt={attempt}
          onOpen={(id) => navigate(`/writing/attempt/${id}`)}
        />
      ))}
    </ul>
  );
}

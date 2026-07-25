/**
 * Past speaking sessions. Scored sessions deep-link to their report; drill and
 * quick-chat rows show a compact summary instead (04 §7 — drills have no report).
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, History } from "lucide-react";
import { Badge, BandScore, Button, EmptyState, SkeletonRow } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { activityLabel } from "./phases";
import { useSpeakingStore, type SessionRecord } from "../store";

function statusTone(record: SessionRecord): "default" | "warning" | "destructive" | "success" {
  if (record.status === "aborted") return "warning";
  if (record.status === "failed" || record.state === "ERROR") return "destructive";
  if (record.overall_band !== null) return "success";
  return "default";
}

function statusLabel(record: SessionRecord): string {
  if (record.live) return "Live now";
  if (record.status === "aborted") return "Ended early";
  if (record.status === "failed") return "Failed";
  if (record.overall_band !== null) return "Scored";
  if (record.status === "active") return "Unfinished";
  return "Not scored";
}

export function SessionHistory() {
  const navigate = useNavigate();
  const history = useSpeakingStore((s) => s.history);
  const loading = useSpeakingStore((s) => s.historyLoading);
  const error = useSpeakingStore((s) => s.historyError);
  const loadHistory = useSpeakingStore((s) => s.loadHistory);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loading && history.length === 0) {
    return (
      <div className="space-y-2">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={History}
        title="History unavailable"
        description={error}
        action={<Button onClick={() => void loadHistory()}>Retry</Button>}
      />
    );
  }

  if (history.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No speaking sessions yet"
        description="Run a full mock to get your first band estimate for speaking."
      />
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {history.map((record) => {
        const openable = Boolean(record.report_id);
        return (
          <li key={record.id}>
            <button
              type="button"
              disabled={!openable}
              onClick={() => {
                if (record.report_id) navigate(`/speaking/report/${record.report_id}`);
              }}
              className={cn(
                "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors",
                openable ? "hover:bg-accent" : "cursor-default",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {activityLabel(record.activity ?? record.mode)}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                  {record.started_at && <span>{formatDate(record.started_at)}</span>}
                  {record.duration_s ? (
                    <span className="tabular">{formatDuration(record.duration_s)}</span>
                  ) : null}
                  <Badge tone={statusTone(record)}>{statusLabel(record)}</Badge>
                </p>
              </div>
              {record.overall_band !== null && (
                <BandScore band={record.overall_band} size="sm" />
              )}
              {openable && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

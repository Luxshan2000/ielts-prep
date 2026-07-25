import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { Badge, Button, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatBand, formatDuration } from "@/lib/format";
import type { AttemptMode, Page } from "../types";

interface AttemptRow {
  attempt_id: string;
  test_id: string | null;
  script_id: string | null;
  mode: AttemptMode;
  status: string;
  raw_score: number | null;
  total_questions: number | null;
  band: number | null;
  duration_s: number | null;
  submitted_at: string | null;
}

/** Your last listening attempts, newest first, with a link into each review. */
export function RecentAttempts() {
  const [rows, setRows] = useState<AttemptRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.get<Page<AttemptRow>>("/api/v1/listening/attempts?limit=8");
      setRows(page.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "could not load your attempts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !rows) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <History className="h-4 w-4" aria-hidden="true" />
        No listening attempts yet. Your marked answers and transcripts land here.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {rows.map((row) => {
        const submitted = row.status === "submitted";
        return (
          <li
            key={row.attempt_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[13px]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Badge tone={row.mode === "exam" ? "warning" : "outline"}>
                {row.mode.replace(/_/g, " ")}
              </Badge>
              <span className="truncate text-muted-foreground">
                {row.submitted_at ? row.submitted_at.slice(0, 16).replace("T", " ") : "in progress"}
              </span>
            </span>
            <span className="flex items-center gap-3">
              {submitted ? (
                <>
                  <span className="tabular-nums">
                    {row.raw_score ?? 0}/{row.total_questions ?? 0}
                  </span>
                  {row.band !== null && <Badge tone="primary">band {formatBand(row.band)}</Badge>}
                  <span className="tabular-nums text-muted-foreground">
                    {formatDuration(row.duration_s ?? 0)}
                  </span>
                  <Link
                    to={`/listening/review/${row.attempt_id}`}
                    className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Review
                  </Link>
                </>
              ) : (
                <Badge tone="default">{row.status.replace(/_/g, " ")}</Badge>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

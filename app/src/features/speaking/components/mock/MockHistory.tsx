/**
 * Past mock sittings: when, how long, what band.
 *
 * Only full mocks appear here (`store.ts::isMockRecord`). Mixing drills and quick
 * chats into this list would flatter the trend — those are not the same test and were
 * never marked the same way — and the trend is the only number on this screen that
 * means anything on its own.
 */

import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ClipboardList } from "lucide-react";
import {
  Badge,
  BandScore,
  Button,
  EmptyState,
  SkeletonRow,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import { formatBand, formatDate, formatDuration } from "@/lib/format";
import { CRITERIA } from "../phases";
import type { SessionRecord } from "../../store";
import { useMockStore } from "./store";

/** Criterion bands as the session row stores them — shape tolerated, not assumed. */
function criterionBands(record: SessionRecord): { key: string; short: string; band: number }[] {
  const raw = record.criteria;
  if (!raw || typeof raw !== "object") return [];
  const out: { key: string; short: string; band: number }[] = [];
  for (const { key, short } of CRITERIA) {
    const cell = (raw as Record<string, unknown>)[key];
    const band =
      typeof cell === "number"
        ? cell
        : typeof cell === "object" && cell !== null && typeof (cell as { band?: unknown }).band === "number"
          ? ((cell as { band: number }).band)
          : null;
    if (band !== null) out.push({ key, short, band });
  }
  return out;
}

function statusLabel(record: SessionRecord): { text: string; tone: "default" | "warning" | "destructive" } {
  if (record.live) return { text: "In progress", tone: "warning" };
  if (record.status === "failed" || record.state === "ERROR") {
    return { text: "Not marked", tone: "destructive" };
  }
  if (record.status === "aborted") return { text: "Stopped early", tone: "warning" };
  return { text: "Not marked", tone: "default" };
}

export interface MockHistoryProps {
  /** Cap the rows — the pre-flight screen shows the most recent few. */
  limit?: number;
  className?: string;
}

export function MockHistory({ limit, className }: MockHistoryProps) {
  const navigate = useNavigate();
  const history = useMockStore((s) => s.history);
  const loading = useMockStore((s) => s.historyLoading);
  const error = useMockStore((s) => s.historyError);
  const loadHistory = useMockStore((s) => s.loadHistory);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const rows = useMemo(
    () => (limit ? history.slice(0, limit) : history),
    [history, limit],
  );

  if (loading && history.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Your mock history couldn't be loaded"
        description={error}
        action={<Button onClick={() => void loadHistory()}>Retry</Button>}
        className={className}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No mock tests yet"
        description="One full sitting gives you a band across all four criteria and a part-by-part account of where it came from."
        className={className}
      />
    );
  }

  return (
    <ul className={cn("divide-y divide-border overflow-hidden rounded-xl border border-border", className)}>
      {rows.map((record) => {
        const openable = Boolean(record.report_id);
        const bands = criterionBands(record);
        const status = statusLabel(record);
        return (
          <li key={record.id}>
            <button
              type="button"
              disabled={!openable}
              onClick={() => {
                if (record.report_id) navigate(`/speaking/mock/report/${record.report_id}`);
              }}
              className={cn(
                "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors",
                openable ? "hover:bg-accent" : "cursor-default",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {record.started_at ? formatDate(record.started_at) : "Mock test"}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                  {record.duration_s ? (
                    <span className="tabular">{formatDuration(record.duration_s)}</span>
                  ) : null}
                  {bands.length > 0 ? (
                    <span className="tabular">
                      {bands.map((b) => `${b.short} ${formatBand(b.band)}`).join(" · ")}
                    </span>
                  ) : (
                    <Badge tone={status.tone}>{status.text}</Badge>
                  )}
                </p>
              </div>
              {record.overall_band !== null && (
                <BandScore band={record.overall_band} size="sm" label="Overall" />
              )}
              {openable && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** `/speaking/mock/history` — the same list, full length, on its own page. */
export function MockHistoryPage() {
  const navigate = useNavigate();
  const history = useMockStore((s) => s.history);

  const scored = history.filter((row) => typeof row.overall_band === "number");
  const best = scored.length > 0 ? Math.max(...scored.map((r) => r.overall_band as number)) : null;

  return (
    <PageShell
      title="Mock test history"
      description={
        scored.length === 0
          ? "Every full sitting you have completed."
          : `${scored.length} marked sitting${scored.length === 1 ? "" : "s"}${
              best !== null ? ` · best ${formatBand(best)}` : ""
            }`
      }
      actions={
        <Button size="sm" onClick={() => navigate("/speaking/mock")}>
          Take a mock
        </Button>
      }
    >
      <div className="space-y-4">
        <MockHistory />
        <p className="text-[12px] leading-6 text-muted-foreground">
          Bands are AI estimates and move around by up to a band between sittings even when
          nothing about your English has changed. Three mocks two weeks apart tell you far more
          than any single result.
        </p>
      </div>
    </PageShell>
  );
}

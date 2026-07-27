/**
 * Past sittings, newest first.
 *
 * Sittings are kept on this machine (see `store.ts`) rather than on the sidecar,
 * so this list says so plainly instead of pretending to be a synced record. Each
 * row leads with the time split, not the band, for the same reason the report does.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, FileClock } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { minutesLabel } from "./format";
import { elapsedOf, useMockStore, type MockRecord } from "./store";

const STATUS_LABEL: Record<MockRecord["status"], string> = {
  sitting: "In progress",
  submitted: "Handed in",
  abandoned: "Abandoned",
};

function whenLabel(startedAt: number): string {
  const date = new Date(startedAt);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MockHistory({ limit = 6 }: { limit?: number }) {
  const navigate = useNavigate();
  const records = useMockStore((s) => s.records);
  const loadRecords = useMockStore((s) => s.loadRecords);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  if (records.length === 0) {
    return (
      <EmptyState
        icon={FileClock}
        title="No sittings yet"
        description="A mock is the only way to find out what your writing does under a clock you cannot pause. The first one is always a shock; that is the point of doing it here."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {records.slice(0, limit).map((record) => {
        const t1 = record.perTaskSeconds.task1;
        const t2 = record.perTaskSeconds.task2;
        const destination =
          record.status === "sitting"
            ? `/writing/mock/sitting/${record.id}`
            : `/writing/mock/report/${record.id}`;
        return (
          <li
            key={record.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5"
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-foreground">
                  {whenLabel(record.startedAt)}
                </span>
                <Badge
                  tone={
                    record.status === "submitted"
                      ? "success"
                      : record.status === "sitting"
                        ? "primary"
                        : "default"
                  }
                >
                  {STATUS_LABEL[record.status]}
                </Badge>
                <Badge tone="outline">
                  {record.module === "academic" ? "Academic" : "General Training"}
                </Badge>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] tabular text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {minutesLabel(elapsedOf(record))} used
                </span>
                <span className={cn(t1 > 25 * 60 && "text-warning")}>
                  Task 1 {minutesLabel(t1)}
                </span>
                <span>Task 2 {minutesLabel(t2)}</span>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(destination)}>
              {record.status === "sitting" ? "Resume" : "Report"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export default MockHistory;

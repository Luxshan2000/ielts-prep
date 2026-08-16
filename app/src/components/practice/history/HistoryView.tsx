import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Select,
  SkeletonRow,
} from "@/components/ui";
import { SearchInput } from "@/components/ui/SearchInput";
import { cn } from "@/lib/cn";
import { formatDate, formatDuration } from "@/lib/format";
import {
  KIND_LABEL,
  SORT_LABEL,
  matchesQuery,
  sortRows,
  type HistoryKind,
  type HistoryRow,
  type SortKey,
} from "./types";

/**
 * Everything you have done in one room, searchable.
 *
 * Recent attempts used to be a short list at the very foot of each practice screen, below the
 * drills and the coach, which put the record of your own work in the least visited part of the
 * page and capped it at whatever fitted. It is reached from a button in the header now and it
 * shows all of it.
 *
 * The filters come from the rows rather than from a fixed list, so a screen that has never
 * produced a mock does not offer a Full test filter that can only ever return nothing.
 */

export interface HistoryViewProps {
  rows: HistoryRow[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Shown when the learner has genuinely never done anything here. */
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
}

export function HistoryView({
  rows,
  loading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: HistoryViewProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<HistoryKind | "all">("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const kinds = useMemo(() => {
    const present = new Set(rows.map((r) => r.kind));
    return (["mock", "practice", "drill", "coach"] as HistoryKind[]).filter((k) =>
      present.has(k),
    );
  }, [rows]);

  const shown = useMemo(() => {
    const filtered = rows.filter(
      (row) => (kind === "all" || row.kind === kind) && matchesQuery(row, query),
    );
    return sortRows(filtered, sort);
  }, [rows, kind, query, sort]);

  if (error) {
    return (
      <EmptyState
        title="Your history could not be loaded"
        description={error}
        action={onRetry ? <Button onClick={onRetry}>Try again</Button> : undefined}
      />
    );
  }

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-[12rem] flex-1"
          aria-label="Search your history"
          placeholder="Search by title, topic or score…"
          value={query}
          onChange={setQuery}
        />
        <Select
          size="sm"
          aria-label="Sort"
          className="w-[11rem]"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({
            value: k,
            label: SORT_LABEL[k],
          }))}
        />
      </div>

      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...kinds] as const).map((k) => {
            const on = kind === k;
            const count = k === "all" ? rows.length : rows.filter((r) => r.kind === k).length;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setKind(k as HistoryKind | "all")}
                className={cn(
                  "rounded-full border px-3 py-1 text-[13px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {k === "all" ? "Everything" : KIND_LABEL[k as HistoryKind]}
                <span className="ml-1.5 tabular text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[13px] text-muted-foreground">
        {shown.length === rows.length
          ? `${rows.length} ${rows.length === 1 ? "attempt" : "attempts"}`
          : `${shown.length} of ${rows.length} shown`}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          title="Nothing matches that"
          description="No attempt here matches what you typed. Clear the search, or pick a different filter."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setKind("all");
              }}
            >
              Clear the search
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => (
            <HistoryRowItem key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The status line's colour.
 *
 * `statusTone` is the one field on `HistoryRow` that says how a row *went* rather than what
 * it was, and every adapter sets it. Left unrendered it was four rooms' worth of careful
 * wording flattened into the same grey, so an unmarked essay and a scored paper read alike
 * at a glance. `default` stays inherited: most rows are ordinary and colouring all of them
 * would say nothing.
 */
const STATUS_TONE: Record<NonNullable<HistoryRow["statusTone"]>, string> = {
  default: "",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

function HistoryRowItem({ row }: { row: HistoryRow }) {
  const navigate = useNavigate();
  const open = row.href ? () => navigate(row.href as string) : undefined;

  const score =
    typeof row.band === "number"
      ? `Band ${row.band.toFixed(1)}`
      : typeof row.correct === "number" && row.outOf
        ? `${row.correct} of ${row.outOf}`
        : null;

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="outline">{KIND_LABEL[row.kind]}</Badge>
          <span className="truncate text-[14px] font-medium text-foreground">{row.title}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
          <span>{row.startedAt ? formatDate(row.startedAt) : "Date not recorded"}</span>
          {typeof row.durationS === "number" && row.durationS > 0 && (
            <span>· {formatDuration(row.durationS)}</span>
          )}
          <span>
            ·{" "}
            <span className={cn("font-medium", STATUS_TONE[row.statusTone ?? "default"])}>
              {row.statusLabel}
            </span>
          </span>
          {!row.href && row.unopenableReason && <span>· {row.unopenableReason}</span>}
        </span>
      </span>
      {score && (
        <span className="tabular shrink-0 text-[14px] font-semibold text-foreground">{score}</span>
      )}
      {row.href && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </>
  );

  return (
    <li>
      {open ? (
        <button
          type="button"
          onClick={open}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {body}
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-3">
          {body}
        </div>
      )}
    </li>
  );
}

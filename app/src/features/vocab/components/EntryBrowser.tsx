import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  PauseCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Select,
  Skeleton,
  useConfirm,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import {
  POS_LABELS,
  POS_VALUES,
  STATUS_META,
  TOPIC_TAGS,
  formatDue,
  isPendingDefinition,
  topicLabel,
} from "../labels";
import { DEFAULT_FILTERS, useVocabStore } from "../store";
import type { VocabEntry, VocabStatus } from "../types";
import { AddEntryModal } from "./AddEntryModal";
import { EntryDetailDrawer } from "./EntryDetailDrawer";

const STATUS_OPTIONS = [
  { value: "all", label: "Every status" },
  { value: "active", label: "Active" },
  { value: "suggested", label: "Suggested" },
  { value: "suspended", label: "Suspended" },
  { value: "known", label: "Known" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "alpha", label: "A → Z" },
  { value: "due", label: "Due soonest" },
];

const POS_OPTIONS = [
  { value: "", label: "Any part of speech" },
  ...POS_VALUES.map((pos) => ({ value: pos, label: POS_LABELS[pos] ?? pos })),
];

const TOPIC_OPTIONS = [
  { value: "", label: "Any topic" },
  ...TOPIC_TAGS.map((tag) => ({ value: tag, label: topicLabel(tag) })),
];

/** The bank: search, filter, inspect, and act on many entries at once. */
export function EntryBrowser() {
  const confirm = useConfirm();
  const filters = useVocabStore((s) => s.filters);
  const setFilters = useVocabStore((s) => s.setFilters);
  const entries = useVocabStore((s) => s.entries);
  const cursor = useVocabStore((s) => s.entriesCursor);
  const loading = useVocabStore((s) => s.entriesLoading);
  const loadingMore = useVocabStore((s) => s.entriesLoadingMore);
  const error = useVocabStore((s) => s.entriesError);
  const load = useVocabStore((s) => s.loadEntries);
  const loadMore = useVocabStore((s) => s.loadMoreEntries);
  const selection = useVocabStore((s) => s.selection);
  const toggleSelected = useVocabStore((s) => s.toggleSelected);
  const setSelection = useVocabStore((s) => s.setSelection);
  const clearSelection = useVocabStore((s) => s.clearSelection);
  const bulkSetStatus = useVocabStore((s) => s.bulkSetStatus);
  const bulkDelete = useVocabStore((s) => s.bulkDelete);
  const openDetail = useVocabStore((s) => s.openDetail);

  const [search, setSearch] = useState(filters.query);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (search !== filters.query) setFilters({ query: search });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [filters.query, search, setFilters]);

  useEffect(() => {
    void load();
  }, [filters.query, filters.status, filters.pos, filters.topic, filters.sort, load]);

  const filtered = useMemo(
    () => filters.query || filters.status !== "all" || filters.pos || filters.topic,
    [filters],
  );

  const allSelected = entries.length > 0 && selection.length === entries.length;

  const runBulk = async (action: () => Promise<number>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${pluralize(selection.length, "word")}?`,
      message:
        "The entries, their scheduling and their review history are removed for good. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) await runBulk(bulkDelete);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search headword or definition"
            aria-label="Search your vocabulary bank"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select
            value={filters.status}
            onChange={(value) => setFilters({ status: value as VocabStatus | "all" })}
            options={STATUS_OPTIONS}
          />
          <Select value={filters.pos} onChange={(pos) => setFilters({ pos })} options={POS_OPTIONS} />
          <Select
            value={filters.topic}
            onChange={(topic) => setFilters({ topic })}
            options={TOPIC_OPTIONS}
          />
          <Select
            value={filters.sort}
            onChange={(sort) => setFilters({ sort: sort as typeof filters.sort })}
            options={SORT_OPTIONS}
          />
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <Plus className="h-4 w-4" />
          Add a word
        </Button>
      </div>

      {selection.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="text-[13px] font-medium">
            {pluralize(selection.length, "word")} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void runBulk(() => bulkSetStatus("suspended"))}>
              <PauseCircle className="h-4 w-4" />
              Suspend
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void runBulk(() => bulkSetStatus("known"))}>
              <CheckCircle2 className="h-4 w-4" />
              Mark known
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void runBulk(() => bulkSetStatus("active"))}>
              <RotateCcw className="h-4 w-4" />
              Resume
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void onDelete()}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            Retry
          </Button>
        </p>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filtered ? "No words match those filters" : "Your vocabulary bank is empty"}
          description={
            filtered
              ? "Try a shorter search, or clear the status and topic filters."
              : "Accept a suggestion, opt into a study deck, or add a word yourself — nothing is added automatically."
          }
          action={
            filtered ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setFilters({ ...DEFAULT_FILTERS });
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" />
                Add a word
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[54rem] text-left text-[13px]">
                <caption className="sr-only">Your vocabulary bank</caption>
                <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() =>
                          allSelected ? clearSelection() : setSelection(entries.map((e) => e.id))
                        }
                        aria-label={allSelected ? "Clear selection" : "Select every loaded word"}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">Word</th>
                    <th scope="col" className="px-3 py-2 font-medium">Definition</th>
                    <th scope="col" className="px-3 py-2 font-medium">Topics</th>
                    <th scope="col" className="px-3 py-2 font-medium">CEFR</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 font-medium">Due</th>
                    <th scope="col" className="px-3 py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      selected={selection.includes(entry.id)}
                      onToggle={() => toggleSelected(entry.id)}
                      onOpen={() => void openDetail(entry.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {cursor && (
              <div className="border-t border-border p-3 text-center">
                <Button variant="outline" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                  Load more
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AddEntryModal open={adding} onClose={() => setAdding(false)} />
      <EntryDetailDrawer />
    </div>
  );
}

function EntryRow({
  entry,
  selected,
  onToggle,
  onOpen,
}: {
  entry: VocabEntry;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const status = STATUS_META[entry.status];
  return (
    <tr className={cn("border-b border-border last:border-0", selected && "bg-primary/5")}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${entry.headword}`}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {entry.headword}
          <span className="ml-2 text-[11px] font-normal italic text-muted-foreground">
            {POS_LABELS[entry.pos] ?? entry.pos}
          </span>
        </button>
      </td>
      <td className="max-w-[22rem] truncate px-3 py-2 text-muted-foreground" title={entry.definition}>
        {isPendingDefinition(entry.definition) ? (
          <span className="italic">being filled in…</span>
        ) : (
          entry.definition
        )}
      </td>
      <td className="px-3 py-2">
        <span className="flex flex-wrap gap-1">
          {entry.topic_tags.slice(0, 2).map((tag) => (
            <Badge key={tag} tone="outline" className="font-normal">
              {topicLabel(tag)}
            </Badge>
          ))}
          {entry.topic_tags.length > 2 && (
            <span className="text-[11px] text-muted-foreground">
              +{entry.topic_tags.length - 2}
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{entry.cefr_level ?? "—"}</td>
      <td className="px-3 py-2">
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {entry.status === "active" ? formatDue(entry.srs?.due) : "—"}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{entry.source?.module ?? "—"}</td>
    </tr>
  );
}

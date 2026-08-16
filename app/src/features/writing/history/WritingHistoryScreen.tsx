/**
 * `/writing/history` — everything you have written here, in one searchable list.
 *
 * The writing desk kept its record in a tab called "Your attempts", forty rows deep at most,
 * with the mock sittings in a separate short list at the foot of the pre-flight screen. Two
 * partial lists in two places is how a learner ends up believing an essay was lost. This
 * screen is the whole record — practice, redrafts and sittings together — and the desk's
 * header links to it.
 *
 * The screen owns nothing but the fetch: search, filters, sort and the empty states all
 * belong to the shared `HistoryView`, so writing reads the same as the other three rooms.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { HistoryView, type HistoryRow } from "@/components/practice/history";
import { api } from "@/lib/api";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { message, type AttemptSummary } from "../store";
import { readMockRecords } from "../components/mock/store";
import { buildWritingHistory, type WritingMockSession } from "./rows";

const ATTEMPTS = "/api/v1/writing/attempts";
const MOCK_SESSIONS = "/api/v1/writing/mock/sessions";

/** One page is 200 rows; five pages is more essays than anyone will write on one machine. */
const PAGE = 200;
const MAX_PAGES = 5;

async function fetchAllAttempts(): Promise<AttemptSummary[]> {
  const all: AttemptSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (cursor) params.set("cursor", cursor);
    const res = await api.get<{ items?: AttemptSummary[]; next_cursor?: string | null }>(
      `${ATTEMPTS}?${params.toString()}`,
    );
    all.push(...(res.items ?? []));
    cursor = res.next_cursor ?? null;
    if (!cursor) break;
  }
  return all;
}

/**
 * Sittings the sidecar recorded itself. Nothing in this app writes them, so an error here
 * is never worth failing the screen over — the attempts are the record that matters.
 */
async function fetchServerMocks(): Promise<WritingMockSession[]> {
  try {
    const res = await api.get<{ items?: WritingMockSession[] }>(`${MOCK_SESSIONS}?limit=100`);
    return res.items ?? [];
  } catch {
    return [];
  }
}

export function useWritingHistoryRows() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const attempts = await fetchAllAttempts();
      const serverMocks = await fetchServerMocks();
      setRows(buildWritingHistory({ attempts, mocks: readMockRecords(), serverMocks }));
      setError(null);
    } catch (err) {
      setRows([]);
      setError(message(err, "Your writing history could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A screen that failed while the sidecar was still launching must not stay on its error
  // card once it answers (12 §9).
  useSidecarRecovery(() => void load());

  return { rows, loading, error, reload: load };
}

export function WritingHistoryScreen() {
  const navigate = useNavigate();
  const { rows, loading, error, reload } = useWritingHistoryRows();

  return (
    <PageShell
      title="Your writing history"
      description="Every answer you have written here — practice, redrafts and mock papers — kept on this machine."
      back={{ to: "/writing", label: "Writing" }}
      onRefresh={() => void reload()}
      refreshing={loading}
      refreshLabel="Reload your writing history"
    >
      <HistoryView
        rows={rows}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        emptyTitle="You have not written anything yet"
        emptyDescription="Every answer you start is saved here, marked or not, so you can reread it, redraft it and watch the bands move."
        emptyAction={<Button onClick={() => navigate("/writing")}>Pick a prompt</Button>}
      />
    </PageShell>
  );
}

export default WritingHistoryScreen;

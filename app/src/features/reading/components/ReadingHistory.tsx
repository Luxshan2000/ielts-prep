/**
 * `/reading/history` — everything reading has ever recorded for this learner, searchable.
 *
 * The screen itself is `HistoryView`, shared with the other three skills; this component
 * is the wiring — fetch, map, retry, and the one empty state only reading can word. Every
 * decision about how a row *looks* belongs to the view and every decision about what a
 * reading record *means* belongs to `../history.ts`, so this file stays a shell on purpose.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HistoryView, type HistoryRow } from "@/components/practice/history";
import { Button } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { friendlyMessage } from "@/lib/errors";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { fetchReadingHistory } from "../history";

export function ReadingHistory() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchReadingHistory());
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, "The reading history could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A screen that failed while the sidecar was down must not stay stuck on its error
  // card after it comes back (12 §9).
  useSidecarRecovery(() => void load());

  return (
    <PageShell
      title="Your reading history"
      description="Every test, passage and drill you have sat, with the search and the filters over all of it."
      back={{ to: "/reading", label: "Reading" }}
      onRefresh={() => void load()}
      refreshing={loading}
      refreshLabel="Reload your reading history"
    >
      <HistoryView
        rows={rows}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyTitle="You have not sat any reading yet"
        emptyDescription="Full tests, single passages and question drills all land here once you finish one — including the ones you leave half done."
        emptyAction={<Button onClick={() => navigate("/reading")}>Open the reading library</Button>}
      />
    </PageShell>
  );
}

export default ReadingHistory;

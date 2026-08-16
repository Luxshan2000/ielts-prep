/**
 * `/listening/history` — everything this learner has done in the listening room.
 *
 * The screen itself is deliberately thin. Search, the filter chips, the sort, the
 * no-results state and the never-started state all belong to `HistoryView`, which every
 * skill shares; what lives here is the fetch, the empty-state wording that only listening
 * can write, and the warning that appears when one of the three ledgers did not answer.
 */

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui";
import { HistoryView } from "@/components/practice/history";
import { PageShell } from "@/components/shell/PageShell";
import { useListeningHistory } from "./useListeningHistory";

export function ListeningHistory() {
  const navigate = useNavigate();
  const { rows, loading, error, partial, reload } = useListeningHistory();

  return (
    <PageShell
      title="Listening history"
      description="Every test, mock paper and drill you have taken here, searchable."
      back={{ to: "/listening", label: "Listening" }}
      onRefresh={reload}
      refreshing={loading}
      refreshLabel="Reload your listening history"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4">
        {partial && (
          <p
            role="status"
            className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[13px] text-foreground"
          >
            {partial}
          </p>
        )}
        <HistoryView
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="Nothing here yet"
          emptyDescription="Every test, single part, mock paper and drill you finish is kept, with its score and its transcript. Sit one and it appears here."
          emptyAction={<Button onClick={() => navigate("/listening")}>Back to Listening</Button>}
        />
      </div>
    </PageShell>
  );
}

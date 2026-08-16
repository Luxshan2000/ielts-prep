/**
 * `/speaking/history` — everything this room has recorded, in one searchable list.
 *
 * The screen itself is the shared `HistoryView`; this file is only the adapter around
 * it. It replaces the "Recent sessions" strip that used to sit at the very bottom of
 * the hub, below the topic coach, where it was capped at whatever fitted and where a
 * session with no report could not be opened at all.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { HistoryView } from "@/components/practice/history";
import { formatBand } from "@/lib/format";
import { describeError } from "../components/phases";
import { fetchSpeakingHistory, type SpeakingHistoryDoc } from "./api";
import { toHistoryRows } from "./rows";

export function SpeakingHistoryPage() {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<SpeakingHistoryDoc>({
    sessions: [],
    mocks: [],
    drills: [],
    cardTitles: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDoc(await fetchSpeakingHistory());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => toHistoryRows(doc.sessions, doc.mocks, doc.drills, doc.cardTitles),
    [doc],
  );

  const bands = rows
    .map((row) => row.band)
    .filter((band): band is number => typeof band === "number");
  const best = bands.length > 0 ? Math.max(...bands) : null;

  return (
    <PageShell
      title="Speaking history"
      description={
        rows.length === 0
          ? "Every session you have spoken here."
          : `${rows.length} session${rows.length === 1 ? "" : "s"}${
              bands.length > 0
                ? ` · ${bands.length} scored · best ${formatBand(best as number)}`
                : " · none scored yet"
            }`
      }
      back={{ to: "/speaking", label: "Speaking" }}
      onRefresh={() => void load()}
      refreshing={loading}
      refreshLabel="Reload your speaking history"
      actions={
        <Button size="sm" onClick={() => navigate("/speaking")}>
          <Mic className="h-4 w-4" />
          Start a session
        </Button>
      }
    >
      <div className="space-y-4">
        <HistoryView
          rows={rows}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          emptyTitle="You haven't spoken here yet"
          emptyDescription="Every session is kept — the conversation, the timings, and the band when the mode is one that gets marked. Start a quick chat to put something in here."
          emptyAction={<Button onClick={() => navigate("/speaking")}>Go to the Speaking room</Button>}
        />
        {bands.length > 0 && (
          <p className="text-[12px] leading-6 text-muted-foreground">
            Bands are AI estimates and move by up to a band between sessions even when nothing
            about your English has changed. Only full mocks and single parts are marked at all;
            drills and chats are kept for the conversation, not for a score.
          </p>
        )}
      </div>
    </PageShell>
  );
}

export default SpeakingHistoryPage;

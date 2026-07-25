import { useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Play } from "lucide-react";
import { Badge, Button, TabPanel, Tabs } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { DecksPanel } from "./components/DecksPanel";
import { EntryBrowser } from "./components/EntryBrowser";
import { ReviewOverview } from "./components/ReviewOverview";
import { StatsPanel } from "./components/StatsPanel";
import { SuggestionsInbox } from "./components/SuggestionsInbox";
import { useVocabStore } from "./store";

export type VocabTab = "review" | "inbox" | "browse" | "decks" | "stats";

const TAB_VALUES: VocabTab[] = ["review", "inbox", "browse", "decks", "stats"];

/**
 * The vocabulary bank. Five views over one bank: what is due, what is waiting for
 * a decision, everything you have, the decks you can opt into, and how it is going.
 */
export function VocabPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: VocabTab = TAB_VALUES.includes(raw as VocabTab) ? (raw as VocabTab) : "review";

  const stats = useVocabStore((s) => s.stats);
  const loadStats = useVocabStore((s) => s.loadStats);
  const loadSuggestions = useVocabStore((s) => s.loadSuggestions);
  const startSession = useVocabStore((s) => s.startSession);
  const sessionLoading = useVocabStore((s) => s.session.loading);

  // Counters drive the tab badges and the sidebar due badge — load them once here.
  useEffect(() => {
    void loadStats();
    void loadSuggestions();
  }, [loadStats, loadSuggestions]);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card after it comes back (12 §9).
  useSidecarRecovery(() => {
    void loadStats();
    void loadSuggestions();
  });

  const setTab = useCallback(
    (next: string) => {
      const search = new URLSearchParams(params);
      if (next === "review") search.delete("tab");
      else search.set("tab", next);
      setParams(search, { replace: true });
    },
    [params, setParams],
  );

  const due = stats?.due_today ?? 0;
  const suggested = stats?.counts.suggested ?? 0;

  const start = async () => {
    await startSession();
    navigate("/vocab/review");
  };

  return (
    <PageShell
      title="Vocabulary"
      description="Your own words, scheduled by FSRS — nothing is added to the queue without you."
      actions={
        due > 0 ? (
          <Button onClick={() => void start()} loading={sessionLoading}>
            <Play className="h-4 w-4" />
            Review {due}
          </Button>
        ) : undefined
      }
      toolbar={
        <Tabs
          value={tab}
          onChange={setTab}
          aria-label="Vocabulary sections"
          items={[
            { value: "review", label: "Review", badge: due > 0 ? due : undefined },
            {
              value: "inbox",
              label: "Inbox",
              badge:
                suggested > 0 ? <Badge tone="warning">{suggested}</Badge> : undefined,
            },
            { value: "browse", label: "Browse" },
            { value: "decks", label: "Decks" },
            { value: "stats", label: "Stats" },
          ]}
        />
      }
    >
      <TabPanel value="review" active={tab === "review"}>
        <ReviewOverview onOpenTab={setTab} />
      </TabPanel>
      <TabPanel value="inbox" active={tab === "inbox"}>
        <SuggestionsInbox />
      </TabPanel>
      <TabPanel value="browse" active={tab === "browse"}>
        <EntryBrowser />
      </TabPanel>
      <TabPanel value="decks" active={tab === "decks"}>
        <DecksPanel />
      </TabPanel>
      <TabPanel value="stats" active={tab === "stats"}>
        <StatsPanel />
      </TabPanel>
    </PageShell>
  );
}

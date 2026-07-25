/**
 * Writing Desk (05-writing-module.md). `/writing` is the hub — prompt bank, your
 * attempts, and the frameworks library; the attempt editor and its report live at
 * `/writing/attempt/:attemptId` and render through the outlet.
 */

import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useOutlet } from "react-router-dom";
import { AlertTriangle, PenLine } from "lucide-react";
import { Badge, Button, Tabs, TabPanel } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { useSessionStore } from "@/stores";
import { AttemptHistory } from "./components/AttemptHistory";
import { PromptBrowser } from "./components/PromptBrowser";
import { TemplatesPanel } from "./components/TemplatesPanel";
import { TASK_SHORT, useWritingStore } from "./store";

type TabValue = "bank" | "attempts" | "templates";

/**
 * Layout element for `/writing`. React Router renders child routes through the
 * outlet; when there is no child, this is the hub.
 */
export function WritingLayout() {
  const outlet = useOutlet();
  return outlet ? <Outlet /> : <WritingHome />;
}

export function WritingHome() {
  const navigate = useNavigate();
  const offline = useSessionStore((s) => s.offline);
  const [tab, setTab] = useState<TabValue>("bank");

  const history = useWritingStore((s) => s.history);
  const loadHistory = useWritingStore((s) => s.loadHistory);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card after it comes back (12 §9).
  useSidecarRecovery(() => void loadHistory());

  const resumable = useMemo(
    () => history.find((attempt) => attempt.status === "draft" && attempt.word_count > 0) ?? null,
    [history],
  );

  const scored = useMemo(() => history.filter((a) => a.status === "scored"), [history]);
  const lastBand = scored.length > 0 ? scored[0].overall_band : null;

  return (
    <PageShell
      title="Writing"
      description="Unlimited Task 1 and Task 2 practice, marked against the four official criteria."
      actions={
        lastBand !== null ? (
          <Badge tone="primary">Last marked answer: band {lastBand.toFixed(1)}</Badge>
        ) : undefined
      }
      toolbar={
        <Tabs
          aria-label="Writing sections"
          value={tab}
          onChange={(value) => setTab(value as TabValue)}
          items={[
            { value: "bank", label: "Prompt bank" },
            { value: "attempts", label: "Your attempts", badge: history.length || undefined },
            { value: "templates", label: "Frameworks" },
          ]}
        />
      }
    >
      <div className="space-y-5">
        {offline && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-[13px] text-muted-foreground">
              The practice engine isn't responding, so prompts and marking are unavailable. It may
              still be launching — retry in a few seconds.
            </p>
          </div>
        )}

        {resumable && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
            <p className="flex items-center gap-2 text-[13px] text-foreground">
              <PenLine className="h-4 w-4 text-primary" aria-hidden="true" />
              You have an unfinished {TASK_SHORT[resumable.prompt?.task_type ?? "task2"]} draft —{" "}
              <span className="tabular">{resumable.word_count} words</span> so far.
            </p>
            <Button size="sm" onClick={() => navigate(`/writing/attempt/${resumable.id}`)}>
              Resume draft
            </Button>
          </div>
        )}

        <TabPanel value="bank" active={tab === "bank"}>
          <PromptBrowser />
        </TabPanel>

        <TabPanel value="attempts" active={tab === "attempts"}>
          <AttemptHistory />
        </TabPanel>

        <TabPanel value="templates" active={tab === "templates"}>
          <TemplatesPanel />
        </TabPanel>
      </div>
    </PageShell>
  );
}

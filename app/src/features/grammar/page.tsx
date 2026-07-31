/**
 * `/grammar` — three views over one syllabus.
 *
 * **Path** is where a beginner lands and it is the default for a reason: the
 * first thing this module has to do is make the next step obvious. **Progress**
 * is where a plateaued learner lands, because their question is not "what level
 * am I" but "what keeps costing me marks". **Phrases** is the sentence-level
 * vocabulary surface — see `PhrasesScreen` for how it divides from `/vocab`.
 *
 * The lessons, the practice session and the contrast boards are their own routes
 * one level down: each is a room you go into and come out of, and none of them
 * should be sharing a header with a tab strip.
 */

import { useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GraduationCap, Play } from "lucide-react";
import { Badge, Button, EmptyState, TabPanel, Tabs } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { PathScreen } from "./components/PathScreen";
import { PhrasesScreen } from "./components/PhrasesScreen";
import { ProgressScreen } from "./components/ProgressScreen";
import { useGrammarStore } from "./store";

export type GrammarTab = "path" | "progress" | "phrases";

const TAB_VALUES: GrammarTab[] = ["path", "progress", "phrases"];

/**
 * The honest screen for a build whose sidecar has no grammar routes, or whose
 * content pack carries no grammar file. Not an error — there is nothing here yet
 * and nothing the learner did caused that.
 */
function ModuleMissing() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={GraduationCap}
      title="The grammar syllabus is not in this build yet"
      description="Nothing is broken and nothing you have done is lost. When a content pack with the grammar lessons is installed, the whole path appears here — sequenced so that a complete beginner can start at the first lesson and work forward."
      action={<Button onClick={() => navigate("/settings")}>Check your content packs</Button>}
    />
  );
}

export function GrammarPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: GrammarTab = TAB_VALUES.includes(raw as GrammarTab) ? (raw as GrammarTab) : "path";

  const missing = useGrammarStore((s) => s.missing);
  const path = useGrammarStore((s) => s.path);
  const loadPath = useGrammarStore((s) => s.loadPath);

  // The due counter drives the header button on every tab, so it loads here
  // rather than inside the path view.
  useEffect(() => {
    void loadPath();
  }, [loadPath]);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card once it comes back.
  useSidecarRecovery(() => {
    void loadPath(true);
  });

  const setTab = useCallback(
    (next: string) => {
      const search = new URLSearchParams(params);
      if (next === "path") search.delete("tab");
      else search.set("tab", next);
      setParams(search, { replace: true });
    },
    [params, setParams],
  );

  const due = path?.summary?.due_now ?? 0;
  const costing = path?.summary?.harvested_codes ?? 0;

  return (
    <PageShell
      title="Grammar & Usage"
      description="The language underneath the four skills — taught in an order where nothing depends on something you have not met yet."
      actions={
        !missing && due > 0 ? (
          <Button onClick={() => navigate("/grammar/practice")}>
            <Play className="h-4 w-4" />
            Practise {due}
          </Button>
        ) : undefined
      }
      toolbar={
        missing ? undefined : (
          <Tabs
            value={tab}
            onChange={setTab}
            aria-label="Grammar sections"
            items={[
              { value: "path", label: "Path" },
              {
                value: "progress",
                label: "Progress",
                badge: costing > 0 ? <Badge tone="warning">{costing}</Badge> : undefined,
              },
              { value: "phrases", label: "Phrases" },
            ]}
          />
        )
      }
    >
      {missing ? (
        <ModuleMissing />
      ) : (
        <>
          <TabPanel value="path" active={tab === "path"}>
            <PathScreen />
          </TabPanel>
          <TabPanel value="progress" active={tab === "progress"}>
            <ProgressScreen />
          </TabPanel>
          <TabPanel value="phrases" active={tab === "phrases"}>
            <PhrasesScreen />
          </TabPanel>
        </>
      )}
    </PageShell>
  );
}

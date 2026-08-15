/**
 * The reading coach — `/reading/coach/:passageId`.
 *
 * One passage, studied. The passage itself is permanently on the left, because in a
 * receptive skill every single thing the coach says is a claim about a specific
 * stretch of text: the map labels a paragraph, the strategy names where to start,
 * the paraphrase link points at a phrase, and the worked solution highlights the
 * exact span the answer came from. Teaching any of that in a panel the text is not
 * visible from would be teaching it in the abstract.
 *
 * The tabs on the right mirror the speaking and writing coaches so the three halves
 * of the app feel like one product, and the gate works the same way it does there —
 * with one difference that matters. Writing gates its model answers because reading
 * one early produces a memorised template. Reading gates its solutions because there
 * is nothing to imitate at all: once you have seen which sentence held the answer,
 * the passage is spent.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GraduationCap, Lock, PencilLine } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
  TabPanel,
  Tabs,
  type TabItem,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { PassagePane, type LocateRequest } from "../PassagePane";
import { activeSitting, useMockStore } from "../mock/store";
import { useReadingStore } from "../../store";
import { MapPanel } from "./MapPanel";
import { ParaphrasePanel } from "./ParaphrasePanel";
import { SolutionsPanel, SolutionGate, GATE_REASON } from "./SolutionsPanel";
import { StrategyPanel } from "./StrategyPanel";
import { VocabPanel } from "./VocabPanel";
import { useCoachStore } from "./store";
import { hasTeaching, solutionRows } from "./types";

type CoachTab = "map" | "strategy" | "solutions" | "paraphrase" | "vocabulary";

const EXAM_CONDITIONS_REASON =
  "You have a mock paper open. Every coaching surface is shut until the hour is over — a mock you can read a solution during is not a mock.";

export function ReadingCoach() {
  const { passageId = "" } = useParams<{ passageId: string }>();
  const navigate = useNavigate();

  const slot = useCoachStore((s) => s.slots[passageId]);
  const loadPassage = useCoachStore((s) => s.loadPassage);
  const syncAttempt = useCoachStore((s) => s.syncAttempt);

  const mockRecords = useMockStore((s) => s.records);
  const loadMockRecords = useMockStore((s) => s.loadRecords);

  const startAttempt = useReadingStore((s) => s.startAttempt);
  const [starting, setStarting] = useState(false);
  const [tab, setTab] = useState<CoachTab>("map");
  const [locate, setLocate] = useState<LocateRequest | null>(null);

  useEffect(() => {
    void loadPassage(passageId);
    loadMockRecords();
  }, [loadMockRecords, loadPassage, passageId]);

  // Coming back from an attempt, the ledger has moved on and the gate with it.
  useEffect(() => {
    syncAttempt(passageId);
  }, [passageId, syncAttempt]);

  // A screen that failed while the sidecar was down must not stay on its error card.
  useSidecarRecovery(() => void loadPassage(passageId, { force: true }));

  const examConditions = useMemo(() => activeSitting(mockRecords) !== null, [mockRecords]);

  const onLocate = useCallback((paragraphId: string, quote?: string | null) => {
    setLocate({ paragraphId: paragraphId || null, quote: quote ?? null, nonce: Date.now() });
  }, []);

  const practise = useCallback(async () => {
    setStarting(true);
    const attemptId = await startAttempt({
      mode: "passage",
      passage_id: passageId,
      exam_conditions: false,
    });
    setStarting(false);
    if (attemptId) navigate(`/reading/attempt/${attemptId}`);
  }, [navigate, passageId, startAttempt]);

  const passage = slot?.passage ?? null;
  const rows = useMemo(() => solutionRows(passage), [passage]);
  const status = slot?.status ?? "idle";

  // ---------------------------------------------------------------- loading ---

  if (status === "idle" || status === "loading") {
    return (
      <PageShell
        title="Reading coach"
        description="Opening this passage and its teaching payload."
        back={{ to: "/reading", label: "Reading" }}
      >
        <div className="space-y-4">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      </PageShell>
    );
  }

  // ------------------------------------------------------------------ error ---

  if (status === "error" || !passage) {
    return (
      <PageShell title="Reading coach" back={{ to: "/reading", label: "Reading" }}>
        <Card>
          <CardContent className="pt-5">
            <ErrorState
              error={slot?.error}
              title="This passage could not be opened"
              onRetry={() => void loadPassage(passageId, { force: true })}
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const teaching = passage.teaching ?? null;
  const record = slot?.attempt ?? null;
  const attempted = record !== null;
  /**
   * Unlocked means three things at once: the learner has sat this passage, no mock
   * is open, and the document that arrived actually carries the key. The third is
   * what stops an optimistic ledger entry from opening an empty tab.
   */
  const unlocked = attempted && !examConditions && Boolean(slot?.keyed);
  const gateReason = examConditions
    ? EXAM_CONDITIONS_REASON
    : (slot?.serverLocked ?? GATE_REASON);
  const lockIcon = <Lock className="h-3 w-3" aria-label="Locked" />;

  const tabs: TabItem<CoachTab>[] = [
    { value: "map", label: "The map" },
    { value: "strategy", label: "Strategy" },
    {
      value: "solutions",
      label: "Worked solutions",
      badge: unlocked ? rows.length : lockIcon,
    },
    { value: "paraphrase", label: "Paraphrase" },
    { value: "vocabulary", label: "Vocabulary" },
  ];

  const taught = hasTeaching(passage);

  return (
    <PageShell
      bleed
      maxWidth="max-w-none"
      title={passage.title ?? slot?.title ?? "Reading coach"}
      description="Study one passage: how to read it, how to attack each question type, and — once you have answered — exactly where every answer was."
      back={{ to: "/reading", label: "Reading" }}
      status={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="outline">
            {slot?.format === "general_training" ? "General Training" : "Academic"}
          </Badge>
          {attempted && (
            <Badge tone="success">
              {record.correct}/{record.total} when you sat it
            </Badge>
          )}
          {examConditions && <Badge tone="warning">Mock in progress</Badge>}
        </div>
      }
      actions={
        <Button
          size="sm"
          loading={starting}
          disabled={examConditions}
          onClick={() => void practise()}
        >
          <PencilLine className="h-4 w-4" aria-hidden="true" />
          {attempted ? "Sit it again" : "Answer this passage"}
        </Button>
      }
      toolbar={
        <Tabs
          aria-label="Reading coach sections"
          items={tabs}
          value={tab}
          onChange={(value) => setTab(value)}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        {/* The passage, permanently. Every panel on the right points at it. */}
        <div className="min-h-0 max-h-[45vh] border-b border-border lg:max-h-none lg:w-[44%] lg:border-b-0 lg:border-r">
          <PassagePane
            passage={passage}
            highlights={[]}
            notes={{}}
            toolsEnabled={false}
            lookupEnabled={!examConditions}
            locate={locate}
          />
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {examConditions && (
            <div
              role="status"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/8 p-3"
            >
              <p className="text-[13px] leading-6 text-muted-foreground">
                A mock paper is open, so the worked solutions and the paraphrase links are shut
                until it is finished. The clock is still running.
              </p>
              <Button size="sm" variant="outline" onClick={() => navigate("/reading/mock")}>
                Back to the sitting
              </Button>
            </div>
          )}

          {!taught && (
            <Card className="mb-4">
              <CardContent className="pt-5">
                <EmptyState
                  icon={GraduationCap}
                  title="No teaching payload on this passage"
                  description="This passage was authored before the reading teaching payload existed, or this build's content pack predates it. The passage, the questions and the marking all work exactly the same — there is simply nothing here to explain them with."
                  action={
                    <Button loading={starting} onClick={() => void practise()}>
                      Answer it anyway
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          )}

          <TabPanel value="The map" active={tab === "map"}>
            <MapPanel
              passageId={passageId}
              passage={passage}
              teaching={teaching}
              onLocate={onLocate}
            />
          </TabPanel>

          <TabPanel value="Strategy" active={tab === "strategy"}>
            <StrategyPanel passage={passage} teaching={teaching} />
          </TabPanel>

          <TabPanel value="Worked solutions" active={tab === "solutions"}>
            {unlocked ? (
              <SolutionsPanel
                passageId={passageId}
                rows={rows}
                record={record}
                onLocate={onLocate}
              />
            ) : (
              <SolutionGate
                reason={gateReason}
                starting={starting}
                onPractise={examConditions ? undefined : () => void practise()}
                onMock={examConditions ? undefined : () => navigate("/reading/mock")}
              />
            )}
          </TabPanel>

          <TabPanel value="Paraphrase" active={tab === "paraphrase"}>
            <ParaphrasePanel
              teaching={teaching}
              rows={rows}
              unlocked={unlocked}
              onLocate={onLocate}
            />
          </TabPanel>

          <TabPanel value="Vocabulary" active={tab === "vocabulary"}>
            <VocabPanel
              passage={passage}
              teaching={teaching}
              record={record}
              onLocate={onLocate}
            />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}

export default ReadingCoach;

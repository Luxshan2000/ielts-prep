/**
 * The topic coach — `/speaking/coach/:cardSetId`.
 *
 * One set, five surfaces: the card, the guided prep minute, the band ladder, the
 * comparison with the learner's own attempt, and the language bank. Two of them are
 * attempt-gated; the other three are preparation material and are always open.
 *
 * The comparison needs three things that live in three different places — the card's
 * model answers (content pack), the learner's transcript (session record) and the
 * per-criterion improvements (scored report) — so it loads lazily, only when its tab
 * is first opened, and degrades to "no scored attempt yet" rather than blocking the
 * rest of the screen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookMarked, Dumbbell, GraduationCap, Lock } from "lucide-react";
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
import { TurnAudio } from "../TurnAudio";
import {
  fetchReport,
  fetchTranscript,
  useSpeakingStore,
  type SpeakingReport,
  type TranscriptTurn,
} from "../../store";
import { DrillRunner } from "../drills";
import { CardBrief } from "./CardBrief";
import { CompareWithModel, type CriterionGap } from "./CompareWithModel";
import { LanguageBankPanel } from "./LanguageBank";
import { AttemptGate, ModelAnswerViewer } from "./ModelAnswers";
import { PrepCoach } from "./PrepCoach";
import { Callout } from "./primitives";
import { attemptedSetIds, useTeachingStore } from "./store";

type CoachTab = "card" | "prep" | "model" | "compare" | "language" | "drills";

const GATE_REASON =
  "The model answers unlock once you have spoken this card. Seeing them first turns preparation into memorising, and memorised language is the one thing the descriptors will not credit.";

/** The learner's Part 2 words, joined. Falls back to everything they said. */
function part2Text(turns: TranscriptTurn[]): string {
  const mine = turns.filter((t) => t.role === "user");
  const inPart2 = mine.filter((t) => t.part === 2);
  const chosen = inPart2.length > 0 ? inPart2 : mine;
  return chosen
    .map((t) => t.text.trim())
    .filter((t) => t !== "")
    .join("\n\n");
}

function toGaps(report: SpeakingReport | null): CriterionGap[] {
  if (!report) return [];
  return (["fc", "lr", "gra", "pron"] as const)
    .map((key) => {
      const entry = report.criteria[key];
      if (!entry) return null;
      return {
        criterion: key.toUpperCase(),
        band: entry.band,
        nextActions: entry.improvements ?? [],
      };
    })
    .filter((g): g is CriterionGap => g !== null);
}

export function TopicCoach() {
  const { cardSetId = "" } = useParams<{ cardSetId: string }>();
  const navigate = useNavigate();

  const slot = useTeachingStore((s) => s.packs[cardSetId]);
  const loadPack = useTeachingStore((s) => s.loadPack);
  const rehearsed = useTeachingStore((s) => s.rehearsed);
  const markRehearsed = useTeachingStore((s) => s.markRehearsed);

  const history = useSpeakingStore((s) => s.history);
  const loadHistory = useSpeakingStore((s) => s.loadHistory);

  const [tab, setTab] = useState<CoachTab>("card");
  const [attempt, setAttempt] = useState<{
    loading: boolean;
    error: unknown;
    report: SpeakingReport | null;
    turns: TranscriptTurn[];
    sessionId: string | null;
  }>({ loading: false, error: null, report: null, turns: [], sessionId: null });

  useEffect(() => {
    void loadPack(cardSetId);
  }, [cardSetId, loadPack]);

  useEffect(() => {
    if (history.length === 0) void loadHistory();
  }, [history.length, loadHistory]);

  // Stable identity: `PrepCoach` fires this from an effect keyed on its phase, and a
  // fresh closure every render would re-run that effect on every paint.
  const onRehearsed = useCallback(() => markRehearsed(cardSetId), [cardSetId, markRehearsed]);

  const spokenSets = useMemo(() => attemptedSetIds(history), [history]);
  const attempted = spokenSets.has(cardSetId) || rehearsed.includes(cardSetId);

  /** The newest scored session on this set, if there is one. */
  const scoredSession = useMemo(
    () =>
      history.find((row) => row.card_set_id === cardSetId && Boolean(row.report_id)) ?? null,
    [cardSetId, history],
  );

  const loadAttempt = useCallback(async () => {
    if (!scoredSession?.report_id) return;
    setAttempt((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const report = await fetchReport(scoredSession.report_id);
      const turns = await fetchTranscript(report.session_id);
      setAttempt({
        loading: false,
        error: null,
        report,
        turns,
        sessionId: report.session_id,
      });
    } catch (err) {
      setAttempt({ loading: false, error: err, report: null, turns: [], sessionId: null });
    }
  }, [scoredSession?.report_id]);

  // Lazy: the comparison is the most expensive tab and the least often opened first.
  useEffect(() => {
    if (tab !== "compare") return;
    if (attempt.report || attempt.loading || attempt.error) return;
    void loadAttempt();
  }, [attempt.error, attempt.loading, attempt.report, loadAttempt, tab]);

  const status = slot?.status ?? "idle";
  const pack = slot?.pack ?? null;

  // --------------------------------------------------------------- loading ---

  if (status === "idle" || status === "loading") {
    return (
      <PageShell title="Topic coach" description="Loading this set's teaching material.">
        <div className="space-y-4">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </PageShell>
    );
  }

  // ----------------------------------------------------------------- error ---

  if (status === "error") {
    return (
      <PageShell title="Topic coach">
        <Card>
          <CardContent className="pt-5">
            <ErrorState
              error={slot?.error}
              title="This set's teaching material could not be loaded"
              onRetry={() => void loadPack(cardSetId, { force: true })}
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (status === "unavailable" || !pack) {
    return (
      <PageShell title="Topic coach">
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={GraduationCap}
              title="No teaching material for this set"
              description="This build serves the cue cards but not the teaching payload behind them. Practising the card still works, and the coach fills in once the content pack is installed."
              action={
                <Button variant="outline" onClick={() => navigate("/speaking")}>
                  Back to Speaking
                </Button>
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // ----------------------------------------------------------------- ready ---

  const part2 = pack.part2;
  const teaching = part2?.part2Teaching;
  const tags = pack.set.tags ?? [];

  const targetFunctions = [
    ...(teaching?.target_language ?? []),
    ...(pack.part3?.part3_themes ?? []).flatMap((t) => t.target_functions ?? []),
  ];

  const tabs: TabItem<CoachTab>[] = [
    { value: "card", label: "The card" },
    { value: "prep", label: "Prep minute" },
    {
      value: "model",
      label: "Model answers",
      badge: attempted ? undefined : <Lock className="h-3 w-3" aria-label="Locked" />,
    },
    {
      value: "compare",
      label: "Compare",
      badge: attempted ? undefined : <Lock className="h-3 w-3" aria-label="Locked" />,
    },
    { value: "language", label: "Language bank" },
    { value: "drills", label: "Drills" },
  ];

  const audioTurn = attempt.turns.find(
    (t) => t.role === "user" && t.part === 2 && Boolean(t.audio_file),
  );

  return (
    <PageShell
      title={pack.title}
      description={
        pack.set.teaches ?? "Everything this topic set can teach, in one place."
      }
      actions={
        <div className="flex items-center gap-2">
          {attempted && <Badge tone="success">Attempted</Badge>}
          <Button variant="ghost" size="sm" onClick={() => navigate("/speaking")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Speaking
          </Button>
        </div>
      }
      toolbar={
        <Tabs
          aria-label="Topic coach sections"
          items={tabs}
          value={tab}
          onChange={(v) => setTab(v)}
        />
      }
    >
      <TabPanel value="The card" active={tab === "card"}>
        <CardBrief set={pack.set} setTitle={pack.title} part2={part2} />
      </TabPanel>

      <TabPanel value="Prep minute" active={tab === "prep"}>
        {part2?.cue_card ? (
          <PrepCoach
            cueCard={part2.cue_card}
            prepPlan={teaching?.prep_plan}
            timePlan={teaching?.time_plan}
            recoveryMoves={teaching?.recovery_moves}
            bandMove={teaching?.band_move}
            onTurnComplete={onRehearsed}
          />
        ) : (
          <EmptyState
            icon={BookMarked}
            title="This set has no Part 2 card"
            description="The prep minute is built from a cue card's four bullets, so it needs one to scaffold."
          />
        )}
      </TabPanel>

      <TabPanel value="Model answers" active={tab === "model"}>
        <AttemptGate
          locked={!attempted}
          reason={GATE_REASON}
          onPractise={() => setTab("prep")}
        >
          {teaching ? (
            <ModelAnswerViewer
              teaching={teaching}
              cardTitle={part2?.title ?? pack.title}
              topicTags={tags}
            />
          ) : (
            <EmptyState
              icon={GraduationCap}
              title="No model answers on this set"
              description="Sets authored with the teaching payload carry the same answer at bands 6, 7 and 8."
            />
          )}
        </AttemptGate>
      </TabPanel>

      <TabPanel value="Compare" active={tab === "compare"}>
        <AttemptGate
          locked={!attempted}
          reason={GATE_REASON}
          onPractise={() => setTab("prep")}
        >
          {!teaching ? (
            <EmptyState
              icon={GraduationCap}
              title="Nothing to compare against"
              description="This set has no model answers, so there is no second column."
            />
          ) : attempt.loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : attempt.error ? (
            <ErrorState
              error={attempt.error}
              title="Your scored attempt could not be loaded"
              onRetry={() => void loadAttempt()}
            />
          ) : (
            <div className="space-y-4">
              {!scoredSession && (
                <Callout tone="info" title="No scored attempt on this set yet">
                  You have rehearsed this card, so the model is open, but the left column
                  stays empty until you run a Full Mock or a Single Part on it and it gets
                  marked. The band ladder still works without one.
                </Callout>
              )}
              <CompareWithModel
                learnerText={part2Text(attempt.turns)}
                learnerAudio={
                  attempt.sessionId && audioTurn ? (
                    <TurnAudio
                      sessionId={attempt.sessionId}
                      audioFile={audioTurn.audio_file}
                      label="Hear your answer"
                    />
                  ) : null
                }
                teaching={teaching}
                cardTitle={part2?.title ?? pack.title}
                gaps={toGaps(attempt.report)}
                pronunciationBlind={attempt.report?.pronunciation_blind ?? false}
              />
            </div>
          )}
        </AttemptGate>
      </TabPanel>

      <TabPanel value="Language bank" active={tab === "language"}>
        <LanguageBankPanel
          bank={pack.set.language_bank}
          targetFunctions={targetFunctions}
          topicTags={tags}
          setTitle={pack.title}
        />
      </TabPanel>

      <TabPanel value="Drills" active={tab === "drills"}>
        {part2 ? (
          <DrillRunner
            cardId={part2.id}
            attempted={attempted}
            onPractise={() => setTab("prep")}
          />
        ) : (
          <EmptyState
            icon={Dumbbell}
            title="This set has no Part 2 card"
            description="Drills are built from a card's pronunciation focus and error watchlist."
          />
        )}
      </TabPanel>
    </PageShell>
  );
}

export default TopicCoach;

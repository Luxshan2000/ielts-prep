/**
 * Speaking Room hub (12 §6.2 A): pick a mode, check the microphone, start.
 * The live call and the feedback report are child routes of the same feature.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  GraduationCap,
  Mic,
  Radio,
  Timer,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Tabs,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { PageShell } from "@/components/shell/PageShell";
import { HistoryButton } from "@/components/practice/history";
import { useSessionStore } from "@/stores";
import { ModePicker } from "./components/ModePicker";
import { TopicBrowser } from "./components/TopicBrowser";
import { attemptedSetIds } from "./components/teaching/store";
import { PreCallCheck } from "./components/PreCallCheck";
import { modeMeta } from "./components/phases";
import { useMockStore } from "./components/mock";
import { useSpeakingStore } from "./store";

/** Which half of the hub is showing: set a session up, or find a topic for one. */
type HubTab = "start" | "topics";

/** Layout element for `/speaking` — child routes render through the outlet. */
export function SpeakingLayout() {
  return <Outlet />;
}

export function SpeakingHome() {
  const navigate = useNavigate();
  const offline = useSessionStore((s) => s.offline);

  const activity = useSpeakingStore((s) => s.activity);
  const micId = useSpeakingStore((s) => s.micId);
  const setMicId = useSpeakingStore((s) => s.setMicId);
  const starting = useSpeakingStore((s) => s.starting);
  const startError = useSpeakingStore((s) => s.startError);
  const start = useSpeakingStore((s) => s.start);
  const engine = useSpeakingStore((s) => s.engine);
  const loadEngine = useSpeakingStore((s) => s.loadEngine);
  const cardSetId = useSpeakingStore((s) => s.cardSetId);
  const setMockCardSet = useMockStore((s) => s.setCardSetId);
  const history = useSpeakingStore((s) => s.history);
  const loadHistory = useSpeakingStore((s) => s.loadHistory);

  const [micReady, setMicReady] = useState(false);
  const [tab, setTab] = useState<HubTab>("start");

  // The Part 2 card stands for its set, so the browser lists one tile per topic rather than
  // one per card. Built-ins carry no payload and would be dead tiles.
  const cards = useSpeakingStore((s) => s.cards);
  const cardsLoading = useSpeakingStore((s) => s.cardsLoading);
  const loadCards = useSpeakingStore((s) => s.loadCards);
  const setCardSetId = useSpeakingStore((s) => s.setCardSetId);
  const setTopic = useSpeakingStore((s) => s.setTopic);
  const setPart = useSpeakingStore((s) => s.setPart);
  const topicSets = useMemo(
    () => cards.filter((c) => c.part === 2 && c.card_set_id && !c.builtin),
    [cards],
  );
  const attemptedSets = useMemo(() => new Set(attemptedSetIds(history)), [history]);

  useEffect(() => {
    if (tab === "topics") void loadCards(2);
  }, [tab, loadCards]);

  useEffect(() => {
    void loadEngine();
  }, [loadEngine]);

  // Only for the count on the History button. The list itself is loaded by the history
  // screen — this hub no longer renders any of it.
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const onReadyChange = useCallback((ready: boolean) => setMicReady(ready), []);

  const mode = modeMeta(activity);
  const liveElsewhere = engine?.live_session_id ?? null;
  const voiceMissing = engine?.voice_available === false;
  // The examiner and the marker are the same model. Until one is configured this page
  // must not offer a band: the session would connect, sit in silence, and the learner
  // would find out afterwards. `=== false` because an older sidecar omits the field.
  const examinerMissing = engine?.examiner_available === false;
  const isMock = activity === "full_mock";

  const onStart = async () => {
    // A full mock is not started from here. It has its own room, and the reason is
    // the pre-flight screen: a sitting nobody was told the rules of is a sitting
    // nobody takes seriously, and the band it produces is worth nothing. The chosen
    // topic set travels with the learner so the choice isn't made twice.
    if (isMock) {
      setMockCardSet(cardSetId);
      navigate("/speaking/mock");
      return;
    }
    const session = await start();
    if (session) navigate(`/speaking/session/${session.session_id}`);
  };

  return (
    <PageShell
      title="Speaking"
      description={
        examinerMissing
          ? "Live examiner practice. Set up a language model first. Without one there is no examiner and no band."
          : "Live examiner practice with band feedback afterwards."
      }
      status={
        <Badge tone={examinerMissing ? "default" : mode.scored ? "primary" : "default"}>
          {examinerMissing
            ? "Not set up yet"
            : mode.scored
              ? "Counts toward your band"
              : "Practice only"}
        </Badge>
      }
      actions={
        <>
          {/* The same three, in the same order, with the same words as the other skills:
              your record, then the teaching room, then the timed one. Coach used to be a
              card halfway down the page here and a header button everywhere else. */}
          <HistoryButton to="/speaking/history" count={history.length} />
          <Button variant="outline" size="sm" onClick={() => navigate("/speaking/coach")}>
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            Coach
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/speaking/mock")}>
            <Timer className="h-4 w-4" aria-hidden="true" />
            Mock test
          </Button>
        </>
      }
      toolbar={
        <Tabs
          aria-label="Speaking"
          value={tab}
          onChange={(v) => setTab(v as HubTab)}
          items={[
            { value: "start", label: "Start a session" },
            { value: "topics", label: "Topics" },
          ]}
        />
      }
    >
      <div className={cn("space-y-6", tab !== "start" && "hidden")}>
        {offline && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/8 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-[13px] text-muted-foreground">
              The practice engine isn't responding, so speaking sessions can't start. It may
              still be launching. Retry in a few seconds.
            </p>
          </div>
        )}

        {voiceMissing && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/8 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-[13px] text-muted-foreground">
              The voice engine isn't installed in this build, so live sessions are unavailable.
              Reading, listening and writing practice still work.
            </p>
          </div>
        )}

        {examinerMissing && (
          <div
            role="alert"
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-warning/40 bg-warning/8 p-3"
          >
            <p className="flex min-w-0 items-start gap-2.5 text-[13px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              {engine?.examiner_reason ??
                "No language model is set up yet, so nothing can ask you questions or mark your answers."}
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate("/settings")}>
              Set up the examiner
            </Button>
          </div>
        )}

        {liveElsewhere && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/8 p-3">
            <p className="flex items-center gap-2 text-[13px] text-foreground">
              <Radio className="h-4 w-4 text-primary" />
              A speaking session is already open.
            </p>
            <Button size="sm" onClick={() => navigate(`/speaking/session/${liveElsewhere}`)}>
              Rejoin session
            </Button>
          </div>
        )}

        {/* The headline act sits above the mode picker, not inside it: a full mock is
            a different kind of commitment from a drill and should not look like a
            fourth radio button. */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12">
                <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Sit a full mock test</p>
                <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                  All three parts back to back, 11 to 14 minutes, authentic timing, no coaching and
                  no pausing. One band for the whole test at the end, with a part-by-part account
                  of where it came from.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/speaking/mock")}>
              Go to the mock room
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Choose a session</CardTitle>
          </CardHeader>
          <CardContent>
            <ModePicker />
          </CardContent>
        </Card>

        <PreCallCheck
          micId={micId}
          onMicChange={setMicId}
          onReadyChange={onReadyChange}
          footer={
            <div className="space-y-2 border-t border-border pt-4">
              {startError && (
                <p role="alert" className="text-[13px] text-destructive">
                  {startError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  loading={starting}
                  disabled={
                    starting ||
                    offline ||
                    voiceMissing ||
                    examinerMissing ||
                    Boolean(liveElsewhere)
                  }
                  onClick={() => void onStart()}
                >
                  {isMock ? (
                    <>
                      <ClipboardCheck className="h-4 w-4" />
                      Set up the mock test
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      Start {mode.label.toLowerCase()}
                    </>
                  )}
                </Button>
                {examinerMissing ? (
                  <p className="text-[12px] text-muted-foreground">
                    Nothing to start yet: the examiner needs a language model. The topic
                    coach below works without one.
                  </p>
                ) : isMock ? (
                  <p className="text-[12px] text-muted-foreground">
                    A mock runs under exam conditions, so it opens in its own room first.
                  </p>
                ) : (
                  !micReady && (
                    <p className="text-[12px] text-muted-foreground">
                      You can start without testing, but the examiner hears nothing if the mic is
                      blocked.
                    </p>
                  )
                )}
              </div>
            </div>
          }
        />

        {/* Past sessions used to be a capped strip below this point. They are behind the
            History button in the header now: one searchable list, and every session in
            it can be opened — including the three modes that are never scored, whose
            transcripts had no screen at all before. */}
      </div>

      {/*
        The 108 topic sets, browsable. The only way to choose one used to be the dropdown in
        the session picker, which lists every card title for the chosen part: 280 of them for
        Part 1. Picking a tile sets the topic and returns you to the session you were setting
        up, so browsing is part of starting rather than a detour.
      */}
      <div className={cn("space-y-4", tab !== "topics" && "hidden")}>
        <TopicBrowser
          cards={topicSets}
          attempted={attemptedSets}
          loading={cardsLoading}
          actionLabel="Practise"
          onPick={(setId, card) => {
            // A tile is a Part 2 cue card standing for its whole set, so the part travels with
            // it. Setting the topic without the part would leave a Part 2 title selected under
            // Part 1, where it is not one of the options and the picker falls back to its
            // placeholder: the learner would see their choice silently discarded.
            setCardSetId(setId);
            setPart(2);
            setTopic(card.title);
            setTab("start");
          }}
          emptyTitle="No topic sets installed"
          emptyDescription="Topics come from the installed content pack. Install one from Settings and all three parts gain their cue cards."
          filters={
            <Button variant="ghost" size="sm" onClick={() => navigate("/speaking/coach")}>
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              Study instead
            </Button>
          }
        />
      </div>
    </PageShell>
  );
}

export default SpeakingHome;

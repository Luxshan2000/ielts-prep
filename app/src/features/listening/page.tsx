/**
 * Listening hub (12 §6.3): the test bank, single-part practice and accent training.
 * Child routes (player, review, drill) render through the outlet.
 *
 * Past attempts used to be an eight-row strip at the very foot of this page, below the
 * drills, which put the record of a learner's own work in the least-visited part of the
 * screen and capped it at whatever fitted. It is a button in the header now, and
 * `/listening/history` shows all of it — attempts, mock sittings and drills together.
 */

import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Globe2,
  GraduationCap,
  Headphones,
  Library,
  ListChecks,
  Timer,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
  Tabs,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { HistoryButton } from "@/components/practice/history";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { useSettingsGeneration } from "@/lib/useSettingsGeneration";
import { dropGeneratedAudioCaches } from "./audioCaches";
import { useListeningStore } from "./store";
import { accentLabel } from "./labels";
import { useListeningHistory } from "./history";
import { PrepareAudioPanel } from "./components/PrepareAudioPanel";
import { SpellingNotice } from "./components/SpellingNotice";

/** Layout element for `/listening`. */
export function ListeningLayout() {
  return <Outlet />;
}

type Mode = "exam" | "practice";

export function ListeningHome() {
  const navigate = useNavigate();
  const tests = useListeningStore((s) => s.tests);
  const scripts = useListeningStore((s) => s.scripts);
  const testsLoading = useListeningStore((s) => s.testsLoading);
  const testsError = useListeningStore((s) => s.testsError);
  const scriptsError = useListeningStore((s) => s.scriptsError);
  const loadLibrary = useListeningStore((s) => s.loadLibrary);

  // Practice is where somebody starts. Exam conditions are what you graduate to once the
  // material is familiar, and landing there first meant every visit opened on the one mode
  // that plays each part once and never rewinds.
  const [mode, setMode] = useState<Mode>("practice");
  // Counted here so the header button can say how much is behind it; the history screen
  // reads the same three ledgers through the same hook.
  const history = useListeningHistory();

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card after it comes back (12 §9).
  useSidecarRecovery(() => void loadLibrary());

  // Same idea for a provider change made in the Settings dialog, which can be opened
  // over this very screen: every "Audio ready" badge below was computed for the engine
  // that was selected a moment ago, so the listing has to be re-asked rather than
  // re-rendered.
  useSettingsGeneration(() => void dropGeneratedAudioCaches());

  const loadingFirstTime = testsLoading && !tests;
  const hasTests = Boolean(tests && tests.length > 0);
  const hasScripts = Boolean(scripts && scripts.length > 0);

  return (
    <PageShell
      title="Listening"
      description="Four parts, forty questions. The audio is generated on this machine, so nothing needs the internet."
      onRefresh={() => void loadLibrary(true)}
      refreshing={testsLoading}
      refreshLabel="Reload the listening library"
      /*
        Your own record first, then the two rooms either side of the library, in the slot
        every skill uses for them. The primary action stays rightmost: history is where you
        go to look something up, not what this screen is for.
      */
      actions={
        <>
          <HistoryButton to="/listening/history" count={history.rows.length} />
          <Button variant="outline" size="sm" onClick={() => navigate("/listening/coach")}>
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            Coach
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/listening/mock")}>
            <Timer className="h-4 w-4" aria-hidden="true" />
            Mock test
          </Button>
        </>
      }
      toolbar={
        <Tabs
          aria-label="How to take the test"
          value={mode}
          onChange={(value) => setMode(value)}
          items={[
            { value: "practice", label: "Practice" },
            { value: "exam", label: "Exam conditions" },
          ]}
        />
      }
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-3 text-[13px] text-muted-foreground">
          {mode === "exam" ? (
            <p>
              <span className="font-semibold text-foreground">Exam conditions:</span> each part
              plays once, there is no pause or rewind, and a two-minute check step opens when the
              audio ends. Only full four-part exam attempts feed your predicted band.
            </p>
          ) : (
            <p>
              <span className="font-semibold text-foreground">Practice:</span> replay freely, seek,
              slow the audio to 0.75×, and reveal a part's transcript once you have answered
              it. Practice attempts report a raw score.
            </p>
          )}
        </div>

        <SpellingNotice />

        {/* Both rooms replay, seek and re-voice the audio, so neither belongs under exam
            conditions. They are the practice half of this screen and they sit at the top of
            it now. They used to be the last two sections on the page, under the library and
            under the recent-attempts list, which is the least visited part of any screen. */}
        {mode === "practice" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <PracticeRoom
              icon={ListChecks}
              title="Targeted drills"
              body="Short reps on the four things that lose the most marks: taking dictation, catching numbers, hearing the signpost that announces an answer, and predicting what kind of word a gap needs before it plays."
              cta="Open drills"
              onOpen={() => navigate("/listening/drills")}
              ready={hasScripts}
              unavailable="Drills are built from the scripts in your content pack. Install one to practise."
            />
            <PracticeRoom
              icon={Globe2}
              title="Accent training"
              body="Re-voice any part in British, American or Australian voices and compare them side by side. The questions stay the same, so it is pure ear training."
              cta="Open accent training"
              onOpen={() => navigate("/listening/accents")}
              ready={hasScripts}
              unavailable="Accent training needs a content pack with listening scripts. It re-voices an existing script rather than creating new material."
            />
          </div>
        )}


        {(testsError || scriptsError) && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 space-y-2">
              <p className="text-[13px] text-foreground">{testsError ?? scriptsError}</p>
              <Button size="sm" variant="outline" onClick={() => void loadLibrary(true)}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {loadingFirstTime ? (
          <div className="space-y-3">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        ) : hasTests ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Library className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Full tests
            </h2>
            {/*
              "Full test" and "mock paper" are the same forty questions, so the difference
              has to be said out loud or a learner picks whichever button is nearer.
            */}
            <p className="text-[13px] text-muted-foreground">
              A test here is yours to set up: sit it under exam conditions or in practice mode,
              and the transcript opens as soon as you submit. The mock paper is the same forty
              questions with none of that: one fixed sitting, no help anywhere in it, and a
              report that sends you into the coach for the parts you just heard.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {tests?.map((test) => (
                <Card key={test.id}>
                  <CardHeader>
                    <CardTitle>{test.title}</CardTitle>
                    {/* `test.source` is the pack's internal provenance string ("pack",
                        "generated") — it means nothing to a learner, so it stays out. */}
                    <CardDescription>
                      {test.total_questions} questions across {test.parts.length} parts
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-1">
                      {test.parts.map((part) => (
                        <li
                          key={part.id}
                          className="flex items-center justify-between gap-2 text-[12px]"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium">Part {part.part}:</span> {part.title}
                          </span>
                          {part.accent_set && (
                            <Badge tone="outline">{accentLabel(part.accent_set)}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>

                    <PrepareAudioPanel
                      targetId={test.id}
                      kind="test"
                      ready={test.audio_ready}
                      readyParts={test.audio_ready_parts}
                      totalParts={test.parts.length}
                    />

                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <Button
                        onClick={() => navigate(`/listening/test/${test.id}?mode=${mode}`)}
                        disabled={!test.audio_ready}
                      >
                        <Headphones className="h-4 w-4" />
                        {mode === "exam" ? "Start under exam conditions" : "Practise this test"}
                      </Button>
                      {!test.audio_ready && (
                        <span className="text-[12px] text-muted-foreground">
                          Prepare the audio before you can start this test.
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            icon={Headphones}
            title="No listening tests installed"
            description="Listening tests come from a content pack. Install or import one from Settings, then the four-part bank appears here."
            action={<Button onClick={() => navigate("/settings")}>Open Settings</Button>}
          />
        )}

        {hasScripts && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Single parts
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Ten questions at a time, always in practice mode. A single part reports a raw score.
              Bands need a full test.
            </p>
            <div className="grid gap-2 lg:grid-cols-2">
              {scripts?.map((script) => (
                <div
                  key={script.id}
                  className="space-y-2 rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">
                        Part {script.part}: {script.title}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {script.questions} questions · {script.audio.accent_label}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/listening/coach/${script.id}`)}
                      >
                        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                        Study
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!script.audio.ready}
                        onClick={() => navigate(`/listening/part/${script.id}?mode=practice`)}
                      >
                        Practise
                      </Button>
                    </span>
                  </div>
                  <PrepareAudioPanel
                    targetId={script.id}
                    kind="script"
                    ready={script.audio.ready}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </PageShell>
  );
}

/**
 * One of the two practice rooms at the top of this screen.
 *
 * Written as a component because the pair sit side by side in a two-column grid, where the
 * old shape (text and button on one flex row) collapsed badly: at half width the button wrapped
 * under a ragged paragraph and the two cards stopped lining up. The button is pinned to the
 * bottom of the card instead, so the two agree however long the text runs.
 */
function PracticeRoom({
  icon: Icon,
  title,
  body,
  cta,
  onOpen,
  ready,
  unavailable,
}: {
  icon: typeof Globe2;
  title: string;
  body: string;
  cta: string;
  onOpen: () => void;
  ready: boolean;
  unavailable: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h2>
      {ready ? (
        <div className="flex h-[calc(100%-2rem)] flex-col gap-3 rounded-xl border border-border bg-card p-3">
          <p className="text-[13px] text-muted-foreground">{body}</p>
          <Button variant="outline" className="mt-auto self-start" onClick={onOpen}>
            {cta}
          </Button>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-[13px] text-muted-foreground">
          {unavailable}
        </p>
      )}
    </section>
  );
}

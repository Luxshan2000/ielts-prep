/**
 * Listening hub (12 §6.3): the test bank, single-part practice, accent training
 * and your recent attempts. Child routes (player, review, drill) render through
 * the outlet.
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
  RefreshCw,
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
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { useListeningStore } from "./store";
import { PrepareAudioPanel } from "./components/PrepareAudioPanel";
import { RecentAttempts } from "./components/RecentAttempts";
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

  const [mode, setMode] = useState<Mode>("exam");

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card after it comes back (12 §9).
  useSidecarRecovery(() => void loadLibrary());

  const loadingFirstTime = testsLoading && !tests;
  const hasTests = Boolean(tests && tests.length > 0);
  const hasScripts = Boolean(scripts && scripts.length > 0);

  return (
    <PageShell
      title="Listening"
      description="Four parts, forty questions. The audio is generated on this machine, so nothing needs the internet."
      actions={
        <Button variant="ghost" size="sm" onClick={() => void loadLibrary(true)}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      }
      toolbar={
        <Tabs
          aria-label="How to take the test"
          value={mode}
          onChange={(value) => setMode(value)}
          items={[
            { value: "exam", label: "Exam conditions" },
            { value: "practice", label: "Practice" },
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
              slow the audio to 0.75×, and reveal a part&rsquo;s transcript once you have answered
              it. Practice attempts report a raw score.
            </p>
          )}
        </div>

        <SpellingNotice />

        {/*
          The two rooms either side of practice: the coach, where a part is studied
          and its transcript replayed line by line, and the mock, where nothing
          explains anything until it is over. Both sit above the library because a
          learner who only ever presses "start test" never gets past their plateau.
        */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
                Listening coach
              </h2>
              <p className="text-[13px] leading-6 text-muted-foreground">
                Study one part: what it is built to cost you, what to predict in each gap before a
                word is spoken, and — once you have answered it — every line of the script, each one
                playable on a click.
              </p>
            </div>
            <div>
              <Button variant="outline" onClick={() => navigate("/listening/coach")}>
                Open the coach
              </Button>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Timer className="h-4 w-4 text-warning" aria-hidden="true" />
                Mock paper
              </h2>
              <p className="text-[13px] leading-6 text-muted-foreground">
                Four parts, forty questions, played once, one clock. The audio is generated before
                the clock starts, no coaching is reachable while it runs, and the report ends by
                sending you back into the coach for the parts you just sat.
              </p>
            </div>
            <div>
              <Button variant="outline" onClick={() => navigate("/listening/mock")}>
                Sit a mock paper
              </Button>
            </div>
          </div>
        </div>

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
            <div className="grid gap-3 lg:grid-cols-2">
              {tests?.map((test) => (
                <Card key={test.id}>
                  <CardHeader>
                    <CardTitle>{test.title}</CardTitle>
                    <CardDescription>
                      {test.total_questions} questions across {test.parts.length} parts
                      {test.source ? ` · ${test.source}` : ""}
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
                            <span className="font-medium">Part {part.part}</span> — {part.title}
                          </span>
                          {part.accent_set && (
                            <Badge tone="outline">{part.accent_set.toUpperCase()}</Badge>
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
                          Prepare the audio to unlock this test.
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
              Ten questions at a time, always in practice mode. A single part reports a raw score —
              bands need a full test.
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
                        Part {script.part} — {script.title}
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

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Globe2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Accent training
          </h2>
          {hasScripts ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                Re-voice any part in British, American or Australian voices and compare them side by
                side. The questions stay the same, so it is pure ear training.
              </p>
              <Button variant="outline" onClick={() => navigate("/listening/accents")}>
                Open accent training
              </Button>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-[13px] text-muted-foreground">
              Accent training becomes available once a content pack with listening scripts is
              installed — it re-voices an existing script rather than creating new material.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Recent attempts</h2>
          <RecentAttempts />
        </section>
      </div>
    </PageShell>
  );
}

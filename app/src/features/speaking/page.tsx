/**
 * Speaking Room hub (12 §6.2 A): pick a mode, check the microphone, start.
 * The live call and the feedback report are child routes of the same feature.
 */

import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AlertTriangle, GraduationCap, Mic, Radio } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSessionStore } from "@/stores";
import { ModePicker } from "./components/ModePicker";
import { PreCallCheck } from "./components/PreCallCheck";
import { SessionHistory } from "./components/SessionHistory";
import { modeMeta } from "./components/phases";
import { useSpeakingStore } from "./store";

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

  const [micReady, setMicReady] = useState(false);

  useEffect(() => {
    void loadEngine();
  }, [loadEngine]);

  const onReadyChange = useCallback((ready: boolean) => setMicReady(ready), []);

  const mode = modeMeta(activity);
  const liveElsewhere = engine?.live_session_id ?? null;
  const voiceMissing = engine?.voice_available === false;

  const onStart = async () => {
    const session = await start();
    if (session) navigate(`/speaking/session/${session.session_id}`);
  };

  return (
    <PageShell
      title="Speaking"
      description="Live examiner practice with band feedback afterwards."
      actions={
        <Badge tone={mode.scored ? "primary" : "default"}>
          {mode.scored ? "Counts toward your band" : "Practice only"}
        </Badge>
      }
    >
      <div className="space-y-6">
        {offline && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/8 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-[13px] text-muted-foreground">
              The practice engine isn't responding, so speaking sessions can't start. It may
              still be launching — retry in a few seconds.
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
                  disabled={starting || offline || voiceMissing || Boolean(liveElsewhere)}
                  onClick={() => void onStart()}
                >
                  <Mic className="h-4 w-4" />
                  Start {mode.label.toLowerCase()}
                </Button>
                {!micReady && (
                  <p className="text-[12px] text-muted-foreground">
                    You can start without testing, but the examiner hears nothing if the mic is
                    blocked.
                  </p>
                )}
              </div>
            </div>
          }
        />

        {/* The teaching layer sits beside the exam, not inside it: the examiner
            persona never teaches, so everything that does lives behind this door. */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12">
                <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Study a topic</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Work a cue card without the clock running: the guided prep minute, the same
                  answer at bands 6, 7 and 8, the phrases this subject needs, and its vocabulary.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate("/speaking/coach")}>
              Open the topic coach
            </Button>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Recent sessions</h2>
          <SessionHistory />
        </section>
      </div>
    </PageShell>
  );
}

export default SpeakingHome;

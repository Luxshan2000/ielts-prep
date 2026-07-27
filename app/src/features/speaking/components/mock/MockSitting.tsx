/**
 * `/speaking/mock/sitting/:sessionId` — the shell around a live mock.
 *
 * Owns the two connections a sitting needs (the session event socket and the WebRTC
 * peer) and the three states around them: getting in, being in, and the wait for
 * marking. The exam-facing surface is `SittingStage`; this file is plumbing.
 *
 * Note the deliberate absence of a `PageShell` header. Every other screen in the app
 * wears one, which is exactly why this one does not: the moment a candidate can see
 * the app's ordinary furniture they stop behaving as if they are in a test.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, FileText, Sparkles } from "lucide-react";
import { PipecatClient } from "@pipecat-ai/client-js";
import { PipecatClientProvider } from "@pipecat-ai/client-react";
import { SmallWebRTCTransport, WavMediaManager } from "@pipecat-ai/small-webrtc-transport";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Progress,
  Skeleton,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSessionStore } from "@/stores";
import { TERMINAL_PHASES, describeError } from "../phases";
import type { SessionRecord } from "../../store";
import { SittingStage } from "./SittingStage";
import { useMockStore } from "./store";

type Stage = "loading" | "unavailable" | "live" | "wrapup";

export function MockSitting() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const attach = useSessionStore((s) => s.attach);
  const detach = useSessionStore((s) => s.detach);

  const finish = useMockStore((s) => s.finish);

  const [stage, setStage] = useState<Stage>("loading");
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [client, setClient] = useState<PipecatClient | null>(null);

  // ------------------------------------------------------------------ load ---

  useEffect(() => {
    if (!sessionId) {
      setFatal("No session id in the address.");
      setStage("unavailable");
      return;
    }
    let cancelled = false;
    setStage("loading");
    setFatal(null);

    (async () => {
      try {
        const fetched = await api.get<SessionRecord>(
          `/api/v1/speaking/sessions/${encodeURIComponent(sessionId)}`,
        );
        if (cancelled) return;
        setRecord(fetched);
        if (fetched.live) {
          setStage("live");
        } else if (fetched.report_id) {
          navigate(`/speaking/mock/report/${fetched.report_id}`, { replace: true });
        } else {
          setStage("unavailable");
          setFatal(
            (TERMINAL_PHASES as string[]).includes(fetched.state)
              ? "This sitting has already finished."
              : "This sitting is no longer open on the practice engine.",
          );
        }
      } catch (err) {
        if (cancelled) return;
        setStage("unavailable");
        setFatal(
          err instanceof ApiError && err.status === 404
            ? "That mock sitting doesn't exist any more."
            : describeError(err),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, sessionId]);

  // ------------------------------------------------------- session event WS ---

  useEffect(() => {
    if (stage !== "live" || !sessionId) return;
    void attach(sessionId);
    return () => detach();
  }, [attach, detach, sessionId, stage]);

  // --------------------------------------------------------- webrtc client ---

  useEffect(() => {
    if (stage !== "live" || !sessionId) return;
    let cancelled = false;
    let created: PipecatClient | null = null;

    (async () => {
      try {
        const { baseUrl, token } = await api.contract();
        const transport = new SmallWebRTCTransport({
          webrtcRequestParams: {
            endpoint: `${baseUrl}/api/v1/speaking/sessions/${encodeURIComponent(sessionId)}/offer`,
            // Bearer auth covers both the POST offer and the trickle-ICE PATCH the
            // transport sends to the same URL.
            headers: new Headers({ Authorization: `Bearer ${token}` }),
          },
          // WavMediaManager, not the Daily default: the Daily manager fetches its
          // call-machine bundle from the network, which a local-first app must not do.
          mediaManager: new WavMediaManager(),
        });
        created = new PipecatClient({ transport, enableMic: true, enableCam: false });
        if (cancelled) {
          void created.disconnect().catch((err: unknown) =>
            console.debug("[BandReady] mock: disconnect after cancelled setup", err),
          );
          return;
        }
        setClient(created);
      } catch (err) {
        if (!cancelled) {
          setFatal(describeError(err));
          setStage("unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
      setClient(null);
      void created?.disconnect().catch((err: unknown) =>
        console.debug("[BandReady] mock: disconnect during teardown", err),
      );
    };
  }, [sessionId, stage]);

  // --------------------------------------------------------- closing guard ---

  // Closing the window mid-sitting loses the rest of the test. The browser-level
  // prompt is the only guard available from inside a route (the app's router is not
  // a data router, so there is no navigation blocker).
  useEffect(() => {
    if (stage !== "live") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [stage]);

  // ---------------------------------------------------------------- ending ---

  const onEnded = useCallback(() => {
    setStage("wrapup");
    detach();
    void (async () => {
      const reportId = await finish(sessionId);
      if (reportId) navigate(`/speaking/mock/report/${reportId}`, { replace: true });
    })();
  }, [detach, finish, navigate, sessionId]);

  // ---------------------------------------------------------------- render ---

  return (
    <div className="scrollbar-thin h-full min-h-0 overflow-y-auto bg-background">
      {stage === "loading" && (
        <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-8">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      )}

      {stage === "unavailable" && (
        <div className="mx-auto w-full max-w-4xl px-6 py-8">
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                icon={FileText}
                title="This sitting isn't running"
                description={fatal ?? "The practice engine has no open session with that id."}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => navigate("/speaking/mock")}>
                      <ArrowLeft className="h-4 w-4" />
                      Back to the mock room
                    </Button>
                    {record?.report_id && (
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/speaking/mock/report/${record.report_id}`)}
                      >
                        Open its report
                      </Button>
                    )}
                  </div>
                }
              />
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "live" &&
        (client ? (
          <PipecatClientProvider client={client}>
            <SittingStage onEnded={onEnded} />
          </PipecatClientProvider>
        ) : (
          <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-8">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        ))}

      {stage === "wrapup" && <MockWrapUp sessionId={sessionId} />}
    </div>
  );
}

// ------------------------------------------------------------------ wrap-up ---

/** The wait between the last word and the band. Nothing to do here but be honest. */
function MockWrapUp({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const scoring = useMockStore((s) => s.scoring);
  const scoreError = useMockStore((s) => s.scoreError);
  const ending = useMockStore((s) => s.ending);
  const mark = useMockStore((s) => s.mark);

  // `ending === null` means the hang-up has not answered yet — never flash "nothing
  // was recorded" while the teardown is still in flight.
  const working = scoring || (ending === null && scoreError === null);
  const silent = ending !== null && ending.turns === 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <Card>
        <CardContent className="space-y-5 pt-6">
          {working && (
            <>
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  {scoring ? "Marking your test" : "Closing the test"}
                </p>
                <p className="text-[13px] leading-6 text-muted-foreground">
                  {scoring
                    ? "The whole sitting is read once and marked as one performance, the way an examiner does. On a local model this takes up to a minute. Leaving this screen does not cancel it."
                    : "Saving your transcript and recordings."}
                </p>
              </div>
              <Progress
                value={null}
                label={scoring ? "Marking" : "Saving"}
                detail={scoring ? "reading the whole sitting" : "closing the audio session"}
              />
              <div className="space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </>
          )}

          {!working && scoreError && (
            <EmptyState
              icon={AlertTriangle}
              title="Marking didn't finish"
              description={scoreError}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    onClick={async () => {
                      const reportId = await mark(sessionId, { force: true });
                      if (reportId) {
                        navigate(`/speaking/mock/report/${reportId}`, { replace: true });
                      }
                    }}
                  >
                    Retry marking
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/speaking/mock")}>
                    Back to the mock room
                  </Button>
                </div>
              }
            />
          )}

          {!working && !scoreError && (
            <EmptyState
              icon={AlertTriangle}
              title={silent ? "Nothing was recorded" : "The sitting ended"}
              description={
                silent
                  ? "No speech reached the examiner, so there is nothing to mark and no band was recorded. Check your microphone before starting another mock."
                  : "The transcript is saved but no report was produced. You can start another mock, or open the sitting from your history."
              }
              action={
                <Button onClick={() => navigate("/speaking/mock")}>Back to the mock room</Button>
              }
            />
          )}

          {ending?.hangupError && (
            <p role="alert" className="text-[12px] text-warning">
              {ending.hangupError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MockSitting;

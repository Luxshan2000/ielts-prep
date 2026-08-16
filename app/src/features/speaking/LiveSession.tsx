/**
 * The live examiner call — `/speaking/session/:sessionId` (12 §6.2 B).
 *
 * The live call surface, with the four things this app needs that a generic call UI
 * does not: bearer-authenticated SDP endpoint, the server-owned phase/timer HUD fed by
 * the session WebSocket, the Part 2 cue card, and the scored hand-off to the report.
 *
 * Two invariants:
 *  - The renderer NEVER advances the state machine. Phase, part, timers and the cue card
 *    all arrive as `state`/`timer`/`cue_card` events (18 §5) and are mirrored into
 *    `useSessionStore.live`; this file only paints them.
 *  - `initDevices()` runs before `connect()` — see the comment at `connect()` below.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  PipecatClient,
  RTVIEvent,
  type RTVIMessage,
  type TransportState,
} from "@pipecat-ai/client-js";
import {
  PipecatClientAudio,
  PipecatClientProvider,
  useRTVIClientEvent,
  usePipecatClient,
  usePipecatClientMediaTrack,
  usePipecatClientTransportState,
  usePipecatConversation,
  type BotOutputText,
  type ConversationMessage,
  type ConversationMessagePart,
} from "@pipecat-ai/client-react";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { PlainMicMediaManager } from "./components/PlainMicMediaManager";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Notice,
  Progress,
  Skeleton,
  useConfirm,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { api, ApiError } from "@/lib/api";
import { useSessionStore } from "@/stores";
import { CallControls } from "./components/CallControls";
import { CallStageTiles } from "./components/CallStageTiles";
import { CueCard } from "./components/CueCard";
import { LiveHud } from "./components/LiveHud";
import { TranscriptFeed, type FeedTurn } from "./components/TranscriptFeed";
import {
  TERMINAL_PHASES,
  activityLabel,
  describeError,
  isProviderError,
  isMicPermissionError,
  modeMeta,
} from "./components/phases";
import { useTrackLevel } from "./components/useTrackLevel";
import { isScoreable, useSpeakingStore, type SessionRecord } from "./store";

// ---------------------------------------------------------------- transcript ---

function partText(part: ConversationMessagePart): string {
  const value = part.text as unknown;
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && ("spoken" in value || "unspoken" in value)) {
    const bot = value as BotOutputText;
    return `${bot.spoken ?? ""}${bot.unspoken ?? ""}`;
  }
  return "";
}

function messageText(message: ConversationMessage): string {
  return message.parts.map(partText).join("").trim();
}

function messageMs(message: ConversationMessage, originMs: number): number {
  const at = Date.parse(message.createdAt);
  if (Number.isNaN(at) || originMs === 0) return 0;
  return Math.max(0, at - originMs);
}

// -------------------------------------------------------------------- helpers ---

type CallState = "idle" | "connecting" | "live" | "ending";

/**
 * Is this remembered microphone still a real device on this origin?
 *
 * Returns false rather than throwing when devices cannot be enumerated at all: the caller's
 * fallback is the system default, which is the right answer either way.
 */
async function micStillExists(micId: string): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === "audioinput" && d.deviceId === micId);
  } catch {
    return false;
  }
}

/**
 * True once a live call has gone long enough with an open microphone and no signal at all.
 *
 * Six seconds, and it resets the moment anything is heard, because a learner pausing to think
 * is normal and must never be accused of a broken microphone. This measures the LOCAL track,
 * so it is about capture rather than about the network.
 */
/**
 * Why the microphone is producing nothing, in the learner's terms.
 *
 * Silence has several causes that look identical on screen and need opposite responses, so the
 * warning names which one this is instead of listing all of them and hoping. `muted` is the
 * interesting one: the browser sets it when the operating system refuses capture, which is a
 * system setting rather than anything the page can fix.
 */
function captureFault(track: MediaStreamTrack | null): string {
  if (!track) {
    return "The browser never handed over a microphone. Reconnect, and allow microphone access when it asks.";
  }
  if (track.readyState === "ended") {
    return "The microphone was disconnected during the call. Reconnect to pick it up again.";
  }
  if (track.muted) {
    return "Your system is blocking microphone access for this browser. Allow it in your privacy settings, then reconnect.";
  }
  if (!track.enabled) {
    return "The microphone is switched off in this call. Turn it back on with the microphone button.";
  }
  return "The microphone is open and sending nothing, which usually means another app has taken it, or the wrong input is selected.";
}

function useSilentMic(level: number, listening: boolean): boolean {
  const [silent, setSilent] = useState(false);
  const lastSound = useRef<number | null>(null);

  useEffect(() => {
    if (!listening) {
      lastSound.current = null;
      setSilent(false);
      return;
    }
    if (lastSound.current === null) lastSound.current = Date.now();
    if (level > 0.01) {
      lastSound.current = Date.now();
      setSilent(false);
      return;
    }
    const started = lastSound.current;
    const timer = window.setTimeout(() => {
      if (Date.now() - started >= 6000) setSilent(true);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [level, listening]);

  return silent;
}

function callStateOf(transport: TransportState, ending: boolean): CallState {
  if (ending) return "ending";
  switch (transport) {
    case "connected":
    case "ready":
      return "live";
    case "disconnected":
    case "initialized":
    case "error":
      return "idle";
    default:
      return "connecting";
  }
}

// ------------------------------------------------------------------ call stage ---

interface CallStageProps {
  activity: string;
  onEnded: () => void;
}

function CallStage({ activity, onEnded }: CallStageProps) {
  const confirm = useConfirm();
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const { messages } = usePipecatConversation();

  const live = useSessionStore((s) => s.live);
  const notes = useSpeakingStore((s) => s.notes);
  const setNotes = useSpeakingStore((s) => s.setNotes);
  const micId = useSpeakingStore((s) => s.micId);

  // The raw failure is kept, not just its copy: the mic-permission deep link needs to
  // know *why* the connection failed.
  const [callError, setCallError] = useState<unknown>(null);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [ending, setEnding] = useState(false);

  const mode = modeMeta(activity.split(":")[0]);
  const [showTranscript, setShowTranscript] = useState(!mode.scored);

  /** Which client we have already dialled, not merely whether we have dialled one. */
  const connectedFor = useRef<PipecatClient | null>(null);
  const endedRef = useRef(false);
  const originRef = useRef(0);

  // Server-owned session state (18 §5). The renderer only reads it.
  const phase = live?.phase ?? "CONNECTING";

  const localTrack = usePipecatClientMediaTrack("audio", "local");
  const botTrack = usePipecatClientMediaTrack("audio", "bot");
  const callState = callStateOf(transportState, ending);
  const isLive = callState === "live";
  const userLevel = useTrackLevel(localTrack, isLive && micEnabled);
  const micIsSilent = useSilentMic(userLevel, isLive && micEnabled);
  const botLevel = useTrackLevel(botTrack, isLive);

  // ------------------------------------------------------------- rtvi events ---

  useRTVIClientEvent(
    RTVIEvent.BotStartedSpeaking,
    useCallback(() => {
      setBotSpeaking(true);
      setCallError(null);
    }, []),
  );
  useRTVIClientEvent(
    RTVIEvent.BotStoppedSpeaking,
    useCallback(() => setBotSpeaking(false), []),
  );
  useRTVIClientEvent(
    RTVIEvent.UserStartedSpeaking,
    useCallback(() => setUserSpeaking(true), []),
  );
  useRTVIClientEvent(
    RTVIEvent.UserStoppedSpeaking,
    useCallback(() => setUserSpeaking(false), []),
  );
  useRTVIClientEvent(
    RTVIEvent.Error,
    useCallback((message: RTVIMessage) => {
      const data = message.data as { message?: string } | undefined;
      setCallError(new Error(data?.message ?? "The practice engine reported an error."));
    }, []),
  );
  useRTVIClientEvent(
    RTVIEvent.Disconnected,
    useCallback(() => {
      setBotSpeaking(false);
      setUserSpeaking(false);
    }, []),
  );

  // ---------------------------------------------------------------- connect ---

  const connect = useCallback(async () => {
    if (!client) return;
    setCallError(null);
    try {
      // Pipecat gotcha #3: `initDevices()` MUST complete before `connect()`.
      // Without it the peer connection is negotiated with no local audio track and
      // the microphone is silently never published — the examiner hears nothing and
      // there is no error anywhere to tell you why.
      await client.initDevices();
      // Only pass a remembered microphone if it still exists.
      //
      // `deviceId` values are per-origin and Chrome rotates them whenever microphone
      // permission is reset, so a value saved on one port is meaningless on another and a
      // value saved before a permission change is meaningless now. Handing a stale one to
      // `updateMic` makes getUserMedia throw OverconstrainedError inside the transport's
      // WavMediaManager, whose catch discards the error and carries on: the AudioWorklet
      // recorder is left dead, the peer connection publishes silence, the sidecar logs
      // "no audio frame received" for the whole call, and the only thing the learner sees is
      // "Session ended: please call .begin() first" from the next method to touch the
      // recorder. Checking first costs one enumerateDevices call.
      if (micId && (await micStillExists(micId))) {
        client.updateMic(micId);
      }
      await client.connect();
      setMicEnabled(client.isMicEnabled);
    } catch (err) {
      // Keep the raw failure — `describeError` runs at render time so the
      // mic-permission branch can also test it.
      setCallError(err);
    }
  }, [client, micId]);

  // Auto-connect once per client: the learner already pressed "Start" on the hub screen, so a
  // second click here would be pure friction.
  //
  // Keyed on the client instance rather than a boolean, because the effect above is allowed to
  // replace the client and in development it always does. StrictMode double-invokes effects, so
  // the real order is: create A, connect A, tear A down, create B. A boolean latch says "already
  // connected" and B is never dialled, which shows up as an examiner stuck on Not connected, no
  // offer posted, and the dead recorder from A throwing "Session ended: please call .begin()
  // first" when the level meter reads it. It was intermittent because the setup for A sometimes
  // loses the race and never sets the client at all, in which case the latch stays down.
  useEffect(() => {
    if (!client || connectedFor.current === client) return;
    connectedFor.current = client;
    void connect();
  }, [client, connect]);

  const toggleMic = useCallback(() => {
    if (!client) return;
    const next = !client.isMicEnabled;
    client.enableMic(next);
    setMicEnabled(next);
  }, [client]);

  /** Tear the call down exactly once, then hand off to the wrap-up/scoring screen. */
  const finish = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEnding(true);
    try {
      await client?.disconnect();
    } catch {
      /* already tearing down */
    }
    onEnded();
  }, [client, onEnded]);

  const endCall = useCallback(async () => {
    if (endedRef.current) return;
    const ok = await confirm({
      title: mode.scored ? "End the test now?" : "End this session?",
      message: mode.scored
        ? "Everything you have said so far is kept and scored, but you cannot resume this attempt."
        : "The conversation ends here. Nothing is scored.",
      confirmLabel: mode.scored ? "End and score" : "End session",
      destructive: true,
    });
    if (!ok) return;
    await finish();
  }, [confirm, finish, mode.scored]);

  /**
   * The examiner ends the test itself: the controller reaches WRAP_UP, speaks its
   * closing line and then waits. Nothing else will hang the call up, so the renderer
   * does it once the closing line has finished — and immediately on a terminal phase.
   */
  useEffect(() => {
    if (endedRef.current) return;
    if ((TERMINAL_PHASES as string[]).includes(phase)) {
      void finish();
      return;
    }
    if (phase !== "WRAP_UP" || botSpeaking) return;
    const handle = window.setTimeout(() => void finish(), 1500);
    return () => window.clearTimeout(handle);
  }, [botSpeaking, finish, phase]);

  // ------------------------------------------------------------- transcript ---

  const turns = useMemo<FeedTurn[]>(() => {
    const usable = messages.filter(
      (m) => (m.role === "user" || m.role === "assistant") && messageText(m) !== "",
    );
    if (usable.length > 0 && originRef.current === 0) {
      const first = Date.parse(usable[0].createdAt);
      originRef.current = Number.isNaN(first) ? 0 : first;
    }
    return usable.map((m, i) => ({
      id: `${m.createdAt}-${i}`,
      role: m.role === "user" ? "candidate" : "examiner",
      text: messageText(m),
      tMs: messageMs(m, originRef.current),
      pending: m.final === false,
    }));
  }, [messages]);

  // ------------------------------------------------------------------ render ---

  const cueCard = live?.cueCard ?? null;
  const showCue = cueCard !== null && phase.startsWith("P2_");
  const prepping = phase === "P2_INTRO" || phase === "P2_PREP";
  const serverError = live?.error ?? null;
  const navigate = useNavigate();
  const permissionProblem = isMicPermissionError(callError);
  // Retrying the audio connection cannot reach an unreachable model, so this case
  // gets Settings instead of a retry that is guaranteed to fail again.
  const providerProblem = isProviderError(callError);
  const callErrorText = callError === null ? null : describeError(callError);

  return (
    <div className="space-y-5">
      <LiveHud
        phase={phase}
        part={live?.part ?? null}
        socket={live?.socket ?? "connecting"}
        recording={isLive && micEnabled}
      />

      {/* Silence that nobody reports is the worst failure this screen has. The transport's
          media manager discards the error when microphone capture fails to start, so the call
          looks connected, the examiner waits, and the learner talks into nothing for a full
          minute before anything at all appears on screen. The level meter already knows; it
          just never said so. */}
      {micIsSilent && (
        <Notice tone="warning" title="Nothing is reaching the examiner from your microphone">
          {captureFault(localTrack)}
          {" "}
          If you changed the address of this page recently, the browser treats it as a new site
          and asks for microphone permission again.
        </Notice>
      )}

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/8 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 space-y-1">
            <p className="text-[13px] text-destructive">{serverError.detail}</p>
            <p className="text-[12px] text-muted-foreground">
              {serverError.recoverable
                ? "The session is trying to recover. Your transcript is safe."
                : "This session can't continue. Anything you already said is saved."}
            </p>
          </div>
        </div>
      )}

      {callErrorText && (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/8 p-3"
        >
          <p className="text-[13px] text-destructive">{callErrorText}</p>
          <div className="flex flex-wrap gap-2">
            {!providerProblem && (
              <Button size="sm" onClick={() => void connect()}>
                Try connecting again
              </Button>
            )}
            {providerProblem && (
              <Button size="sm" onClick={() => navigate("/settings")}>
                <Settings className="h-4 w-4" />
                Open provider settings
              </Button>
            )}
            {permissionProblem && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void window.bandready?.openExternal?.(
                    "https://support.apple.com/guide/mac-help/control-access-to-your-microphone-mchla1b1e1fe/mac",
                  );
                }}
              >
                <Settings className="h-4 w-4" />
                How to allow the microphone
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <CallStageTiles
            botSpeaking={botSpeaking}
            botLevel={botLevel}
            userSpeaking={userSpeaking}
            userLevel={userLevel}
            micEnabled={micEnabled}
            connected={isLive}
          />

          <Card>
            <CardContent className="pt-5">
              <CallControls
                state={callState}
                micEnabled={micEnabled}
                onToggleMic={toggleMic}
                onConnect={() => void connect()}
                onEnd={() => void endCall()}
                endLabel={mode.scored ? "End test" : "End session"}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {showCue && cueCard && (
            <CueCard
              card={cueCard}
              prepping={prepping}
              notes={notes}
              onNotesChange={setNotes}
            />
          )}
          <TranscriptFeed
            turns={turns}
            visible={showTranscript}
            onToggle={() => setShowTranscript((v) => !v)}
          />
        </div>
      </div>

      {/* Examiner audio playback. Without this element nothing is heard. */}
      <PipecatClientAudio />
    </div>
  );
}

// --------------------------------------------------------------- wrap-up view ---

interface WrapUpProps {
  sessionId: string;
  scoreable: boolean;
}

function WrapUp({ sessionId, scoreable }: WrapUpProps) {
  const navigate = useNavigate();
  const scoring = useSpeakingStore((s) => s.scoring);
  const scoreError = useSpeakingStore((s) => s.scoreError);
  const lastEnd = useSpeakingStore((s) => s.lastEnd);
  const score = useSpeakingStore((s) => s.score);

  const noSpeech = lastEnd !== null && lastEnd.turns === 0;
  // `lastEnd === null` means the hang-up POST has not answered yet — never flash a
  // "session ended, nothing to see" state while teardown is still in flight.
  const working = scoring || (lastEnd === null && scoreError === null);

  if (working) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              {scoring ? "Marking your answers" : "Finishing the session"}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {scoring
                ? "Your examiner is writing the assessment. On a local model this takes up to a minute. Leaving this screen does not cancel it."
                : "Saving your transcript and recordings."}
            </p>
          </div>
          <Progress
            value={null}
            label={scoring ? "Scoring" : "Saving"}
            detail={scoring ? "reading the transcript" : "closing the audio session"}
          />
          <div className="space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (scoreError) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={AlertTriangle}
            title="Scoring didn't finish"
            description={scoreError}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  onClick={async () => {
                    const reportId = await score(sessionId, { force: true });
                    if (reportId) navigate(`/speaking/report/${reportId}`, { replace: true });
                  }}
                >
                  Retry scoring
                </Button>
                <Button variant="outline" onClick={() => navigate("/speaking")}>
                  Back to Speaking
                </Button>
              </div>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <EmptyState
          icon={noSpeech ? AlertTriangle : CheckCircle2}
          title={noSpeech ? "Nothing was recorded" : "Session ended"}
          description={
            noSpeech
              ? "No speech reached the examiner, so there is nothing to mark. Check the microphone on the Speaking screen and try again."
              : scoreable
                ? "The transcript is saved. Open the report to see your bands."
                : "Practice sessions aren't scored, so there is no report. Run a full mock when you want a band estimate."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate("/speaking")}>Back to Speaking</Button>
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------- the route ---

type Stage = "loading" | "unavailable" | "live" | "wrapup";

export function LiveSession() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const attach = useSessionStore((s) => s.attach);
  const detach = useSessionStore((s) => s.detach);

  const adopt = useSpeakingStore((s) => s.adopt);
  const end = useSpeakingStore((s) => s.end);

  const [stage, setStage] = useState<Stage>("loading");
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [client, setClient] = useState<PipecatClient | null>(null);

  const activity = record?.activity ?? record?.mode ?? "full_mock";
  const scoreable = isScoreable(activity.split(":")[0]);

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
        // Keep the feature store's descriptor in step — `end()` reads its activity to
        // decide whether the session is scoreable.
        void adopt(sessionId);

        if (fetched.live) {
          setStage("live");
        } else if (fetched.report_id) {
          navigate(`/speaking/report/${fetched.report_id}`, { replace: true });
        } else {
          setStage("unavailable");
          setFatal(
            (TERMINAL_PHASES as string[]).includes(fetched.state)
              ? "This session has already finished."
              : "This session is no longer open on the practice engine.",
          );
        }
      } catch (err) {
        if (cancelled) return;
        setStage("unavailable");
        setFatal(
          err instanceof ApiError && err.status === 404
            ? "That speaking session doesn't exist any more."
            : describeError(err),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adopt, navigate, sessionId]);

  // ------------------------------------------------------- event stream (WS) ---

  useEffect(() => {
    if (stage !== "live" || !sessionId) return;
    void attach(sessionId);
    return () => detach();
  }, [attach, detach, sessionId, stage]);

  // ------------------------------------------------------------ pipecat client ---

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
            // Bearer auth on both the POST offer and the gotcha #4 trickle-ICE PATCH,
            // which the transport sends to this same URL with these same headers.
            headers: new Headers({ Authorization: `Bearer ${token}` }),
          },
          // Neither manager the transport ships is usable here. Daily's downloads its
          // call-machine bundle from a CDN the moment a call starts, which this app's CSP
          // blocks and which cannot work offline. Wav's captures through an AudioWorklet and
          // discards the error when that worklet fails to start, which is how a connected
          // call published silence for a full minute with nothing on screen but an SDK
          // lifecycle string. Ours opens the microphone with getUserMedia and hands over the
          // track, which is all `addUserMedia()` reads from it.
          mediaManager: new PlainMicMediaManager(),
        });
        created = new PipecatClient({ transport, enableMic: true, enableCam: false });
        if (cancelled) {
          void created.disconnect().catch((err: unknown) =>
            console.debug("[BandReady] speaking: disconnect after cancelled setup", err),
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
        console.debug("[BandReady] speaking: disconnect during teardown", err),
      );
    };
  }, [sessionId, stage]);

  // ------------------------------------------------------------------ ending ---

  const onEnded = useCallback(() => {
    setStage("wrapup");
    detach();
    void (async () => {
      // `scoreable` comes from the session record we already have, not from the store's
      // descriptor — `adopt()` may still be in flight on a cold reload.
      const reportId = await end(sessionId, { score: scoreable });
      if (reportId) navigate(`/speaking/report/${reportId}`, { replace: true });
    })();
  }, [detach, end, navigate, scoreable, sessionId]);

  // ------------------------------------------------------------------ render ---

  const title = `Speaking: ${activityLabel(activity)}`;

  return (
    <PageShell
      title={title}
      description={
        stage === "live"
          ? "Live session. Everything you say is recorded so it can be marked."
          : "Session summary"
      }
      actions={
        stage === "live" ? null : (
          <Button variant="ghost" size="sm" onClick={() => navigate("/speaking")}>
            <ArrowLeft className="h-4 w-4" />
            Speaking
          </Button>
        )
      }
    >
      {stage === "loading" && (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {stage === "unavailable" && (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={FileText}
              title="This session isn't live"
              description={fatal ?? "The practice engine has no open session with that id."}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => navigate("/speaking")}>Back to Speaking</Button>
                  {record?.report_id && (
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/speaking/report/${record.report_id}`)}
                    >
                      Open its report
                    </Button>
                  )}
                </div>
              }
            />
          </CardContent>
        </Card>
      )}

      {stage === "live" &&
        (client ? (
          <PipecatClientProvider client={client}>
            <CallStage activity={activity} onEnded={onEnded} />
          </PipecatClientProvider>
        ) : (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ))}

      {stage === "wrapup" && <WrapUp sessionId={sessionId} scoreable={scoreable} />}
    </PageShell>
  );
}

export default LiveSession;

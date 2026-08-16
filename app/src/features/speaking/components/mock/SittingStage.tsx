/**
 * The sitting itself — everything inside the live WebRTC call.
 *
 * ## What is deliberately absent
 *
 * No transcript, no vocabulary, no model answers, no hints, no "how am I doing",
 * no link to the Topic Coach, and no mute button. Each of those would change the
 * measurement: a candidate reading their own words back is not speaking under exam
 * conditions, and a mock you can quietly pause is a practice session wearing a
 * costume. The only control is the way out, and it asks first.
 *
 * ## What the renderer is allowed to do
 *
 * Paint. Phase, part, timers and the cue card all arrive as server events (18 §5) and
 * are mirrored into `useSessionStore.live`; nothing here advances the state machine.
 * The one local clock is the long-turn stopwatch, and it is used solely to word the
 * notice *after* the examiner has already moved on.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Ear, Mic, Settings, Square } from "lucide-react";
import { RTVIEvent, type RTVIMessage, type TransportState } from "@pipecat-ai/client-js";
import {
  PipecatClientAudio,
  useRTVIClientEvent,
  usePipecatClient,
  usePipecatClientMediaTrack,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { AudioWaveform, Button, useConfirm } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { useSessionStore } from "@/stores";
import { TERMINAL_PHASES, describeError, isMicPermissionError } from "../phases";
import { useTrackLevel } from "../useTrackLevel";
import { useSpeakingStore } from "../../store";
import { PartTransition } from "./PartTransition";
import { PrepPad } from "./PrepPad";
import { SittingHud } from "./SittingHud";
import { useMockStore } from "./store";
import type { PartNumber } from "./analysis";

/** Above this the long turn plainly ran to the hard 2:00 limit (04 §3.2). */
const CUT_OFF_AT_S = 115;

interface TurnIndicatorProps {
  examinerSpeaking: boolean;
  examinerLevel: number;
  candidateSpeaking: boolean;
  candidateLevel: number;
  connected: boolean;
}

/**
 * Whose turn it is, said in words as well as in motion. This is the whole centre of
 * the screen for Parts 1 and 3 — there is nothing else a candidate should be looking
 * at while they talk.
 */
function TurnIndicator({
  examinerSpeaking,
  examinerLevel,
  candidateSpeaking,
  candidateLevel,
  connected,
}: TurnIndicatorProps) {
  const status = !connected
    ? "Waiting for the examiner"
    : examinerSpeaking
      ? "The examiner is speaking"
      : candidateSpeaking
        ? "You are speaking"
        : "Your turn";

  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-6 py-10">
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full transition-colors",
          examinerSpeaking
            ? "bg-primary/12 text-primary"
            : connected
              ? "bg-muted text-muted-foreground"
              : "bg-muted text-muted-foreground/60",
        )}
        aria-hidden="true"
      >
        {examinerSpeaking ? <Ear className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
      </div>

      <p className="text-[15px] font-medium" aria-live="polite">
        {status}
      </p>

      <AudioWaveform
        level={examinerSpeaking ? examinerLevel : candidateLevel}
        active={connected && (examinerSpeaking || candidateSpeaking)}
        bars={7}
        status={status}
        className="h-10"
      />
    </div>
  );
}

function callConnected(transport: TransportState): boolean {
  return transport === "connected" || transport === "ready";
}

export interface SittingStageProps {
  /** Called once the call is torn down and the wrap-up should take over. */
  onEnded: () => void;
}

export function SittingStage({ onEnded }: SittingStageProps) {
  const confirm = useConfirm();
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();

  const live = useSessionStore((s) => s.live);
  const notes = useMockStore((s) => s.notes);
  const setNotes = useMockStore((s) => s.setNotes);
  // The device the learner tested on the pre-flight screen, remembered across runs.
  const micId = useSpeakingStore((s) => s.micId);

  const [callError, setCallError] = useState<unknown>(null);
  const [examinerSpeaking, setExaminerSpeaking] = useState(false);
  const [candidateSpeaking, setCandidateSpeaking] = useState(false);
  const [transition, setTransition] = useState<PartNumber | null>(null);
  const [cutNotice, setCutNotice] = useState<string | null>(null);

  const connectedOnce = useRef(false);
  const endedRef = useRef(false);
  const announcedPart = useRef<number | null>(null);
  const longTurnStart = useRef<number | null>(null);

  const phase = live?.phase ?? "CONNECTING";
  const connected = callConnected(transportState);

  const localTrack = usePipecatClientMediaTrack("audio", "local");
  const botTrack = usePipecatClientMediaTrack("audio", "bot");
  const candidateLevel = useTrackLevel(localTrack, connected);
  const examinerLevel = useTrackLevel(botTrack, connected);

  // ------------------------------------------------------------ rtvi events ---

  useRTVIClientEvent(
    RTVIEvent.BotStartedSpeaking,
    useCallback(() => {
      setExaminerSpeaking(true);
      setCallError(null);
    }, []),
  );
  useRTVIClientEvent(
    RTVIEvent.BotStoppedSpeaking,
    useCallback(() => setExaminerSpeaking(false), []),
  );
  useRTVIClientEvent(
    RTVIEvent.UserStartedSpeaking,
    useCallback(() => setCandidateSpeaking(true), []),
  );
  useRTVIClientEvent(
    RTVIEvent.UserStoppedSpeaking,
    useCallback(() => setCandidateSpeaking(false), []),
  );
  useRTVIClientEvent(
    RTVIEvent.Error,
    useCallback((event: RTVIMessage) => {
      const data = event.data as { message?: string } | undefined;
      setCallError(new Error(data?.message ?? "The practice engine reported an error."));
    }, []),
  );
  useRTVIClientEvent(
    RTVIEvent.Disconnected,
    useCallback(() => {
      setExaminerSpeaking(false);
      setCandidateSpeaking(false);
    }, []),
  );

  // ---------------------------------------------------------------- connect ---

  const connect = useCallback(async () => {
    if (!client) return;
    setCallError(null);
    try {
      // `initDevices()` must complete before `connect()` — otherwise the peer
      // connection is negotiated with no local track and the examiner silently hears
      // nothing for the whole test.
      await client.initDevices();
      if (micId) {
        try {
          client.updateMic(micId);
        } catch {
          // The remembered device is gone; the system default is the right fallback.
        }
      }
      await client.connect();
    } catch (err) {
      setCallError(err);
    }
  }, [client, micId]);

  useEffect(() => {
    if (!client || connectedOnce.current) return;
    connectedOnce.current = true;
    void connect();
  }, [client, connect]);

  // ------------------------------------------------------------------- end ---

  const teardown = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      await client?.disconnect();
    } catch {
      /* already tearing down */
    }
    onEnded();
  }, [client, onEnded]);

  const abandon = useCallback(async () => {
    if (endedRef.current) return;
    const ok = await confirm({
      title: "Stop the test now?",
      message:
        "The attempt still counts and is marked on what you have said so far. You cannot resume it or retake a part. The next mock starts again from Part 1.",
      confirmLabel: "Stop and mark",
      destructive: true,
    });
    if (!ok) return;
    await teardown();
  }, [confirm, teardown]);

  /**
   * The examiner ends the test, not the button: the controller reaches WRAP_UP, speaks
   * its closing line and then waits. Give the closing line room to finish, then tear
   * the call down. A terminal phase means it is already over.
   */
  useEffect(() => {
    if (endedRef.current) return;
    if ((TERMINAL_PHASES as string[]).includes(phase)) {
      void teardown();
      return;
    }
    if (phase !== "WRAP_UP" || examinerSpeaking) return;
    const handle = window.setTimeout(() => void teardown(), 1_800);
    return () => window.clearTimeout(handle);
  }, [examinerSpeaking, phase, teardown]);

  // ----------------------------------------------------- part announcements ---

  useEffect(() => {
    const part = live?.part ?? null;
    if (part === null || part === announcedPart.current) return;
    if (part !== 1 && part !== 2 && part !== 3) return;
    announcedPart.current = part;
    setTransition(part);
  }, [live?.part]);

  /**
   * The interstitial must never outlive its welcome. Part 2's transition fires at
   * P2_INTRO, and the preparation minute can start while it is still on screen —
   * three seconds of a sixty-second minute spent looking at a card that is covering
   * the task card. The moment the candidate needs the card, the notice goes.
   */
  useEffect(() => {
    if (phase === "P2_PREP" || phase === "P2_LONG_TURN") setTransition(null);
  }, [phase]);

  // ------------------------------------------------------- long-turn notice ---

  useEffect(() => {
    if (phase === "P2_LONG_TURN") {
      if (longTurnStart.current === null) longTurnStart.current = Date.now();
      setCutNotice(null);
      return;
    }
    if (longTurnStart.current === null) return;
    const spokeS = (Date.now() - longTurnStart.current) / 1000;
    longTurnStart.current = null;
    // Only worth saying when the long turn actually ran; a phase error two seconds in
    // is not a "you were stopped at two minutes" moment.
    if (spokeS < 5) return;
    setCutNotice(
      spokeS >= CUT_OFF_AT_S
        ? "“Thank you.” The examiner stopped you at the two-minute limit."
        : `You spoke for ${formatDuration(Math.round(spokeS))}. The long turn is over.`,
    );
  }, [phase]);

  // Expiry is its own effect so that a phase change during the eight seconds cannot
  // cancel the timer and strand the notice on screen for the rest of the test.
  useEffect(() => {
    if (!cutNotice) return;
    const handle = window.setTimeout(() => setCutNotice(null), 8_000);
    return () => window.clearTimeout(handle);
  }, [cutNotice]);

  // ---------------------------------------------------------------- render ---

  const cueCard = live?.cueCard ?? null;
  const inPart2 = phase.startsWith("P2_") && cueCard !== null;
  const preparing = phase === "P2_INTRO" || phase === "P2_PREP";
  const serverError = live?.error ?? null;
  const permissionProblem = isMicPermissionError(callError);
  const callErrorText = callError === null ? null : describeError(callError);
  const onTransitionDone = useCallback(() => setTransition(null), []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-5">
      <SittingHud
        phase={phase}
        part={live?.part ?? null}
        socket={live?.socket ?? "connecting"}
        recording={connected}
      />

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/8 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-[13px] text-destructive">
            {serverError.detail}{" "}
            <span className="text-muted-foreground">
              {serverError.recoverable
                ? "The session is recovering; everything you have said is saved."
                : "This sitting cannot continue. Everything you said is saved and can still be marked."}
            </span>
          </p>
        </div>
      )}

      {callErrorText && (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/8 p-3"
        >
          <p className="text-[13px] text-destructive">{callErrorText}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void connect()}>
              Reconnect
            </Button>
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

      {cutNotice && (
        <p
          role="status"
          className="rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-[13px] text-muted-foreground"
        >
          {cutNotice}
        </p>
      )}

      {transition !== null ? (
        <PartTransition part={transition} onDone={onTransitionDone} />
      ) : inPart2 && cueCard ? (
        <div className="space-y-4">
          <PrepPad
            card={cueCard}
            preparing={preparing}
            notes={notes}
            onNotesChange={setNotes}
          />
          <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <AudioWaveform
              level={examinerSpeaking ? examinerLevel : candidateLevel}
              active={connected && (examinerSpeaking || candidateSpeaking)}
              bars={5}
              status={examinerSpeaking ? "The examiner is speaking" : "Your turn"}
            />
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {examinerSpeaking
                ? "The examiner is speaking"
                : preparing
                  ? "Prepare in silence. The examiner will tell you when to start"
                  : "Speak until you are stopped"}
            </p>
          </div>
        </div>
      ) : (
        <TurnIndicator
          examinerSpeaking={examinerSpeaking}
          examinerLevel={examinerLevel}
          candidateSpeaking={candidateSpeaking}
          candidateLevel={candidateLevel}
          connected={connected}
        />
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-[12px] text-muted-foreground">
          No feedback until the test ends. Nothing on this screen can be paused.
        </p>
        <Button variant="ghost" size="sm" onClick={() => void abandon()}>
          <Square className="h-3.5 w-3.5" />
          Stop the test
        </Button>
      </div>

      {/* Without this element the examiner is inaudible. */}
      <PipecatClientAudio />
    </div>
  );
}

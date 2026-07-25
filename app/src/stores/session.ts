import { create } from "zustand";
import { api, ApiError, type HealthResponse } from "@/lib/api";

/**
 * Global store #1 (01 §7.1): the sidecar contract plus a read-only mirror of the
 * live speaking session. The renderer NEVER advances the session state machine —
 * it displays whatever `state`/`timer` events arrive over the WS (18 §5).
 */

export type SpeakingPhase =
  | "IDLE"
  | "CONNECTING"
  | "P1_INTRO"
  | "P1_QA"
  | "P2_INTRO"
  | "P2_PREP"
  | "P2_LONG_TURN"
  | "P2_ROUNDING"
  | "P3_DISCUSS"
  | "WRAP_UP"
  | "SCORING"
  | "FEEDBACK"
  | "RECONNECTING"
  | "ABORTED"
  | "ERROR"
  | "COACH_QA"
  | "COACH_FEEDBACK"
  | "CHAT";

export interface CueCard {
  topic: string;
  bullets: string[];
}

export type SessionEvent =
  | { type: "state"; state: SpeakingPhase; part?: number; deadline_utc?: string }
  | { type: "cue_card"; card: CueCard }
  | { type: "timer"; id: string; remaining_ms: number }
  | { type: "scoring"; status: "running" | "retrying" }
  | { type: "report"; report_id: string }
  | { type: "error"; detail: string; code: string; recoverable: boolean };

export interface LiveSession {
  sessionId: string;
  phase: SpeakingPhase;
  part: number | null;
  deadlineUtc: string | null;
  /** timer id ("p2_prep", "p2_long_turn_max", …) → remaining milliseconds. */
  timers: Record<string, number>;
  cueCard: CueCard | null;
  scoring: "running" | "retrying" | null;
  reportId: string | null;
  error: { detail: string; code: string; recoverable: boolean } | null;
  /** WS connectivity, distinct from the server-side RECONNECTING phase. */
  socket: "closed" | "connecting" | "open";
}

interface SessionState {
  baseUrl: string | null;
  token: string | null;
  /** True when the sidecar failed its last reachability check. */
  offline: boolean;
  health: HealthResponse | null;
  checking: boolean;
  /**
   * Bumped every time the sidecar comes back after being unreachable. Screens can
   * subscribe to refetch what they lost, instead of stranding the user on stale
   * data or a dead error state.
   */
  generation: number;
  /** True for a few seconds after a recovery, so the banner can confirm it. */
  justRecovered: boolean;

  live: LiveSession | null;

  /** Resolve the sidecar contract and ping /health. Never throws. */
  connect: () => Promise<void>;
  /**
   * Start the global reachability watch: instant offline flag from any failed
   * request, then poll /health until the sidecar answers again. Idempotent;
   * returns a stop function.
   */
  watch: () => () => void;
  /** Open the session-events WS and mirror it into `live`. Never throws. */
  attach: (sessionId: string) => Promise<void>;
  detach: () => void;
  applyEvent: (event: SessionEvent) => void;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attachedId: string | null = null;
/**
 * Monotonic attach token. Guarding on `attachedId` alone is not enough: React
 * StrictMode mounts effects twice, so a detach → re-attach cycle restores the SAME
 * session id while the first `open()` is still awaiting its ticket. Both would then
 * pass the guard and open a socket, and the module-level `socket` ref would keep only
 * the second — leaking the first for the whole session. A generation counter never
 * repeats, so only the newest attach may open or reconnect.
 */
let attachGeneration = 0;

// ------------------------------------------------- sidecar reachability watch ---

/** How long the "back online" confirmation stays up before it fades. */
const RECOVERED_NOTICE_MS = 4_000;
const PROBE_MIN_MS = 1_000;
const PROBE_MAX_MS = 10_000;

let watchers = 0;
let stopReachability: (() => void) | null = null;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probeDelay = PROBE_MIN_MS;

type Getter = () => SessionState;

/**
 * While offline, re-probe /health on a capped exponential backoff. A local
 * process usually comes back within a second or two, so we start fast and ease
 * off rather than hammering a machine that is already busy restarting.
 */
function scheduleProbe(get: Getter): void {
  if (probeTimer) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    if (!get().offline) {
      probeDelay = PROBE_MIN_MS;
      return;
    }
    void get()
      .connect()
      .then(() => {
        if (get().offline) {
          probeDelay = Math.min(probeDelay * 2, PROBE_MAX_MS);
          scheduleProbe(get);
        } else {
          probeDelay = PROBE_MIN_MS;
        }
      });
  }, probeDelay);
}

function blankLive(sessionId: string): LiveSession {
  return {
    sessionId,
    phase: "IDLE",
    part: null,
    deadlineUtc: null,
    timers: {},
    cueCard: null,
    scoring: null,
    reportId: null,
    error: null,
    socket: "connecting",
  };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  baseUrl: null,
  token: null,
  offline: false,
  health: null,
  checking: false,
  generation: 0,
  justRecovered: false,
  live: null,

  connect: async () => {
    set({ checking: true });
    const wasOffline = get().offline;
    try {
      // A restarted sidecar gets a NEW random port and a NEW bearer token, so the
      // cached contract must be dropped before we re-resolve it. Skipping this is
      // why a recovered sidecar would otherwise keep 401-ing forever.
      if (wasOffline) api.reset();
      const contract = await api.contract();
      const health = await api.health();
      set({
        baseUrl: contract.baseUrl,
        token: contract.token,
        health,
        offline: false,
        checking: false,
        ...(wasOffline
          ? { generation: get().generation + 1, justRecovered: true }
          : {}),
      });
      if (wasOffline) {
        setTimeout(() => set({ justRecovered: false }), RECOVERED_NOTICE_MS);
      }
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error("[BandReady] unexpected error while probing the sidecar", err);
      }
      set({ offline: true, health: null, checking: false });
    }
  },

  watch: () => {
    watchers += 1;
    if (watchers === 1) {
      // 1. React immediately to any request that could not reach the process.
      stopReachability = api.onReachability((reachable) => {
        if (!reachable) {
          if (!get().offline) set({ offline: true, health: null });
          scheduleProbe(get);
        } else if (get().offline) {
          // A request succeeded before our poll noticed — reconcile now.
          void get().connect();
        }
      });
      // 2. If we booted while the sidecar was still starting, keep probing.
      if (get().offline) scheduleProbe(get);
    }
    return () => {
      watchers -= 1;
      if (watchers > 0) return;
      stopReachability?.();
      stopReachability = null;
      if (probeTimer) {
        clearTimeout(probeTimer);
        probeTimer = null;
      }
      probeDelay = PROBE_MIN_MS;
    };
  },

  attach: async (sessionId: string) => {
    if (attachedId === sessionId && socket && socket.readyState <= WebSocket.OPEN) return;
    get().detach();
    attachedId = sessionId;
    const generation = ++attachGeneration;
    set({ live: blankLive(sessionId) });

    const open = async () => {
      if (generation !== attachGeneration) return;
      try {
        const url = await api.wsUrl(`/api/v1/speaking/sessions/${sessionId}/events`, sessionId);
        // The ticket fetch is async — a detach or a newer attach may have landed.
        if (generation !== attachGeneration) return;
        const ws = new WebSocket(url);
        socket = ws;

        ws.onopen = () => {
          set((s) => (s.live ? { live: { ...s.live, socket: "open" } } : {}));
        };
        ws.onmessage = (ev) => {
          try {
            get().applyEvent(JSON.parse(String(ev.data)) as SessionEvent);
          } catch {
            /* ignore malformed frames rather than killing the session view */
          }
        };
        ws.onerror = () => {
          set((s) => (s.live ? { live: { ...s.live, socket: "connecting" } } : {}));
        };
        ws.onclose = () => {
          if (generation !== attachGeneration) return;
          set((s) => (s.live ? { live: { ...s.live, socket: "closed" } } : {}));
          const phase = get().live?.phase;
          // Terminal phases stay closed; anything else re-tickets and reopens.
          if (phase && ["FEEDBACK", "ABORTED", "ERROR"].includes(phase)) return;
          reconnectTimer = setTimeout(() => {
            set((s) => (s.live ? { live: { ...s.live, socket: "connecting" } } : {}));
            void open();
          }, 1500);
        };
      } catch {
        set((s) => (s.live ? { live: { ...s.live, socket: "closed" } } : {}));
        set({ offline: true });
      }
    };

    await open();
  },

  detach: () => {
    attachedId = null;
    // Invalidate any in-flight open()/reconnect belonging to the previous attach.
    attachGeneration += 1;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.close();
      socket = null;
    }
    set({ live: null });
  },

  applyEvent: (event) => {
    set((s) => {
      const live = s.live;
      if (!live) return {};
      switch (event.type) {
        case "state":
          return {
            live: {
              ...live,
              phase: event.state,
              part: event.part ?? live.part,
              deadlineUtc: event.deadline_utc ?? null,
              error: event.state === "ERROR" ? live.error : null,
            },
          };
        case "cue_card":
          return { live: { ...live, cueCard: event.card } };
        case "timer":
          return { live: { ...live, timers: { ...live.timers, [event.id]: event.remaining_ms } } };
        case "scoring":
          return { live: { ...live, scoring: event.status } };
        case "report":
          return { live: { ...live, reportId: event.report_id, scoring: null } };
        case "error":
          return {
            live: {
              ...live,
              error: {
                detail: event.detail,
                code: event.code,
                recoverable: event.recoverable,
              },
            },
          };
        default:
          return {};
      }
    });
  },
}));

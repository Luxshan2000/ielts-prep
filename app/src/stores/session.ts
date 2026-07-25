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

  live: LiveSession | null;

  /** Resolve the sidecar contract and ping /health. Never throws. */
  connect: () => Promise<void>;
  /** Open the session-events WS and mirror it into `live`. Never throws. */
  attach: (sessionId: string) => Promise<void>;
  detach: () => void;
  applyEvent: (event: SessionEvent) => void;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attachedId: string | null = null;

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
  live: null,

  connect: async () => {
    set({ checking: true });
    try {
      const contract = await api.contract();
      const health = await api.health();
      set({
        baseUrl: contract.baseUrl,
        token: contract.token,
        health,
        offline: false,
        checking: false,
      });
    } catch (err) {
      set({
        offline: true,
        health: null,
        checking: false,
        ...(err instanceof ApiError ? {} : {}),
      });
    }
  },

  attach: async (sessionId: string) => {
    if (attachedId === sessionId && socket && socket.readyState <= WebSocket.OPEN) return;
    get().detach();
    attachedId = sessionId;
    set({ live: blankLive(sessionId) });

    const open = async () => {
      if (attachedId !== sessionId) return;
      try {
        const url = await api.wsUrl(`/api/v1/speaking/sessions/${sessionId}/events`, sessionId);
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
          if (attachedId !== sessionId) return;
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

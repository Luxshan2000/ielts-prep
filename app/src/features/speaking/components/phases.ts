/**
 * Canonical phase vocabulary → human copy, plus the timer metadata the live HUD
 * needs. The phase strings are the wire values from 04 §3.1 / 18 §5 (R2-11) —
 * never invent a label the server can't send.
 */

import type { SpeakingPhase } from "@/stores";
import type { CriterionKey, SpeakingActivity } from "../store";

export interface PhaseMeta {
  /** Human-readable label shown in the HUD. */
  label: string;
  /** One line of exam-register instruction (12 §12: exam-serious in mock mode). */
  hint: string;
  part: number | null;
  /** True while the candidate is expected to be speaking or listening live. */
  live: boolean;
}

export const PHASE_META: Record<SpeakingPhase, PhaseMeta> = {
  IDLE: { label: "Not started", hint: "Press start when you are ready.", part: null, live: false },
  CONNECTING: {
    label: "Connecting",
    hint: "Setting up the audio connection to your examiner.",
    part: null,
    live: false,
  },
  P1_INTRO: {
    label: "Part 1 — Introduction",
    hint: "The examiner will confirm who you are. Answer briefly.",
    part: 1,
    live: true,
  },
  P1_QA: {
    label: "Part 1 — Interview",
    hint: "Short answers with a reason. Two or three sentences is right.",
    part: 1,
    live: true,
  },
  P2_INTRO: {
    label: "Part 2 — Task card",
    hint: "Listen to the task, then read the card below.",
    part: 2,
    live: true,
  },
  P2_PREP: {
    label: "Part 2 — Preparation",
    hint: "You have one minute to prepare. You can make notes if you wish.",
    part: 2,
    live: true,
  },
  P2_LONG_TURN: {
    label: "Part 2 — Long turn",
    hint: "Speak for one to two minutes. The examiner will stop you at two minutes.",
    part: 2,
    live: true,
  },
  P2_ROUNDING: {
    label: "Part 2 — Rounding off",
    hint: "One or two short questions. Brief answers are fine.",
    part: 2,
    live: true,
  },
  P3_DISCUSS: {
    label: "Part 3 — Discussion",
    hint: "Give opinions about people and society in general, and justify them.",
    part: 3,
    live: true,
  },
  WRAP_UP: {
    label: "Finishing",
    hint: "That is the end of the test.",
    part: null,
    live: true,
  },
  SCORING: {
    label: "Scoring",
    hint: "Your examiner is writing the assessment.",
    part: null,
    live: false,
  },
  FEEDBACK: {
    label: "Report ready",
    hint: "Your report is ready to open.",
    part: null,
    live: false,
  },
  RECONNECTING: {
    label: "Reconnecting",
    hint: "The connection dropped. Reconnecting — your transcript is safe.",
    part: null,
    live: true,
  },
  ABORTED: {
    label: "Ended early",
    hint: "The session ended before a part was completed.",
    part: null,
    live: false,
  },
  ERROR: {
    label: "Session error",
    hint: "Something went wrong. Your transcript is saved.",
    part: null,
    live: false,
  },
  COACH_QA: {
    label: "Drill — your turn",
    hint: "Answer the coach's question as fully as you can.",
    part: null,
    live: true,
  },
  COACH_FEEDBACK: {
    label: "Drill — coaching",
    hint: "Listen to the feedback, then try again or move on.",
    part: null,
    live: true,
  },
  CHAT: {
    label: "Quick chat",
    hint: "Just talk. Nothing here is scored.",
    part: null,
    live: true,
  },
};

export function phaseMeta(phase: SpeakingPhase | null | undefined): PhaseMeta {
  return (phase && PHASE_META[phase]) || PHASE_META.IDLE;
}

export const TERMINAL_PHASES: SpeakingPhase[] = ["FEEDBACK", "ABORTED", "ERROR"];

/** 04 §3.2 timer table. `total` is the server default, used only for the ring. */
export interface TimerMeta {
  id: string;
  label: string;
  total: number;
  /** Hard timers cut the candidate off; soft ones only nudge the controller. */
  hard: boolean;
}

export const TIMERS: Record<string, TimerMeta> = {
  p1_budget: { id: "p1_budget", label: "Part 1", total: 270, hard: false },
  p2_prep: { id: "p2_prep", label: "Preparation", total: 60, hard: true },
  p2_long_turn_min: { id: "p2_long_turn_min", label: "Minimum", total: 60, hard: false },
  p2_long_turn_max: { id: "p2_long_turn_max", label: "Long turn", total: 120, hard: true },
  p3_budget: { id: "p3_budget", label: "Part 3", total: 270, hard: false },
  silence: { id: "silence", label: "Silence", total: 10, hard: false },
  reconnect_grace: { id: "reconnect_grace", label: "Reconnecting", total: 15, hard: true },
};

/** The timer to show large in the HUD for a given phase. */
export const PRIMARY_TIMER: Partial<Record<SpeakingPhase, string>> = {
  P1_QA: "p1_budget",
  P2_PREP: "p2_prep",
  P2_LONG_TURN: "p2_long_turn_max",
  P3_DISCUSS: "p3_budget",
  RECONNECTING: "reconnect_grace",
};

// ------------------------------------------------------------------- modes ---

export interface ModeMeta {
  id: SpeakingActivity;
  label: string;
  blurb: string;
  duration: string;
  scored: boolean;
  /** Which extra picker the mode needs. */
  needs: "card_set" | "part" | "topic" | "none";
}

export const MODES: ModeMeta[] = [
  {
    id: "full_mock",
    label: "Full mock",
    blurb: "Parts 1, 2 and 3 back to back with authentic timing and no coaching.",
    duration: "11–14 min",
    scored: true,
    needs: "card_set",
  },
  {
    id: "single_part",
    label: "Single part",
    blurb: "One part only, timed exactly as in the test. Scored at the end of the part.",
    duration: "4–5 min",
    scored: true,
    needs: "part",
  },
  {
    id: "topic_drill",
    label: "Topic drill",
    blurb: "Question by question on one topic, with spoken coaching after each answer.",
    duration: "untimed",
    scored: false,
    needs: "topic",
  },
  {
    id: "quick_chat",
    label: "Quick chat",
    blurb: "Free conversation to warm up. Never scored, no bands.",
    duration: "untimed",
    scored: false,
    needs: "none",
  },
];

export function modeMeta(activity: string | null | undefined): ModeMeta {
  return MODES.find((m) => m.id === activity) ?? MODES[0];
}

/** `single_part:2` → "Single part · Part 2". */
export function activityLabel(activity: string | null | undefined): string {
  if (!activity) return "Speaking";
  const [kind, part] = activity.split(":");
  const meta = MODES.find((m) => m.id === kind);
  const base = meta?.label ?? kind.replace(/_/g, " ");
  return part ? `${base} · Part ${part}` : base;
}

// -------------------------------------------------------------- criteria ---

export const CRITERIA: { key: CriterionKey; label: string; short: string }[] = [
  { key: "fc", label: "Fluency & Coherence", short: "Fluency" },
  { key: "lr", label: "Lexical Resource", short: "Lexical" },
  { key: "gra", label: "Grammatical Range & Accuracy", short: "Grammar" },
  { key: "pron", label: "Pronunciation", short: "Pronun." },
];

/**
 * Paraphrased public band descriptors, bands 4–9 (04 §6.2) — criterion facts in
 * our own wording. Rendered in the "what does this band mean" popovers.
 */
export const DESCRIPTORS: Record<CriterionKey, Record<number, string>> = {
  fc: {
    9: "Speaks effortlessly at length; any pause is for thinking of ideas, not words; ideas fully connected and on-point.",
    8: "Talks at length with only rare repetition or self-correction; hesitation is idea-driven; topics develop logically.",
    7: "Keeps going without obvious effort; some language-driven hesitation or repetition; uses a range of linkers with some flexibility.",
    6: "Willing to talk at length, but coherence sometimes breaks down; noticeable repetition, self-correction, or over-used simple linkers.",
    5: "Keeps the flow only by repeating, self-correcting, or slowing down; fluent stretches happen only in simple language.",
    4: "Cannot keep going without noticeable long pauses; speech slow with frequent repetition; links often break.",
  },
  lr: {
    9: "Complete flexibility and precision; idiomatic language used naturally and accurately throughout.",
    8: "Wide vocabulary deployed precisely; paraphrases skilfully; occasional misfire with idiom or collocation.",
    7: "Handles varied topics flexibly; some less-common and idiomatic items with style awareness; paraphrases effectively.",
    6: "Vocabulary broad enough to discuss topics at length and be clear, despite wrong word choices; paraphrase mostly works.",
    5: "Can talk about familiar and unfamiliar topics but with limited flexibility; attempts paraphrase with mixed results.",
    4: "Confined to familiar topics; frequent wrong word choices; rarely attempts paraphrase.",
  },
  gra: {
    9: "Full range of structures used naturally; the only slips are the kind fluent speakers also make.",
    8: "Wide range of structures, most sentences error-free; only very occasional slips or unnatural choices.",
    7: "Uses a range of complex structures with some flexibility; frequent error-free sentences, though some errors persist.",
    6: "Mixes simple and complex forms with limited flexibility; complex sentences often contain errors, but meaning usually survives.",
    5: "Basic sentence forms reasonably accurate; complex structures attempted but usually faulty.",
    4: "Mostly short or memorized utterances; frequent errors even in basic forms; subordinate clauses rare.",
  },
  pron: {
    9: "Uses the full toolkit of stress, rhythm and intonation precisely; effortless to understand throughout.",
    8: "Wide range of features used flexibly; accent has minimal effect on how easily the listener understands.",
    7: "Shows all the strengths of band 6 plus stretches of band-8 control; lapses occur but rarely obscure meaning.",
    6: "Uses a range of features with mixed control; some mispronounced words, but the listener can generally follow.",
    5: "Some effective features but not sustained; mispronunciations cause the listener occasional strain.",
    4: "Limited range of features; frequent lapses; mispronunciations put real strain on the listener.",
  },
};

export function descriptorFor(key: CriterionKey, band: number | null | undefined): string | null {
  if (band === null || band === undefined) return null;
  const rounded = Math.min(9, Math.max(4, Math.round(band)));
  return DESCRIPTORS[key][rounded] ?? null;
}

// ---------------------------------------------------------------- errors ---

/**
 * 02 §6.4 error copy, ported from OpenVoiceUI's `describeError()`. Mic-permission
 * failures get the OS-specific action, never a generic "something went wrong".
 */
export function describeError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && "detail" in err) {
    const api = err as { code: string; detail: string; status?: number };
    if (api.status === 0) {
      return "Couldn't reach the practice engine. It may still be starting — wait a few seconds and retry.";
    }
    return api.detail || "The practice engine reported an error.";
  }
  // Pipecat's `makeRequest` rejects with the raw `Response` when the SDP exchange
  // fails, so a dead session or a voice-less build arrives here, not as an Error.
  if (typeof Response !== "undefined" && err instanceof Response) {
    if (err.status === 404) {
      return "This session is no longer open on the practice engine. Start a new one from the Speaking room.";
    }
    if (err.status === 401 || err.status === 403) {
      return "The practice engine refused the audio connection. Restart BandReady and try again.";
    }
    if (err.status === 501 || err.status === 502) {
      return "The voice engine isn't available in this build, so live speaking sessions can't run.";
    }
    return `The practice engine refused the audio connection (HTTP ${err.status}).`;
  }
  if (err instanceof Error) {
    if (err.name === "NotAllowedError" || /permission|denied/i.test(err.message)) {
      return "Microphone permission denied. Open System Settings → Privacy & Security → Microphone, allow BandReady, then try again.";
    }
    if (err.name === "NotFoundError" || /no microphone|not found/i.test(err.message)) {
      return "No microphone was found. Plug in or select a microphone and try again.";
    }
    if (err.name === "NotReadableError") {
      return "Your microphone is in use by another app. Close it and try again.";
    }
    if (isProviderError(err)) {
      // The examiner's turn is an LLM call. When the configured model is unreachable —
      // a local engine that isn't running, a wrong base URL, a missing key — the voice
      // pipeline surfaces it as a bare "Connection error", which tells a learner
      // nothing and sends them retrying a connection that cannot succeed. Name the
      // actual cause and point at the screen that fixes it.
      return "The examiner's language model could not be reached, so it cannot reply. Check Settings → Providers: a local engine has to be running, and a cloud model needs a valid key.";
    }
    return err.message || "Something went wrong starting the speaking session.";
  }
  return "Something went wrong starting the speaking session.";
}

/**
 * True when the failure is the configured LLM being unreachable rather than anything
 * about the audio path. Retrying the WebRTC connection cannot fix it, so the UI offers
 * Settings instead.
 */
export function isProviderError(err: unknown): boolean {
  const text =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === "string"
        ? err
        : "";
  if (!text) return false;
  return (
    /during completion/i.test(text) ||
    /connection error/i.test(text) ||
    /\b(llm|model|provider|openai|completion)\b/i.test(text) &&
      /\b(unreachable|refused|timed? out|not running|failed)\b/i.test(text)
  );
}

/** True when the failure is an OS-level microphone denial (drives the deep link). */
export function isMicPermissionError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "NotAllowedError" || /permission|denied/i.test(err.message))
  );
}

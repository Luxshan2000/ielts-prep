/**
 * Everything the mock sitting *says* to the candidate, in one file.
 *
 * Two rules govern this copy and both are load-bearing:
 *
 *  1. **The screen never teaches.** Inside the sitting the interface may state the
 *     format ("you have one minute to prepare") because a real examiner states it
 *     aloud, but it must never suggest content, vocabulary, structure or strategy.
 *     If a line here could help someone answer better *right now*, it belongs in
 *     the Topic Coach, not in the test.
 *  2. **Nothing here promises timing the server does not own.** The durations are
 *     the sidecar's own defaults (04 §3.2) restated for the candidate; the state
 *     machine remains the only thing that actually advances a part.
 */

import type { SpeakingPhase } from "@/stores";

/** One row of the "what is about to happen" table on the pre-flight screen. */
export interface PartOutline {
  part: 1 | 2 | 3;
  title: string;
  duration: string;
  what: string;
}

export const PART_OUTLINE: PartOutline[] = [
  {
    part: 1,
    title: "Introduction and interview",
    duration: "4–5 minutes",
    what: "The examiner confirms who you are, then asks short questions about two or three familiar subjects — where you live, your work or studies, everyday habits. Two or three sentences per answer is the right length.",
  },
  {
    part: 2,
    title: "The long turn",
    duration: "3–4 minutes",
    what: "You are given a task card. You have exactly one minute to prepare and may write notes, then you speak on your own for one to two minutes. The examiner stops you at two minutes and asks one or two brief follow-up questions.",
  },
  {
    part: 3,
    title: "Discussion",
    duration: "4–5 minutes",
    what: "A two-way discussion of the wider subject behind your task card. The examiner asks you to compare, explain, speculate and defend an opinion, and may push back on what you say.",
  },
];

/** The honest expectations block. Each line is a promise the sitting keeps. */
export interface Expectation {
  id: string;
  title: string;
  detail: string;
}

export const EXPECTATIONS: Expectation[] = [
  {
    id: "no-coaching",
    title: "No coaching, no hints, no model answers",
    detail:
      "The examiner never corrects you, never explains a question beyond one repeat, and never tells you how you are doing. Nothing on screen will help you answer. All of that comes afterwards, in the report.",
  },
  {
    id: "no-pausing",
    title: "You cannot pause or retake a part",
    detail:
      "Once it starts, the clock belongs to the examiner. If you stop early the attempt still counts and is scored on what you managed to say.",
  },
  {
    id: "timing",
    title: "11–14 minutes, three parts, back to back",
    detail:
      "Put your phone away and find somewhere you can speak out loud without interruption. Silence and hesitation are part of what is being measured.",
  },
  {
    id: "recorded",
    title: "Everything you say is recorded and transcribed",
    detail:
      "The recording stays on this machine. It is what the marking reads, so the microphone has to be working before you commit.",
  },
];

/**
 * The scripted interstitial shown as the sitting moves into a new part. Deliberately
 * a statement, not a menu: the real test has no menus between parts, and giving the
 * candidate a decision here is the fastest way to break the pretence.
 */
export interface Transition {
  part: 1 | 2 | 3;
  heading: string;
  line: string;
}

export const TRANSITIONS: Record<1 | 2 | 3, Transition> = {
  1: {
    part: 1,
    heading: "Part 1 — Introduction and interview",
    line: "The examiner will confirm who you are and then ask about familiar subjects. Answer in two or three sentences.",
  },
  2: {
    part: 2,
    heading: "Part 2 — The long turn",
    line: "The examiner is about to give you a task card. One minute to prepare, then you speak alone for one to two minutes.",
  },
  3: {
    part: 3,
    heading: "Part 3 — Discussion",
    line: "The examiner will now ask more general questions connected to your task card. Explain and justify your opinions.",
  },
};

/**
 * Sitting-register phase copy. Shorter and flatter than `phases.ts::PHASE_META`,
 * which is written to reassure a practising learner — the wrong register here.
 */
export interface SittingPhaseCopy {
  label: string;
  /** A statement of what is happening. Never advice. */
  note: string;
  part: 1 | 2 | 3 | null;
}

const SITTING_PHASES: Partial<Record<SpeakingPhase, SittingPhaseCopy>> = {
  CONNECTING: { label: "Connecting", note: "Waiting for the examiner.", part: null },
  P1_INTRO: { label: "Introduction", note: "The examiner is checking your identity.", part: 1 },
  P1_QA: { label: "Interview", note: "", part: 1 },
  P2_INTRO: { label: "Task card", note: "Listen to the task, then read the card.", part: 2 },
  P2_PREP: { label: "Preparation", note: "One minute. Notes are allowed.", part: 2 },
  P2_LONG_TURN: { label: "Your long turn", note: "Speak until the examiner stops you.", part: 2 },
  P2_ROUNDING: { label: "Follow-up", note: "One or two short questions.", part: 2 },
  P3_DISCUSS: { label: "Discussion", note: "", part: 3 },
  WRAP_UP: { label: "End of test", note: "That is the end of the test.", part: null },
  RECONNECTING: {
    label: "Reconnecting",
    note: "The connection dropped. Everything you have said is saved.",
    part: null,
  },
  SCORING: { label: "Marking", note: "Your answers are being assessed.", part: null },
};

export function sittingPhase(phase: SpeakingPhase | null | undefined): SittingPhaseCopy {
  return (phase && SITTING_PHASES[phase]) ?? { label: "In progress", note: "", part: null };
}

/** Fixed honesty copy, repeated from the report so nobody meets it for the first time after the fact. */
export const BAND_HONESTY =
  "The band you get is an AI estimate — typically within about one band of an official examiner, and higher than it should be for answers that were memorised. Watch the trend across several mocks, not any single number.";

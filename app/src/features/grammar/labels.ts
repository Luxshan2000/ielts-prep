/**
 * The words this module says out loud.
 *
 * Every learner-facing string that is not authored content lives here, for one
 * reason: the module's whole claim is that a beginner can follow it, and that
 * claim dies the moment two screens use two names for the same rung. The stage
 * names below are the ones DESIGN §1.4 fixes and the learner sees them on the
 * path, on the point screen, on every practice card and on the summary.
 *
 * The error-code table is the join key between the drills, the progress screen
 * and (when D6 lands) the writing scorer, so it is spelled out in full — 53
 * codes, DESIGN §2.8 — rather than prettified from the slug at runtime. A code
 * we have not met yet falls back to its slug with the underscores taken out,
 * which is ugly but honest.
 */

import type { ItemKind, PointRole, PointState, Stage } from "./types";

// ----------------------------------------------------------------- stages ----

export interface StageMeta {
  /** The name on screen. Six rungs, one word each. */
  name: string;
  /** What the learner does at this rung, in one line. */
  does: string;
  /** Second person, present tense — used on the stage bar tooltip. */
  asks: string;
}

export const STAGES: Record<Stage, StageMeta> = {
  0: {
    name: "Meet",
    does: "Meets it in real sentences, answers what they mean, then reads the rule",
    asks: "What do these sentences actually say?",
  },
  1: {
    name: "Notice",
    does: "Reads the form and tells you what it means — nothing to produce yet",
    asks: "What does this form tell you?",
  },
  2: {
    name: "Build",
    does: "Produces the form with the meaning already fixed",
    asks: "Can you make the shape?",
  },
  3: {
    name: "Choose",
    does: "Both forms are correct English. The situation decides which one is right",
    asks: "Which one does this situation need?",
  },
  4: {
    name: "Use",
    does: "Writes an original sentence to a specification",
    asks: "Can you use it in a sentence of your own?",
  },
  5: {
    name: "Under pressure",
    does: "Uses it inside a real task, timed",
    asks: "Can you still do it when the task is about something else?",
  },
};

export const STAGE_ORDER: Stage[] = [0, 1, 2, 3, 4, 5];

export function stageName(stage: Stage | number | null | undefined): string {
  const s = Number(stage ?? 0);
  return STAGES[(s >= 0 && s <= 5 ? s : 0) as Stage].name;
}

// ------------------------------------------------------------- path states ----

export const POINT_STATE_LABEL: Record<PointState, string> = {
  locked: "Locked",
  // Several points are open at once past the first week, so this names the state
  // rather than pointing at one row. The row the path is actually pointing at
  // carries its own "Next up" badge.
  next: "Ready to start",
  in_progress: "In progress",
  practised: "Practised",
  mastered: "Mastered",
};

/**
 * One sentence per state, written to a beginner. "Locked" has to explain itself
 * or it reads as a paywall rather than as a dependency.
 */
export const POINT_STATE_HINT: Record<PointState, string> = {
  locked: "Something this depends on has not been taught yet.",
  next: "Nothing else has to come first. This is the next step.",
  in_progress: "You have met this. It is climbing the ladder.",
  practised: "You can build it and choose it. It comes back on its own schedule.",
  mastered: "You have used this correctly in your own writing or speaking.",
};

export const ROLE_LABEL: Record<PointRole, string> = {
  form: "A form to build",
  choice: "A choice to make",
  accuracy: "An accuracy habit",
};

// -------------------------------------------------------------- the path ----

/**
 * The three tracks the syllabus divides into, said out loud.
 *
 * The unit list is seventeen items long and a learner scrolling it has no way to
 * tell that unit 1 and unit 17 are different kinds of work. The server knows —
 * `UNIT_TRACKS`, A/B/C — and these are its own definitions in a learner's words.
 */
export const TRACK_LABEL: Record<string, string> = {
  A: "Foundations",
  B: "The main stretch",
  C: "The last few",
};

export const TRACK_NOTE: Record<string, string> = {
  A: "The sentence everything else is built on. Start here if you are starting.",
  B: "The bulk of the work, and where most marks are won or lost.",
  C: "High-risk under time pressure. Worth it only once the rest is secure.",
};

/**
 * CEFR in plain words. A learner who has never taken a European language course
 * reads "A1" as a seat number, so the code is never shown on its own — this is
 * what stands in for it (audit A2 §2.6).
 */
export const LEVEL_LABEL: Record<string, string> = {
  A1: "beginner",
  A2: "elementary",
  B1: "intermediate",
  B2: "upper intermediate",
  C1: "advanced",
  C2: "advanced",
};

export function levelLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  return LEVEL_LABEL[level.toUpperCase()] ?? null;
}

/** "3 h 20 m" / "45 min" — an honest budget for a unit, never a bare minute count. */
export function formatStudyTime(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}

// ------------------------------------------------------------- item kinds ----

/** The header line on a practice card — what the learner is being asked to do. */
export const KIND_INSTRUCTION: Record<ItemKind, string> = {
  interpret: "Read the sentence, then answer the question about it.",
  discover: "Look at the pairs and say what is different about them.",
  gap_fill: "Type the missing words.",
  order: "Put the words in order.",
  transform: "Rewrite it so it says the same thing a different way.",
  choose_form: "Both are correct English. Which one does this situation need?",
  contrast_pair: "Match each sentence to what it means.",
  judge: "Is this acceptable? If not, say what is wrong with it.",
  both_ok: "Both of these are correct. Say so — then say what changes.",
  error_fix: "One part of this is wrong. Replace it.",
  dictation: "Listen once, then write what you heard.",
  combine: "Make these into one sentence using the device named.",
  produce: "Write one sentence of your own.",
  speaking_drill: "Say it out loud in a short conversation.",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  interpret: "Meaning",
  discover: "Discovery",
  gap_fill: "Gap fill",
  order: "Word order",
  transform: "Rewrite",
  choose_form: "Choose",
  contrast_pair: "Match",
  judge: "Judge",
  both_ok: "Both fine",
  error_fix: "Fix it",
  dictation: "Dictation",
  combine: "Combine",
  produce: "Write it",
  speaking_drill: "Speak it",
};

/** Kinds where a wrong answer earns a second try before the reveal (F3). */
export const RETRYABLE_KINDS: ItemKind[] = [
  "choose_form",
  "both_ok",
  "judge",
  "contrast_pair",
  "interpret",
];

// ------------------------------------------------------------ error codes ----

export type ErrorFamily = "T" | "M" | "V" | "C" | "S" | "R" | "N" | "L" | "G";

export const ERROR_FAMILY_LABEL: Record<ErrorFamily, string> = {
  T: "Time and aspect",
  M: "Modality",
  V: "Voice",
  C: "Condition and the unreal",
  S: "Sentence boundaries",
  R: "Reference and reporting",
  N: "The noun phrase",
  L: "Word and phrase choice",
  G: "Register and texture",
};

interface CodeMeta {
  family: ErrorFamily;
  /** What the learner did, in their own terms — never the grammatical name. */
  label: string;
}

/** DESIGN §2.8 — the closed set of 53. */
export const ERROR_CODES: Record<string, CodeMeta> = {
  // T — time and aspect
  tense_finished_time_with_perfect: { family: "T", label: "Present perfect with a finished time" },
  tense_open_time_with_past: { family: "T", label: "Past simple where the time is still running" },
  tense_sequence_lost: { family: "T", label: "Two past events told out of order" },
  tense_drift_in_paragraph: { family: "T", label: "Tense slipping mid-paragraph" },
  aspect_state_verb_continuous: { family: "T", label: "A state verb put in the continuous" },
  aspect_result_vs_activity: { family: "T", label: "Result told as an activity, or the reverse" },
  future_will_in_time_clause: { family: "T", label: "`will` inside a time clause" },
  future_evidence_vs_intention: { family: "T", label: "`will` and `going to` swapped" },
  past_perfect_decorative: { family: "T", label: "Past perfect where nothing needs it" },
  // M — modality
  modal_bare_infinitive: { family: "M", label: "A modal followed by the wrong verb form" },
  modal_strength_mismatch: { family: "M", label: "The modal is stronger or weaker than you meant" },
  modal_obligation_source: { family: "M", label: "Obligation from the wrong source" },
  modal_deduction_negative: { family: "M", label: "Negative deduction with the wrong modal" },
  modal_perfect_form: { family: "M", label: "`should have` built wrongly" },
  hedge_missing_overclaim: { family: "M", label: "A claim stated harder than the evidence" },
  // V — voice
  passive_be_missing: { family: "V", label: "Passive with `be` left out" },
  passive_participle_wrong: { family: "V", label: "Passive with the wrong participle" },
  passive_on_intransitive: { family: "V", label: "A passive on a verb that cannot take one" },
  passive_unnecessary: { family: "V", label: "Passive where the active was clearer" },
  passive_agent_needed: { family: "V", label: "The doer dropped when the reader needed it" },
  // C — condition and the unreal
  conditional_would_in_if: { family: "C", label: "`would` inside the `if` half" },
  conditional_wrong_system: { family: "C", label: "Real and unreal conditionals mixed" },
  unreal_past_missing: { family: "C", label: "Unreal meaning without the past form" },
  unless_misused: { family: "C", label: "`unless` used for `if not`" },
  // S — sentence boundaries
  comma_splice: { family: "S", label: "Two sentences joined by a comma" },
  fragment_no_main_verb: { family: "S", label: "A sentence with no main verb" },
  run_on_fused: { family: "S", label: "Two sentences run together" },
  double_connector: { family: "S", label: "Two connectors doing one job" },
  connector_relation_reversed: { family: "S", label: "The connector points the wrong way" },
  subordinator_vs_preposition: { family: "S", label: "`despite` and `although` swapped" },
  parallelism_broken: { family: "S", label: "A list whose items do not match" },
  // R — reference and reporting
  relative_pronoun_wrong: { family: "R", label: "The wrong relative pronoun" },
  relative_resumptive_pronoun: { family: "R", label: "An extra pronoun left inside the clause" },
  relative_comma_meaning: { family: "R", label: "Commas changing who is included" },
  participle_dangling: { family: "R", label: "An `-ing` clause attached to the wrong subject" },
  reference_ambiguous: { family: "R", label: "`it` or `this` with no clear owner" },
  embedded_question_inversion: { family: "R", label: "Question word order inside a statement" },
  reported_backshift_wrong: { family: "R", label: "Reported speech in the wrong tense" },
  // N — the noun phrase
  article_missing_singular: { family: "N", label: "A singular count noun with no article" },
  article_generic_over_the: { family: "N", label: "`the` on something meant in general" },
  article_specific_missing_the: { family: "N", label: "`the` missing on something specific" },
  countable_uncountable: { family: "N", label: "A measured noun pluralised" },
  quantifier_wrong_class: { family: "N", label: "`much` / `many` on the wrong kind of noun" },
  agreement_subject_verb: { family: "N", label: "Subject and verb disagree" },
  agreement_across_distance: { family: "N", label: "Agreement lost across a long subject" },
  // L — lexico-grammar
  preposition_dependent: { family: "L", label: "The wrong preposition after a word" },
  verb_pattern_wrong: { family: "L", label: "The wrong pattern after a verb" },
  word_form_wrong: { family: "L", label: "The right word in the wrong form" },
  comparative_form: { family: "L", label: "A comparative built wrongly" },
  word_order_adverb: { family: "L", label: "An adverb in the wrong place" },
  // G — register and texture
  register_spoken_in_writing: { family: "G", label: "Speech in a written answer" },
  register_written_in_speech: { family: "G", label: "Essay language in a spoken answer" },
  linker_overused: { family: "G", label: "The same linker over and over" },
};

/** A readable name for a code, even one we have never seen. */
export function codeLabel(code: string): string {
  const meta = ERROR_CODES[code];
  if (meta) return meta.label;
  const words = code.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : code;
}

export function codeFamily(code: string): ErrorFamily | null {
  return ERROR_CODES[code]?.family ?? null;
}

export function familyLabel(code: string): string {
  const family = codeFamily(code);
  return family ? ERROR_FAMILY_LABEL[family] : "Other";
}

// ------------------------------------------------------------ skill hooks ----

export const SURFACE_LABEL: Record<string, string> = {
  speaking_p1: "Speaking Part 1",
  speaking_p2: "Speaking Part 2",
  speaking_p3: "Speaking Part 3",
  writing_t1_academic: "Writing Task 1 (Academic)",
  writing_t1_gt: "Writing Task 1 (General Training)",
  writing_t2: "Writing Task 2",
  reading: "Reading",
  listening: "Listening",
};

export function surfaceLabel(surface: string): string {
  return SURFACE_LABEL[surface] ?? surface.replace(/_/g, " ");
}

export const CRITERION_LABEL: Record<string, string> = {
  gra: "Grammar",
  cohesion: "Cohesion",
  lexis: "Vocabulary",
  task: "Task response",
  fluency: "Fluency",
  pronunciation: "Pronunciation",
};

export const REGISTER_LABEL: Record<string, string> = {
  spoken: "Spoken",
  written: "Written",
  both: "Spoken and written",
  academic: "Academic",
};

/** DESIGN §2.2 — shipped to learners as a risk warning on Track C points. */
export function errorSurfaceNote(n: number | null | undefined): string | null {
  if (!n || n < 1) return null;
  if (n <= 1) return "One thing has to be right for this to come out clean.";
  return `${n} separate things all have to be right for this to come out clean.`;
}

export const RISK_NOTE: Record<string, string> = {
  A: "Safe to use as soon as you have it.",
  B: "Worth using, but check it before you commit it in a test.",
  C: "High risk under time pressure. Learn what it means; use it only when you are sure.",
};

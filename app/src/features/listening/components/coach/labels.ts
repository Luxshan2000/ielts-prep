/**
 * The closed vocabularies of the listening module, turned into learner-facing English.
 *
 * Every map here is keyed by a slug the content pack authors (staging-listening
 * DESIGN §5). The slugs are stable identifiers and are never shown raw: an unknown
 * slug falls back to its own words rather than breaking the card, because a content
 * pack newer than this build must degrade, not crash.
 *
 * The static copy at the bottom is the part of the teaching that is true of every
 * script — what each part is, what it punishes, and the four or five facts about the
 * paper that are worth more than any single worked answer.
 */

// ------------------------------------------------------ prediction slots (§5.4) ---

export interface SlotLabel {
  /** The chip. Short enough to sit in a row of fourteen. */
  label: string;
  /** What you are listening for. */
  listen: string;
  /** The characteristic way this slot is lost. */
  hazard: string;
}

export const SLOT_LABELS: Record<string, SlotLabel> = {
  quantity: {
    label: "A number",
    listen: "a bare figure: price, count, capacity, distance, age",
    hazard: "13 for 30, 15 for 50, or repeating a unit the page already prints",
  },
  code: {
    label: "A code",
    listen: "phone, postcode, membership, room or reference: digits and letters, said slowly",
    hazard: "hearing 'oh' as a letter, or losing a 'double'",
  },
  date: {
    label: "A date",
    listen: "a day, a day and month, sometimes a year",
    hazard: "ordinal endings, and day/month order",
  },
  time: {
    label: "A time",
    listen: "a clock time or a duration",
    hazard: "am/pm, and a duration mistaken for a start time",
  },
  proper_name: {
    label: "A name",
    listen: "a name, usually spelled out letter by letter",
    hazard: "pure transcription, so the whole mark is spelling",
  },
  address: {
    label: "An address",
    listen: "number, street name and street type",
    hazard: "dropping the street type, which is part of the answer",
  },
  noun_singular: {
    label: "A singular noun",
    listen: "a noun after 'a', 'an', 'each' or 'one'",
    hazard: "writing the plural anyway",
  },
  noun_plural: {
    label: "A plural noun",
    listen: "a noun after 'some', 'two', 'several', 'a range of'",
    hazard: "dropping the -s",
  },
  noun_uncountable: {
    label: "An uncountable noun",
    listen: "equipment, advice, access, funding, transport",
    hazard: "adding an -s that cannot exist",
  },
  adjective: {
    label: "An adjective",
    listen: "after 'is', 'are' or 'very', or before a printed noun",
    hazard: "writing the noun instead",
  },
  verb: {
    label: "A verb",
    listen: "base form after 'to', -ing after a preposition, past inside a narrative",
    hazard: "right verb, wrong ending",
  },
  noun_phrase: {
    label: "A noun phrase",
    listen: "modifier plus head, spoken as one chunk",
    hazard: "writing three words when two are allowed",
  },
  letter: {
    label: "A letter",
    listen: "a choice between candidates, all of which get mentioned",
    hazard: "choosing whichever was mentioned first",
  },
  category: {
    label: "A category",
    listen: "the general word the speaker never says, or the example where the class was given",
    hazard: "the paraphrase gap: the printed word is never spoken",
  },
};

export function slotLabel(slug: string | null | undefined): string {
  if (!slug) return "Unclassified";
  return SLOT_LABELS[slug]?.label ?? slug.replace(/_/g, " ");
}

/** The order the chips are offered in: the transcription slots first, then grammar. */
export const SLOT_ORDER: string[] = [
  "quantity",
  "code",
  "date",
  "time",
  "proper_name",
  "address",
  "noun_singular",
  "noun_plural",
  "noun_uncountable",
  "noun_phrase",
  "adjective",
  "verb",
  "category",
  "letter",
];

// -------------------------------------------------------- signpost kinds (§5.5) ---

export interface SignpostLabel {
  label: string;
  means: string;
}

export const SIGNPOST_LABELS: Record<string, SignpostLabel> = {
  imminent: { label: "Answer coming", means: "the answer arrives inside the next clause" },
  dictation: {
    label: "Start transcribing",
    means: "stop trying to understand and write down exactly what you hear",
  },
  structure: { label: "New section", means: "the talk has moved on, and so has the question set" },
  list: {
    label: "Counted list",
    means: "a number of things is announced, which tells you how many gaps to expect",
  },
  emphasis: { label: "This one counts", means: "the speaker is marking this as the important one" },
  definition: { label: "Term named", means: "a term is about to be given, often the key itself" },
  reformulation: {
    label: "Said again, simpler",
    means: "the same idea in easier words, a second chance at a fact you missed",
  },
  contrast: { label: "Turn coming", means: "the answer is on the far side of the contrast" },
  correction: { label: "Value changing", means: "what was just said is about to be replaced" },
  decision: { label: "Settled", means: "this is the outcome the speakers agreed on" },
  negation: {
    label: "Polarity",
    means: "an exclusion or a negative. Miss it and the answer inverts",
  },
};

export function signpostLabel(slug: string | null | undefined): string {
  if (!slug) return "Marker";
  return SIGNPOST_LABELS[slug]?.label ?? slug.replace(/_/g, " ");
}

// -------------------------------------------------------------- traps (§5.1) ---

export interface TrapLabel {
  label: string;
  family: "correction" | "raised" | "attribution" | "numbers" | "lexical";
  what: string;
}

export const TRAP_FAMILY_LABEL: Record<TrapLabel["family"], string> = {
  correction: "The speaker takes it back",
  raised: "Raised, then dropped",
  attribution: "Whose opinion was it",
  numbers: "Numbers and codes",
  lexical: "The words do not match the meaning",
};

export const TRAP_LABELS: Record<string, TrapLabel> = {
  self_correction: {
    label: "Self-correction",
    family: "correction",
    what: "The wrong value is stated and replaced in the same breath.",
  },
  late_correction: {
    label: "Late correction",
    family: "correction",
    what: "The correction arrives a turn later, after you have written and moved on.",
  },
  third_party_correction: {
    label: "Corrected by someone else",
    family: "correction",
    what: "One speaker corrects another. Common in Parts 1 and 3.",
  },
  readback_correction: {
    label: "Correction inside a read-back",
    family: "correction",
    what: "The value changes while it is being read back to confirm it.",
  },
  spelling_correction: {
    label: "Spelling corrected",
    family: "correction",
    what: "A letter is given wrong and given again. Real speakers do this constantly.",
  },
  rejected_option: {
    label: "Raised then declined",
    family: "raised",
    what: "Discussed warmly, then turned down. The warmth is the trap.",
  },
  concession_flip: {
    label: "Reversed by a 'but'",
    family: "raised",
    what: "A positive claim is reversed; the mark sits in the second clause.",
  },
  hypothetical_only: {
    label: "Only a plan",
    family: "raised",
    what: "Stated as an intention or a possibility that has not happened.",
  },
  past_state: {
    label: "No longer true",
    family: "raised",
    what: "It was true, and the speaker explicitly supersedes it.",
  },
  negated_fact: {
    label: "Negated",
    family: "raised",
    what: "All the right words are there and the polarity is wrong. One unstressed 'not'.",
  },
  attribution_shift: {
    label: "Someone else's opinion",
    family: "attribution",
    what: "The view belongs to the tutor, the other student or a source, not to the speaker you were asked about.",
  },
  agreement_shift: {
    label: "Agreed at the end",
    family: "attribution",
    what: "Proposed, resisted, modified, agreed. The settled position is stated most quietly.",
  },
  number_superseded: {
    label: "Figure revised",
    family: "numbers",
    what: "A figure is given and then changed: a quote, then a discount.",
  },
  number_arithmetic: {
    label: "Several figures, one total",
    family: "numbers",
    what: "Only the total the speaker states is the key. You are never asked to calculate.",
  },
  adjacent_numbers: {
    label: "Two numbers, one answer",
    family: "numbers",
    what: "Both are in the same sentence and only one answers the stem.",
  },
  unit_switch: {
    label: "Unit switched",
    family: "numbers",
    what: "The same quantity in a different unit. Both are accepted; a bad conversion is not.",
  },
  digit_reading: {
    label: "Spoken number convention",
    family: "numbers",
    what: "'oh' for zero, 'double four', 'nineteen eighty-three'.",
  },
  lexical_lure: {
    label: "Your keyword, wrong fact",
    family: "lexical",
    what: "The question's own word is spoken, attached to something else. The one you are most vulnerable to under pressure.",
  },
  synonym_only: {
    label: "Never said in your words",
    family: "lexical",
    what: "The trigger is a synonym and the printed word is never spoken. The commonest silent loss in the paper.",
  },
  option_never_named: {
    label: "Option described, not named",
    family: "lexical",
    what: "The keyed option is chosen by description: 'I'll go for the highest'.",
  },
  all_options_named: {
    label: "Every option spoken",
    family: "lexical",
    what: "All of them are said aloud, so spotting one is worth nothing.",
  },
  decoy_first: {
    label: "Decoy spoken first",
    family: "lexical",
    what: "The earlier plausible candidate is nearly always the trap.",
  },
  paraphrased_stem: {
    label: "The stem is the paraphrase",
    family: "lexical",
    what: "The option is spoken verbatim and the printed stem is the reworded half.",
  },
  plausible_but_unasked: {
    label: "True, but not the question",
    family: "lexical",
    what: "Stated, correct, and answers a different question. Why, what and when decide it.",
  },
};

export function trapLabel(slug: string | null | undefined): string {
  if (!slug) return "Trap";
  return TRAP_LABELS[slug]?.label ?? slug.replace(/_/g, " ");
}

// --------------------------------------------------------- form risks (§5.2) ---

export const FORM_RISK_LABELS: Record<string, { label: string; what: string }> = {
  spelling: {
    label: "Spelling",
    what: "Heard correctly, written wrongly. In this paper that scores zero.",
  },
  plural_form: {
    label: "Singular / plural",
    what: "The printed frame decided the number and the answer did not follow it.",
  },
  word_class: {
    label: "Word form",
    what: "Right root, wrong form: 'manage' for 'management'.",
  },
  over_limit: {
    label: "Over the word limit",
    what: "Right content, too many words. Usually an article.",
  },
  wrote_word_not_letter: {
    label: "Words instead of a letter",
    what: "On a letter question the option's words score nothing.",
  },
  wrong_letter_count: {
    label: "Wrong number of letters",
    what: "'Choose TWO' answered with one or three scores zero for both.",
  },
};

export function formRiskLabel(slug: string | null | undefined): string {
  if (!slug) return "Answer form";
  return FORM_RISK_LABELS[slug]?.label ?? slug.replace(/_/g, " ");
}

// ------------------------------------------------------ difficulty levers (§5.7) ---

export const LEVER_LABELS: Record<string, string> = {
  lexical_density: "Dense vocabulary",
  cue_answer_distance: "Long gap between cue and answer",
  paraphrase_distance: "Heavily reworded stems",
  syntax: "Long sentences",
  answer_abstraction: "Abstract answers",
  distraction_density: "Many decoys",
  speaker_tracking: "Keeping track of who said what",
  no_reset: "No pause to recover in",
};

export function leverLabel(slug: string): string {
  return LEVER_LABELS[slug] ?? slug.replace(/_/g, " ");
}

// ------------------------------------------------------------- the four parts ---

export interface PartBrief {
  title: string;
  /** What the recording is. */
  what: string;
  /** What this part punishes — different in each one, and that is the point. */
  punishes: string;
  /** The handhold to re-anchor on after a miss (§1.7). */
  reanchor: string;
}

export const PART_BRIEFS: Record<number, PartBrief> = {
  1: {
    title: "Part 1: an everyday conversation",
    what: "Two speakers arranging something practical: a booking, an enquiry, a form being filled in. The audio narrates its own answer sheet.",
    punishes:
      "Spelling and transcription. The heaviest spell-from-dictation load in the whole paper is here, not at the end: names, postcodes, phone numbers and dates, most of them corrected at least once.",
    reanchor:
      "the form-field label being spoken. 'And your postcode?' tells you which box is next.",
  },
  2: {
    title: "Part 2: one speaker, a place or an arrangement",
    what: "A monologue: a tour, a set of instructions, an announcement about a facility or an event.",
    punishes:
      "Following a route or a sequence with nobody to slow the speaker down. Map labelling nearly always lives here, and its answers run in the order they are spoken. You are walking the plan, not searching it.",
    reanchor:
      "sequence and place words like 'as you come out of...', 'the next one along'. The route is continuous, so the next place is next to this one.",
  },
  3: {
    title: "Part 3: an academic discussion",
    what: "Two to four speakers, usually students and a tutor, working through an assignment, a study or a plan.",
    punishes:
      "Losing track of who thinks what. The keyed answer is often the position everyone finally agrees on, and agreement is spoken quietly because by then it is uncontroversial.",
    reanchor:
      "a speaker change: a new voice very often means a new sub-topic and a new question zone.",
  },
  4: {
    title: "Part 4: an academic lecture",
    what: "One speaker, six or seven minutes, no interruption and no mid-part pause. All ten questions are previewed at once.",
    punishes:
      "Losing your place. You are not supposed to understand the lecture; you are supposed to catch ten short bursts inside it.",
    reanchor:
      "a structure marker like 'moving on to' or 'which brings me to'. The outline is the only map you have, because the topic words are unfamiliar by design.",
  },
};

// ------------------------------------------- the facts worth more than any answer ---

export interface BriefingCard {
  id: string;
  title: string;
  body: string;
}

/**
 * Short, static, and the highest marks-per-word copy in the module. These are facts
 * about the paper rather than claims about any script, so they are written once.
 */
export const BRIEFING_CARDS: BriefingCard[] = [
  {
    id: "order",
    title: "The answers arrive in order. Always.",
    body: "Nothing in this paper scatters. The questions run in the same order as the information in the recording, in every part and every question type, including map labelling. You are on a conveyor belt, not on a search. This is the single biggest difference from Reading, where matching tasks scatter deliberately.",
  },
  {
    id: "last-value",
    title: "The answer is the last value stated before the speaker moves on.",
    body: "Never the first. A speaker who says a number, hesitates and says a different one has given you the second. Write the first one anyway (leaving a gap while you wait costs you the next question) and overwrite it when the correction comes.",
  },
  {
    id: "form",
    title: "A word you heard correctly and spelled wrongly scores zero.",
    body: "Half of what a competent listener loses is form, not comprehension: spelling, a missing -s, one word over the limit. Two to four marks a paper is typical, and that is the whole distance from 6.5 to 7.0, available without hearing one extra word of English. It is counted separately here for exactly that reason.",
  },
  {
    id: "cascade",
    title: "One miss costs four marks if you chase it.",
    body: "You miss question 17, keep listening for 17, and the recording has already delivered 18 and 19. The most expensive thing you can do in this test is care about a question you have already lost. Write anything, move your eye to the next gap, and come back in the check window.",
  },
  {
    id: "ninety",
    title: "Nine tenths of the recording contains no answer at all.",
    body: "The marks live in ten short bursts of two to four seconds each. Predicting what a gap needs, and recognising the marker that announces it, turns an impossible six-minute concentration task into ten short ones.",
  },
  {
    id: "escalation",
    title: "What does not get harder: the accents, and the audio.",
    body: "Accents are spread across the paper rather than saved for the end, and the recording is studio-clean throughout. What escalates from Part 1 to Part 4 is vocabulary and sentence length, not speed and not clarity. The spelling load actually runs the other way: it is heaviest in Part 1.",
  },
  {
    id: "honesty",
    title: "Some of this is test technique, and that is fine.",
    body: "Prediction, signposting and recovery are for the exam. The transcript replay and the accent work are for your English. Do both, and do not confuse one for the other.",
  },
];

/** The accent disclosure, stated plainly and without a claim we cannot support. */
export const ACCENT_DISCLOSURE =
  "BandReady's synthesised voices cover British and North American English. Our Australian sets use Australian vocabulary and conventions with approximated voices. The real test also uses Australian and New Zealand speakers, so plan extra exposure to those.";

/** The five-step preview protocol (§2.2) — what the 30-second pause is for. */
export const PREVIEW_PROTOCOL: { window: string; step: string }[] = [
  { window: "0-3s", step: "Read the instruction line. How many words? Is a number allowed?" },
  {
    window: "3-10s",
    step: "Slot-type every gap: one prediction per box. Never drop this step.",
  },
  { window: "10-20s", step: "Underline one anchor per stem: the word most likely to be reworded." },
  { window: "20-26s", step: "Read the last question of the set, so you know where the set ends." },
  {
    window: "26-30s",
    step: "Look at the first two again. The first answer often arrives seconds after the cue.",
  },
];

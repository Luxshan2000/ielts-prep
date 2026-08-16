/**
 * The closed vocabularies the reading pack authors against, rendered into English,
 * plus the static per-type strategy pages.
 *
 * Everything here is app copy written for BandReady. The slugs are stable content
 * identifiers (staging-reading/DESIGN.md §5) used at once as a content field, a
 * review picker, a drill filter and a progress axis — renaming one breaks shipped
 * content, so the maps below are additive only.
 *
 * The per-type pages are the *generic* half of the strategy card: what the type
 * tests, which reading gear it wants, whether its answers run in passage order, its
 * two characteristic losses and its per-question budget. The other half — what to do
 * with *these* paragraphs — is authored per group and lives in the pack.
 */

// ------------------------------------------------------------------- traps ---

export type TrapFamily = "judgement" | "proposition" | "locating" | "form";

export interface TrapInfo {
  /** Short human name, safe in a chip. */
  name: string;
  /** What actually happened, in the learner's terms. */
  what: string;
  family: TrapFamily;
}

export const TRAP_FAMILY_LABEL: Record<TrapFamily, string> = {
  judgement: "Judgement",
  proposition: "Matching the proposition",
  locating: "Locating and choosing",
  form: "Answer form and process",
};

/** The 26-slug taxonomy. Author 0–2 per question, most decisive first. */
export const TRAPS: Record<string, TrapInfo> = {
  // Family J — judgement
  absence_read_as_contradiction: {
    name: "Phantom contradiction",
    what: "The key was NOT GIVEN and you wrote FALSE. The passage says nothing either way, and the silence felt like a denial.",
    family: "judgement",
  },
  contradiction_read_as_absence: {
    name: "Missed contradiction",
    what: "The key was FALSE and you wrote NOT GIVEN. The contradiction was there, usually carried by one word or by the following sentence.",
    family: "judgement",
  },
  causal_link_assumed: {
    name: "Two facts, one invented link",
    what: "The text states X and states Y and never states that X caused Y. Joining them was your step, not the writer's.",
    family: "judgement",
  },
  plausible_inference: {
    name: "Reasonable inference",
    what: "It follows sensibly and it is not stated. If a step of reasoning is needed, the answer is NOT GIVEN.",
    family: "judgement",
  },
  comparison_invented: {
    name: "Invented comparison",
    what: "Facts about A and about B are given separately; the statement ranks them. That ranking is yours.",
    family: "judgement",
  },
  comparison_reversed: {
    name: "Comparison flipped",
    what: "A exceeded B was read as B exceeded A. The text contradicts it outright, so it is FALSE.",
    family: "judgement",
  },
  attribution_shift: {
    name: "Whose view is it?",
    what: "The claim belongs to a named researcher or to critics; the statement hands it to the writer, or to somebody else.",
    family: "judgement",
  },
  outside_knowledge: {
    name: "True in the world, not in the text",
    what: "You answered from what you already know. Familiar topics are where this costs most.",
    family: "judgement",
  },

  // Family P — proposition matching
  lexical_lure: {
    name: "Word match, no meaning match",
    what: "Every content word was there and the relation between them was different, or reversed.",
    family: "proposition",
  },
  paraphrase_missed: {
    name: "Paraphrase not recognised",
    what: "The text does state it, fully, in other words, and the other words hid it.",
    family: "proposition",
  },
  scope_shift: {
    name: "Quantifier or scope shift",
    what: "some became all, often became always, one district became nationally, one study became research generally.",
    family: "proposition",
  },
  hedge_stripped: {
    name: "Certainty inflated",
    what: "may reduce was read as reduces, suggests as proves, or an only, a never or a first was asserted without licence.",
    family: "proposition",
  },
  time_shift: {
    name: "Wrong point on the timeline",
    what: "A plan was read as an implementation, or a past practice as a current one.",
    family: "proposition",
  },
  negation_missed: {
    name: "A negative was skipped",
    what: "A not, a rarely, a failed to (or a negative prefix) reversed the sentence and went unread.",
    family: "proposition",
  },
  partial_condition: {
    name: "Half true",
    what: "One clause is supported and one is not. TRUE requires all of it.",
    family: "proposition",
  },

  // Family L — locating and choosing
  detail_for_main_idea: {
    name: "A detail taken for the point",
    what: "The heading matched something the paragraph mentions rather than what the paragraph does.",
    family: "locating",
  },
  heading_too_broad: {
    name: "The topic of the whole text",
    what: "The heading names the passage's subject instead of this paragraph's contribution to it.",
    family: "locating",
  },
  heading_cascade: {
    name: "One error forced a second",
    what: "A wrong placement used up the heading the next paragraph needed. Worst marks lost per mistake in the paper.",
    family: "locating",
  },
  parallel_decoy: {
    name: "The topic returns later",
    what: "Two paragraphs discuss the same thing. The answer was in the second; you stopped at the first.",
    family: "locating",
  },
  true_but_not_asked: {
    name: "Accurate, irrelevant",
    what: "The option is true of the passage and does not answer this stem. Reading the options before the stem invites it.",
    family: "locating",
  },
  neighbour_answer: {
    name: "Right answer, wrong number",
    what: "The answer you wrote belonged to the question beside it.",
    family: "locating",
  },
  order_ignored: {
    name: "Searched the whole passage",
    what: "The group runs in passage order, so the answer was already bracketed between the one before and the one after.",
    family: "locating",
  },

  // Family F — form and process
  over_limit: {
    name: "Over the word limit",
    what: "Right content, too many words. Articles count. It scores zero however right it is.",
    family: "form",
  },
  spelling: {
    name: "Mis-copied",
    what: "The answer was on the screen and the copy went wrong. Pure avoidable loss.",
    family: "form",
  },
  form_error: {
    name: "Right word, wrong form",
    what: "A singular for a plural, the wrong word class, or a paraphrase where the passage's own words were required.",
    family: "form",
  },
  wrong_option_form: {
    name: "Wrote the word, not the letter",
    what: "A letter-answer type needs the letter, and a choose TWO needs exactly two.",
    family: "form",
  },
  ran_out_of_time: {
    name: "Ran out of time",
    what: "Blank, or a guess under the clock. This is a pacing problem, and the fix is pacing, not reading.",
    family: "form",
  },
};

export function trapName(slug: string): string {
  return TRAPS[slug]?.name ?? slug.replace(/_/g, " ");
}

/**
 * The 5–7 traps worth offering as a self-diagnosis for one question type.
 * Offering all twenty-six turns a two-second decision into a menu, and the wrong
 * menu trains paranoia rather than judgement.
 */
export function trapsForType(qtype: string): string[] {
  const judgement = [
    "absence_read_as_contradiction",
    "contradiction_read_as_absence",
    "scope_shift",
    "hedge_stripped",
    "outside_knowledge",
    "attribution_shift",
    "partial_condition",
  ];
  switch (qtype) {
    case "true_false_not_given":
      return judgement.filter((slug) => slug !== "attribution_shift");
    case "yes_no_not_given":
      return judgement;
    case "matching_headings":
      return [
        "detail_for_main_idea",
        "heading_too_broad",
        "heading_cascade",
        "parallel_decoy",
        "paraphrase_missed",
        "ran_out_of_time",
      ];
    case "matching_information":
      return [
        "parallel_decoy",
        "lexical_lure",
        "paraphrase_missed",
        "detail_for_main_idea",
        "ran_out_of_time",
      ];
    case "matching_features":
      return [
        "attribution_shift",
        "lexical_lure",
        "parallel_decoy",
        "neighbour_answer",
        "ran_out_of_time",
      ];
    case "matching_sentence_endings":
      return [
        "order_ignored",
        "lexical_lure",
        "partial_condition",
        "true_but_not_asked",
        "neighbour_answer",
      ];
    case "multiple_choice":
    case "multiple_choice_multi":
    case "list_selection":
      return [
        "true_but_not_asked",
        "lexical_lure",
        "scope_shift",
        "hedge_stripped",
        "partial_condition",
        "wrong_option_form",
      ];
    case "summary_completion_bank":
      return [
        "wrong_option_form",
        "lexical_lure",
        "paraphrase_missed",
        "neighbour_answer",
        "ran_out_of_time",
      ];
    default:
      // Every free-text completion type loses marks the same four ways.
      return [
        "form_error",
        "over_limit",
        "spelling",
        "paraphrase_missed",
        "neighbour_answer",
        "ran_out_of_time",
      ];
  }
}

// ----------------------------------------------------------------- devices ---

export interface DeviceInfo {
  name: string;
  what: string;
  /** Meaning-preserving rewordings are fair game; the two changing ones make it FALSE. */
  changes: boolean;
}

/** The 14 rewording devices an item writer uses between the text and the stem. */
export const DEVICES: Record<string, DeviceInfo> = {
  synonym: { name: "Synonym", what: "One content word swapped for another.", changes: false },
  superordinate: {
    name: "Category up",
    what: "Specifics replaced by the category that covers them.",
    changes: false,
  },
  hyponym: {
    name: "Category down",
    what: "A category replaced by one instance of it.",
    changes: false,
  },
  nominalisation: {
    name: "Verb to noun",
    what: "An action re-expressed as a thing: the ice retreated, the retreat of the ice.",
    changes: false,
  },
  verbalisation: {
    name: "Noun to verb",
    what: "A thing re-expressed as an action: a reduction in cost, costs fell.",
    changes: false,
  },
  voice_shift: {
    name: "Active to passive",
    what: "Voice flipped, often with the doer deleted. A deleted doer is where NOT GIVEN comes from.",
    changes: false,
  },
  converse: {
    name: "Converse",
    what: "A supplied B to C becomes C obtained B from A. Reverse it by mistake and it is FALSE.",
    changes: false,
  },
  negated_antonym: {
    name: "Negated opposite",
    what: "few adopted it becomes it was not widely adopted. High error rate under time pressure.",
    changes: false,
  },
  compression: {
    name: "Compressed",
    what: "Several words squeezed into one, which is exactly how word limits get broken.",
    changes: false,
  },
  clause_restructure: {
    name: "Clause rebuilt",
    what: "The same proposition redistributed across clauses, sometimes across a sentence boundary.",
    changes: false,
  },
  gloss_swap: {
    name: "Term for definition",
    what: "A technical term traded for its plain-English gloss, or the reverse.",
    changes: false,
  },
  figure_restatement: {
    name: "Figure restated",
    what: "A number expressed as a relation: from 20% to 40% becomes doubled.",
    changes: false,
  },
  scope_change: {
    name: "Scope changed",
    what: "some becomes most or all; one region becomes everywhere. This one changes the meaning.",
    changes: true,
  },
  modality_change: {
    name: "Certainty changed",
    what: "may reduce becomes reduces; suggests becomes demonstrates. This one changes the meaning.",
    changes: true,
  },
};

export function deviceName(slug: string): string {
  return DEVICES[slug]?.name ?? slug.replace(/_/g, " ");
}

export function deviceChangesMeaning(slugs: string[] | null | undefined): boolean {
  return (slugs ?? []).some((slug) => DEVICES[slug]?.changes);
}

// --------------------------------------------------------------- diagnoses ---

/** Why a wrong option fails, from the marker's side (15 codes). */
export const DIAGNOSES: Record<string, string> = {
  true_but_not_asked: "True of the passage, not an answer to this stem",
  right_words_wrong_paragraph: "The right words, in the wrong part of the text",
  overstated: "Stronger than the text",
  understated: "Weaker than the text",
  partially_true: "One half supported, one half not",
  unstated: "Not in the text at all",
  too_narrow: "Covers only part of what the paragraph does",
  too_broad: "Names the whole text, not this paragraph",
  reversed: "The relation runs the other way",
  wrong_claimant: "Attributed to the wrong person",
  wrong_period: "The wrong point in time",
  wrong_form: "Right content, wrong number, class or wording",
  no_contradiction: "Nothing in the text contradicts it",
  contradiction_present: "The text does contradict it",
  support_present: "The text does state it",
};

export function diagnosisLabel(code: string | null | undefined): string {
  if (!code) return "";
  return DIAGNOSES[code] ?? code.replace(/_/g, " ");
}

// -------------------------------------------------------------------- gear ---

export const GEARS: Record<string, { name: string; what: string }> = {
  skim: { name: "Skim", what: "Fast and global: sample for the gist, do not read every word." },
  scan: { name: "Scan", what: "Fast and local. Hunt a shape you already know: a date, a name, a figure." },
  search: {
    name: "Search",
    what: "Hunt a meaning whose wording you do not know. This is the gear the paper demands most.",
  },
  close: {
    name: "Close read",
    what: "Full processing of two to four sentences, once you have found them.",
  },
};

// ------------------------------------------------------------ answer order ---

export interface OrderInfo {
  badge: string;
  what: string;
}

export const ANSWER_ORDER: Record<string, OrderInfo> = {
  sequential: {
    badge: "In passage order",
    what: "Answer n+1 sits below answer n. Search the band between the two you already have, not the whole passage.",
  },
  scattered: {
    badge: "Not in order",
    what: "Nothing bounds the search, so do this group when you have already read the passage for another one.",
  },
  section_local: {
    badge: "All from one section",
    what: "Officially guaranteed: every answer comes from one part of the text. Locate that part once, then work inside it.",
  },
};

// ------------------------------------------------------------------ levers ---

export const LEVERS: Record<string, string> = {
  density: "Propositional density: claims per sentence",
  abstraction: "Abstraction: processes and arguments rather than things",
  implicit_cohesion: "Implicit cohesion: the links between sentences are left to you",
  lexis: "Lexical sophistication",
  syntax: "Syntactic complexity",
  argument_structure: "Rhetorical structure: concession, qualification, verdict",
};

// ------------------------------------------------- static per-type strategy ---

export interface TypePage {
  /** What the type actually tests. */
  tests: string;
  gear: keyof typeof GEARS;
  order: keyof typeof ANSWER_ORDER;
  /** Seconds per question the pacing plan allows. */
  seconds: number;
  /** The attack, in order. Three or four imperatives, no filler. */
  moves: string[];
  /** The two characteristic losses on this type. */
  losses: [string, string];
}

export const TYPE_PAGES: Record<string, TypePage> = {
  true_false_not_given: {
    tests: "Whether a statement about the facts agrees with the text, contradicts it, or is simply absent from it.",
    gear: "search",
    order: "sequential",
    seconds: 70,
    moves: [
      "Read the statement and decide what would have to be true for it to be TRUE: the whole of it, not the half you recognise.",
      "Find the sentence that deals with that, using the band between the previous answer and the next.",
      "Ask in this order: does the text state it? does the text contradict it? If neither, it is NOT GIVEN and you move on.",
    ],
    losses: [
      "FALSE written where the text is merely silent, the commonest error in the whole paper.",
      "NOT GIVEN written where one word in the text contradicts the statement outright.",
    ],
  },
  yes_no_not_given: {
    tests: "Whether the writer's own view agrees with the statement. Facts are not the question here: stance is.",
    gear: "search",
    order: "sequential",
    seconds: 80,
    moves: [
      "Underline whose view the statement gives: the writer's, a named researcher's, or critics'.",
      "Find where that view is expressed, and read the hedges: suggests, appears, may.",
      "Match stance to stance. A view held by somebody the writer quotes is not the writer's view.",
    ],
    losses: [
      "A claim belonging to a cited person read as the writer's own.",
      "A hedged opinion read as a flat assertion, or the reverse.",
    ],
  },
  matching_headings: {
    tests: "Whether you can say what a paragraph is doing, as distinct from what it mentions.",
    gear: "skim",
    order: "scattered",
    seconds: 70,
    moves: [
      "Read each paragraph and say its job in about six words before you look at the list.",
      "Place the paragraphs you are certain of first; every placement removes a heading from the pool.",
      "Leave the two you are unsure of until the end, and choose between them together.",
    ],
    losses: [
      "A heading that matches a detail the paragraph happens to contain.",
      "One wrong placement forcing a second, because headings cannot be reused.",
    ],
  },
  matching_information: {
    tests: "Whether you can find a specific piece of information anywhere in the text, with no order to help you.",
    gear: "search",
    order: "scattered",
    seconds: 55,
    moves: [
      "Do this group after another one, so you already know roughly where things are.",
      "Read the item for the kind of thing it is (an example, a reason, a comparison) rather than for its keywords.",
      "Check the whole paragraph before you commit: paragraphs can be used more than once here.",
    ],
    losses: [
      "Landing in the first paragraph that mentions the topic when the answer is in the second.",
      "Matching words instead of matching the information the item describes.",
    ],
  },
  matching_features: {
    tests: "Whether you can keep several people, places or studies apart while the text moves between them.",
    gear: "scan",
    order: "scattered",
    seconds: 45,
    moves: [
      "Find and mark every occurrence of each name in the passage first.",
      "Work name by name rather than statement by statement.",
      "Watch for the second mention: writers often qualify a person's view a paragraph later.",
    ],
    losses: [
      "A view given to the wrong name because the two are discussed in the same sentence.",
      "Assuming each option is used exactly once when the instructions allow reuse.",
    ],
  },
  matching_sentence_endings: {
    tests: "Whether you can complete a proposition so that it stays both grammatical and true to the text.",
    gear: "search",
    order: "sequential",
    seconds: 55,
    moves: [
      "Use the order: these run down the passage, so each answer is below the last.",
      "Read the stem, predict the ending from the text, and only then look at the list.",
      "Reject endings that are true of the passage but do not fit this stem.",
    ],
    losses: [
      "Choosing an ending that reads well but says something the text does not.",
      "Ignoring the order and re-searching the whole passage for every item.",
    ],
  },
  multiple_choice: {
    tests: "Whether you can hold a whole proposition in mind while three near-misses argue with it.",
    gear: "search",
    order: "sequential",
    seconds: 85,
    moves: [
      "Read the stem and answer it from the text before you read the options.",
      "Eliminate on a specific word (a quantifier, a tense, an agent) rather than on a general feeling.",
      "Check the survivor against the text one more time; two options often differ by a single word.",
    ],
    losses: [
      "An option that is true of the passage but does not answer this stem.",
      "An option built from the words of the right paragraph and the meaning of none of it.",
    ],
  },
  multiple_choice_multi: {
    tests: "The same skill as multiple choice, with the added trap of choosing the wrong number of letters.",
    gear: "search",
    order: "sequential",
    seconds: 85,
    moves: [
      "Count the letters the instruction asks for and write exactly that many.",
      "Find the section that lists the relevant items and work inside it.",
      "Treat each option as a separate true/false decision against the text.",
    ],
    losses: [
      "Three letters written where two were asked for, which scores nothing.",
      "An option that is plausible about the topic and absent from the text.",
    ],
  },
  list_selection: {
    tests: "The same decision as choose-two multiple choice, from a longer list.",
    gear: "search",
    order: "sequential",
    seconds: 85,
    moves: [
      "Locate the part of the text the list is drawn from before reading the options.",
      "Mark each option present or absent as you read, rather than comparing them all at the end.",
      "Write exactly the number of letters requested.",
    ],
    losses: [
      "Selecting an option mentioned in the text in a different role.",
      "Selecting the wrong number of letters.",
    ],
  },
  sentence_completion: {
    tests: "Whether you can find the exact words the text uses and fit them into somebody else's sentence.",
    gear: "search",
    order: "sequential",
    seconds: 40,
    moves: [
      "Predict the word class the gap needs (noun, verb, adjective) from the words around it.",
      "Find the sentence in the text that carries the same proposition, however differently worded.",
      "Copy the passage's own words, and count them against the limit before you move on.",
    ],
    losses: [
      "Paraphrasing the answer instead of copying it.",
      "Going one word over the limit, which scores zero however right it is.",
    ],
  },
  summary_completion: {
    tests: "Whether you can follow a compressed retelling of one section of the text and restore its missing words.",
    gear: "search",
    order: "section_local",
    seconds: 40,
    moves: [
      "Read the whole summary first. It tells you which section of the passage it covers.",
      "Locate that section once, then work down it without re-searching the passage.",
      "Check each answer fits the summary's grammar as well as the text's meaning.",
    ],
    losses: [
      "Searching the entire passage when every answer comes from two paragraphs.",
      "An answer that is true but does not fit the frame of the gapped sentence.",
    ],
  },
  summary_completion_bank: {
    tests: "The same task with the answers supplied, which makes it a test of paraphrase recognition rather than of finding.",
    gear: "search",
    order: "section_local",
    seconds: 30,
    moves: [
      "The bank words are the item writer's synonyms, not the passage's words, so match meaning rather than form.",
      "Decide the word class each gap needs before you look at the bank.",
      "Expect several bank words to fit the meaning and only one to fit the grammar.",
    ],
    losses: [
      "A bank word that fits the meaning of the gap and not its word class.",
      "Writing the word instead of the letter where letters were asked for.",
    ],
  },
  note_completion: {
    tests: "Whether you can read a set of notes as a map of the text and fill in what was left out.",
    gear: "scan",
    order: "section_local",
    seconds: 30,
    moves: [
      "Read the headings of the notes: they name the section of the text in order.",
      "Use the layout: a bullet under a heading is inside that heading's part of the text.",
      "Copy exactly, including plurals, and count the words.",
    ],
    losses: [
      "Singular written for plural, or the reverse.",
      "An answer taken from the neighbouring sentence rather than the one the note summarises.",
    ],
  },
  table_completion: {
    tests: "Whether you can read a table as a set of parallel claims and fill the gaps from the text.",
    gear: "scan",
    order: "section_local",
    seconds: 30,
    moves: [
      "Read the column headings first: they tell you what kind of thing each gap is.",
      "Use the filled cells in the same row and column as your model for form and length.",
      "Locate the section the table covers, then work across, not up and down.",
    ],
    losses: [
      "An answer of the wrong kind: a date where the column wants a material.",
      "Going over the word limit because the passage's phrase was longer than the cell needed.",
    ],
  },
  flow_chart_completion: {
    tests: "Whether you can follow a process in the order the text describes it.",
    gear: "search",
    order: "section_local",
    seconds: 40,
    moves: [
      "Read every box before you start: the finished boxes tell you the wording style expected.",
      "Follow the process paragraph in the text step by step; the boxes follow it too.",
      "Keep the grammar of each box: many are noun phrases, and a verb will not fit.",
    ],
    losses: [
      "Jumping a step because the text describes two stages in one sentence.",
      "An answer in the wrong grammatical form for the box.",
    ],
  },
  diagram_labelling: {
    tests: "Whether you can map a description in words onto a picture of the same thing.",
    gear: "scan",
    order: "section_local",
    seconds: 40,
    moves: [
      "Read the labels already on the diagram. They anchor you to the right paragraph.",
      "Work around the diagram in the order the text describes it, not clockwise.",
      "Use the passage's own words; a label you invent is wrong even when it is accurate.",
    ],
    losses: [
      "Labelling the part above or below the one the number points at.",
      "Describing the part instead of naming it as the text does.",
    ],
  },
  short_answer: {
    tests: "Whether you can find a specific fact and state it in the text's own words within a tight limit.",
    gear: "scan",
    order: "sequential",
    seconds: 30,
    moves: [
      "Read the question word (what, who, how many) and know what shape of answer you need.",
      "Scan for that shape rather than reading for meaning.",
      "Answer with the smallest span of the passage that does the job.",
    ],
    losses: [
      "A full sentence written where two words were asked for.",
      "An answer copied with a spelling slip, which scores nothing.",
    ],
  },
};

export function typePage(qtype: string): TypePage | null {
  return TYPE_PAGES[qtype] ?? null;
}

// ------------------------------------------------------------------ pacing ---

/** Minutes per passage, by format and position (staging-reading/DESIGN.md §4.2). */
export const PACING_MINUTES: Record<string, [number, number, number]> = {
  academic: [16, 20, 22],
  general_training: [15, 18, 25],
};

export function pacingFor(format: string | null | undefined, position: number): number {
  const plan = PACING_MINUTES[format === "general_training" ? "general_training" : "academic"];
  return plan[Math.min(Math.max(position, 1), 3) - 1];
}

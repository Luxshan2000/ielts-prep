/**
 * The teaching payload, as the renderer sees it.
 *
 * These types mirror `content/core-en/staging/DESIGN.md` §1–§4 (`schema_version: 2`
 * rows). Two rules govern every declaration in this file:
 *
 *  1. **Everything is optional.** The pack still ships twelve `schema_version: 1`
 *     sets with no teaching payload at all, and DESIGN.md §0.2 requires consumers to
 *     "treat every teaching field as absent-by-default". A screen that assumes a
 *     field exists will crash on the old sets.
 *  2. **Nothing is trusted.** `payload_json` is an untyped dict server-side, so the
 *     narrowing helpers below do the work a schema would normally do. They are
 *     deliberately forgiving: a malformed sub-object is dropped, never thrown on.
 */

// ------------------------------------------------------------------ vocabulary ---

export const CRITERION_KEYS = ["FC", "LR", "GRA", "PRON"] as const;
export type Criterion = (typeof CRITERION_KEYS)[number];

export const FUNCTION_KEYS = [
  "opinion",
  "hedging",
  "comparing",
  "speculating",
  "conceding",
  "exemplifying",
  "narrating",
  "evaluating",
] as const;
export type LanguageFunction = (typeof FUNCTION_KEYS)[number];

export type AnnotationKind =
  | "move"
  | "chunk"
  | "grammar"
  | "lexis"
  | "prosody"
  | "repair"
  | "swap"
  | "avoid";

export type VocabType = "collocation" | "chunk" | "phrasal_verb" | "idiom" | "word";

// ------------------------------------------------------------------- set level ---

export interface Frame {
  frame: string;
  slot_hint: string;
}

export interface LanguageFunctionGroup {
  function: LanguageFunction | string;
  why_here: string;
  grammar: string;
  frames: Frame[];
  /** The plausible canned sentence shown as a negative exemplar (DESIGN §1.1). */
  avoid: string;
}

export interface LanguageBank {
  warning: string;
  functions: LanguageFunctionGroup[];
}

export interface VocabularyItem {
  item: string;
  type: VocabType | string;
  cefr: string;
  meaning: string;
  example: string;
  used_in: "part1" | "part2" | "part3" | "any" | string;
}

export interface CardSetTeaching {
  schema_version?: number;
  difficulty?: string;
  tags?: string[];
  cluster?: string;
  family?: string;
  cognitive_load?: string | null;
  teaches?: string;
  exam_note?: string;
  language_bank?: LanguageBank;
  vocabulary?: VocabularyItem[];
  part1_card_ids?: string[];
  part2_card_id?: string;
  part3_card_id?: string;
}

// ---------------------------------------------------------------- part 2 cards ---

export interface CueCardPayload {
  topic: string;
  bullets: string[];
  rounding_off?: string[];
}

export interface NoteGridCell {
  bullet_index: number;
  /** A worked example, ≤ 40 characters. Never pre-filled into the learner's grid. */
  cell: string;
}

export interface PrepPlan {
  idea_prompt: string;
  note_grid: NoteGridCell[];
  /** Shown only after the turn — during it, it is a distraction (DESIGN §3.3). */
  trap: string;
}

export interface TimeSegment {
  from_s: number;
  to_s: number;
  segment: string;
  goal: string;
}

export interface RecoveryMove {
  rung: number;
  prompt: string;
}

export interface ErrorWatch {
  pattern: string;
  wrong: string;
  right: string;
  why: string;
  criterion: Criterion | string;
}

export interface StressTarget {
  word: string;
  stress: string;
  note: string;
}

export interface PronunciationFocus {
  priority: string;
  tier?: number;
  why_here: string;
  target_words: StressTarget[];
  chunking_drill?: { sentence: string; chunks: string[] };
  minimal_pairs?: { a: string; b: string; contrast: string }[];
}

export interface ModelAnnotation {
  span: string;
  kind: AnnotationKind | string;
  criterion: Criterion | string;
  label: string;
  why: string;
  transferable?: boolean;
}

export interface BandPoint {
  criterion: Criterion | string;
  point: string;
}

export interface ModelAnswer {
  band_target: number;
  label: string;
  approx_seconds?: number;
  transcript: string;
  what_caps_it?: BandPoint[];
  what_lifts_it?: BandPoint[];
  annotations?: ModelAnnotation[];
}

export interface SwapSlot {
  span: string;
  prompt: string;
}

export interface Part2Teaching {
  schema_version?: number;
  band_move?: string;
  prep_plan?: PrepPlan;
  time_plan?: TimeSegment[];
  recovery_moves?: RecoveryMove[];
  target_language?: string[];
  error_watchlist?: ErrorWatch[];
  pronunciation_focus?: PronunciationFocus;
  examiner_note?: string;
  swap_slots?: SwapSlot[];
  transfer_drill?: string;
  model_answers?: ModelAnswer[];
}

// ------------------------------------------------------- part 1 / part 3 cards ---

export interface Part1QuestionNote {
  q_index: number;
  angle?: string;
  answer_shape: string;
  extend_move: string;
  common_error?: { wrong: string; right: string; why: string };
  probe?: string;
}

export interface Part1Teaching {
  schema_version?: number;
  tense_focus?: string;
  band_move?: string;
  questions?: Part1QuestionNote[];
}

export interface Part3QuestionNote {
  q_index: number;
  move?: string;
  archetype?: string;
  answer_shape: string;
  probe?: string;
  watch_out?: string;
}

export interface Part3Theme {
  title: string;
  questions: string[];
  counterpoint?: string;
  counter_probe?: string;
  concession_frame?: string;
  target_functions?: string[];
  abstraction_ladder?: {
    concrete: string;
    local_general: string;
    societal_abstract: string;
  };
  question_notes?: Part3QuestionNote[];
}

export interface Part3Teaching {
  schema_version?: number;
  band_move?: string;
  bridge?: string;
  error_watchlist?: ErrorWatch[];
}

// ----------------------------------------------------------------- the bundle ---

/** One `speaking_cards.jsonl` row, teaching payload included. */
export interface TeachingCard {
  id: string;
  part: number;
  title: string;
  difficulty: string | null;
  tags: string[];
  /** Part 1 only. Flat strings — the examiner TTS speaks them (DESIGN §0.2). */
  questions?: string[];
  /** Part 2 only. */
  cue_card?: CueCardPayload;
  /** Part 3 only. */
  part3_themes?: Part3Theme[];
  part1Teaching?: Part1Teaching;
  part2Teaching?: Part2Teaching;
  part3Teaching?: Part3Teaching;
}

/** Everything one topic set can teach, normalised for the UI. */
export interface TeachingPack {
  setId: string;
  title: string;
  topicId: string | null;
  set: CardSetTeaching;
  part1: TeachingCard[];
  part2: TeachingCard | null;
  part3: TeachingCard | null;
  /** False for the twelve legacy `schema_version: 1` sets. */
  hasTeaching: boolean;
}

// ------------------------------------------------------------------ narrowing ---

type Dict = Record<string, unknown>;

export function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function dictArray(value: unknown): Dict[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDict);
}

/**
 * Objects are mapped field by field rather than cast, because a cast would let a
 * missing `transcript` reach `String.prototype.indexOf` inside the annotation
 * locator and take the whole report screen down with it.
 */

function frame(raw: Dict): Frame | null {
  const value = str(raw.frame);
  if (!value) return null;
  return { frame: value, slot_hint: str(raw.slot_hint) ?? "" };
}

function functionGroup(raw: Dict): LanguageFunctionGroup | null {
  const fn = str(raw.function);
  if (!fn) return null;
  const frames = dictArray(raw.frames)
    .map(frame)
    .filter((f): f is Frame => f !== null);
  if (frames.length === 0) return null;
  return {
    function: fn,
    why_here: str(raw.why_here) ?? "",
    grammar: str(raw.grammar) ?? "",
    frames,
    avoid: str(raw.avoid) ?? "",
  };
}

export function readLanguageBank(raw: unknown): LanguageBank | undefined {
  if (!isDict(raw)) return undefined;
  const functions = dictArray(raw.functions)
    .map(functionGroup)
    .filter((f): f is LanguageFunctionGroup => f !== null);
  if (functions.length === 0) return undefined;
  return { warning: str(raw.warning) ?? "", functions };
}

export function readVocabulary(raw: unknown): VocabularyItem[] {
  return dictArray(raw)
    .map((v): VocabularyItem | null => {
      const item = str(v.item);
      if (!item) return null;
      return {
        item,
        type: str(v.type) ?? "word",
        cefr: str(v.cefr) ?? "",
        meaning: str(v.meaning) ?? "",
        example: str(v.example) ?? "",
        used_in: str(v.used_in) ?? "any",
      };
    })
    .filter((v): v is VocabularyItem => v !== null);
}

function errorWatchlist(raw: unknown): ErrorWatch[] {
  return dictArray(raw)
    .map((e): ErrorWatch | null => {
      const wrong = str(e.wrong);
      const right = str(e.right);
      if (!wrong || !right) return null;
      return {
        pattern: str(e.pattern) ?? "",
        wrong,
        right,
        why: str(e.why) ?? "",
        criterion: str(e.criterion) ?? "GRA",
      };
    })
    .filter((e): e is ErrorWatch => e !== null);
}

function annotations(raw: unknown): ModelAnnotation[] {
  return dictArray(raw)
    .map((a): ModelAnnotation | null => {
      const span = str(a.span);
      const label = str(a.label);
      if (!span || !label) return null;
      return {
        span,
        label,
        kind: str(a.kind) ?? "move",
        criterion: str(a.criterion) ?? "FC",
        why: str(a.why) ?? "",
        transferable: a.transferable === true,
      };
    })
    .filter((a): a is ModelAnnotation => a !== null);
}

function bandPoints(raw: unknown): BandPoint[] {
  return dictArray(raw)
    .map((p): BandPoint | null => {
      const point = str(p.point);
      if (!point) return null;
      return { criterion: str(p.criterion) ?? "FC", point };
    })
    .filter((p): p is BandPoint => p !== null);
}

function modelAnswers(raw: unknown): ModelAnswer[] {
  return dictArray(raw)
    .map((m): ModelAnswer | null => {
      const transcript = str(m.transcript);
      const band = num(m.band_target);
      if (!transcript || band === undefined) return null;
      return {
        band_target: band,
        label: str(m.label) ?? `Band ${band}`,
        approx_seconds: num(m.approx_seconds),
        transcript,
        what_caps_it: bandPoints(m.what_caps_it),
        what_lifts_it: bandPoints(m.what_lifts_it),
        annotations: annotations(m.annotations),
      };
    })
    .filter((m): m is ModelAnswer => m !== null)
    .sort((a, b) => a.band_target - b.band_target);
}

function prepPlan(raw: unknown): PrepPlan | undefined {
  if (!isDict(raw)) return undefined;
  const grid = dictArray(raw.note_grid)
    .map((c): NoteGridCell | null => {
      const cell = str(c.cell);
      const index = num(c.bullet_index);
      if (!cell || index === undefined) return null;
      return { bullet_index: index, cell };
    })
    .filter((c): c is NoteGridCell => c !== null);
  const idea = str(raw.idea_prompt);
  if (!idea && grid.length === 0) return undefined;
  return { idea_prompt: idea ?? "", note_grid: grid, trap: str(raw.trap) ?? "" };
}

function timePlan(raw: unknown): TimeSegment[] {
  return dictArray(raw)
    .map((t): TimeSegment | null => {
      const from = num(t.from_s);
      const to = num(t.to_s);
      if (from === undefined || to === undefined || to <= from) return null;
      return {
        from_s: from,
        to_s: to,
        segment: str(t.segment) ?? "",
        goal: str(t.goal) ?? "",
      };
    })
    .filter((t): t is TimeSegment => t !== null)
    .sort((a, b) => a.from_s - b.from_s);
}

function pronunciationFocus(raw: unknown): PronunciationFocus | undefined {
  if (!isDict(raw)) return undefined;
  const priority = str(raw.priority);
  if (!priority) return undefined;
  const words = dictArray(raw.target_words)
    .map((w): StressTarget | null => {
      const word = str(w.word);
      if (!word) return null;
      return { word, stress: str(w.stress) ?? "", note: str(w.note) ?? "" };
    })
    .filter((w): w is StressTarget => w !== null);
  const drillRaw = isDict(raw.chunking_drill) ? raw.chunking_drill : null;
  const drillSentence = drillRaw ? str(drillRaw.sentence) : undefined;
  return {
    priority,
    tier: num(raw.tier),
    why_here: str(raw.why_here) ?? "",
    target_words: words,
    chunking_drill:
      drillRaw && drillSentence
        ? { sentence: drillSentence, chunks: strArray(drillRaw.chunks) }
        : undefined,
    minimal_pairs: dictArray(raw.minimal_pairs)
      .map((p) => ({
        a: str(p.a) ?? "",
        b: str(p.b) ?? "",
        contrast: str(p.contrast) ?? "",
      }))
      .filter((p) => p.a !== "" && p.b !== ""),
  };
}

function readPart2Teaching(raw: unknown): Part2Teaching | undefined {
  if (!isDict(raw)) return undefined;
  const teaching: Part2Teaching = {
    schema_version: num(raw.schema_version),
    band_move: str(raw.band_move),
    prep_plan: prepPlan(raw.prep_plan),
    time_plan: timePlan(raw.time_plan),
    recovery_moves: dictArray(raw.recovery_moves)
      .map((r): RecoveryMove | null => {
        const prompt = str(r.prompt);
        if (!prompt) return null;
        return { rung: num(r.rung) ?? 0, prompt };
      })
      .filter((r): r is RecoveryMove => r !== null)
      .sort((a, b) => a.rung - b.rung),
    target_language: strArray(raw.target_language),
    error_watchlist: errorWatchlist(raw.error_watchlist),
    pronunciation_focus: pronunciationFocus(raw.pronunciation_focus),
    examiner_note: str(raw.examiner_note),
    swap_slots: dictArray(raw.swap_slots)
      .map((s): SwapSlot | null => {
        const span = str(s.span);
        if (!span) return null;
        return { span, prompt: str(s.prompt) ?? "" };
      })
      .filter((s): s is SwapSlot => s !== null),
    transfer_drill: str(raw.transfer_drill),
    model_answers: modelAnswers(raw.model_answers),
  };
  return teaching;
}

function readPart1Teaching(raw: unknown): Part1Teaching | undefined {
  if (!isDict(raw)) return undefined;
  return {
    schema_version: num(raw.schema_version),
    tense_focus: str(raw.tense_focus),
    band_move: str(raw.band_move),
    questions: dictArray(raw.questions)
      .map((q): Part1QuestionNote | null => {
        const shape = str(q.answer_shape);
        if (!shape) return null;
        const err = isDict(q.common_error) ? q.common_error : null;
        return {
          q_index: num(q.q_index) ?? 0,
          angle: str(q.angle),
          answer_shape: shape,
          extend_move: str(q.extend_move) ?? "",
          common_error: err
            ? {
                wrong: str(err.wrong) ?? "",
                right: str(err.right) ?? "",
                why: str(err.why) ?? "",
              }
            : undefined,
          probe: str(q.probe),
        };
      })
      .filter((q): q is Part1QuestionNote => q !== null)
      .sort((a, b) => a.q_index - b.q_index),
  };
}

function readPart3Teaching(raw: unknown): Part3Teaching | undefined {
  if (!isDict(raw)) return undefined;
  return {
    schema_version: num(raw.schema_version),
    band_move: str(raw.band_move),
    bridge: str(raw.bridge),
    error_watchlist: errorWatchlist(raw.error_watchlist),
  };
}

function readPart3Themes(raw: unknown): Part3Theme[] {
  return dictArray(raw)
    .map((t): Part3Theme | null => {
      const title = str(t.title);
      const questions = strArray(t.questions);
      if (!title || questions.length === 0) return null;
      const ladder = isDict(t.abstraction_ladder) ? t.abstraction_ladder : null;
      return {
        title,
        questions,
        counterpoint: str(t.counterpoint),
        counter_probe: str(t.counter_probe),
        concession_frame: str(t.concession_frame),
        target_functions: strArray(t.target_functions),
        abstraction_ladder: ladder
          ? {
              concrete: str(ladder.concrete) ?? "",
              local_general: str(ladder.local_general) ?? "",
              societal_abstract: str(ladder.societal_abstract) ?? "",
            }
          : undefined,
        question_notes: dictArray(t.question_notes)
          .map((n): Part3QuestionNote | null => {
            const shape = str(n.answer_shape);
            if (!shape) return null;
            return {
              q_index: num(n.q_index) ?? 0,
              move: str(n.move),
              archetype: str(n.archetype),
              answer_shape: shape,
              probe: str(n.probe),
              watch_out: str(n.watch_out),
            };
          })
          .filter((n): n is Part3QuestionNote => n !== null)
          .sort((a, b) => a.q_index - b.q_index),
      };
    })
    .filter((t): t is Part3Theme => t !== null);
}

function readCueCard(raw: unknown): CueCardPayload | undefined {
  if (!isDict(raw)) return undefined;
  const topic = str(raw.topic);
  if (!topic) return undefined;
  return {
    topic,
    bullets: strArray(raw.bullets),
    rounding_off: strArray(raw.rounding_off),
  };
}

/** One JSONL card row → the renderer's view of it. Never throws. */
export function readCard(raw: unknown): TeachingCard | null {
  if (!isDict(raw)) return null;
  const id = str(raw.id);
  const part = num(raw.part);
  if (!id || part === undefined) return null;
  const payload = isDict(raw.payload_json)
    ? raw.payload_json
    : isDict(raw.payload)
      ? raw.payload
      : {};
  const teaching = payload.teaching;
  return {
    id,
    part,
    title: str(raw.title) ?? str(payload.topic) ?? id,
    difficulty: str(raw.difficulty) ?? null,
    tags: strArray(raw.tags_json ?? raw.tags ?? payload.tags),
    questions: strArray(payload.questions),
    cue_card: readCueCard(payload.cue_card),
    part3_themes: readPart3Themes(payload.part3_themes),
    part1Teaching: part === 1 ? readPart1Teaching(teaching) : undefined,
    part2Teaching: part === 2 ? readPart2Teaching(teaching) : undefined,
    part3Teaching: part === 3 ? readPart3Teaching(teaching) : undefined,
  };
}

/**
 * One `card_sets.jsonl` row plus its four cards → a `TeachingPack`.
 *
 * `hasTeaching` is what every screen gates on: a legacy set parses cleanly, it
 * simply arrives with no model answers, no language bank and no prep plan, and the
 * coach then says so instead of rendering four empty panels.
 */
export function readPack(raw: unknown, cards: unknown[]): TeachingPack | null {
  if (!isDict(raw)) return null;
  const setRow = isDict(raw.set) ? raw.set : raw;
  const id = str(setRow.id);
  if (!id) return null;
  const payload = isDict(setRow.payload_json)
    ? setRow.payload_json
    : isDict(setRow.payload)
      ? setRow.payload
      : {};

  const parsed = cards
    .map(readCard)
    .filter((c): c is TeachingCard => c !== null)
    .sort((a, b) => a.part - b.part);

  const set: CardSetTeaching = {
    schema_version: num(payload.schema_version),
    difficulty: str(payload.difficulty),
    tags: strArray(payload.tags),
    cluster: str(payload.cluster),
    family: str(payload.family),
    cognitive_load: str(payload.cognitive_load) ?? null,
    teaches: str(payload.teaches),
    exam_note: str(payload.exam_note),
    language_bank: readLanguageBank(payload.language_bank),
    vocabulary: readVocabulary(payload.vocabulary),
    part1_card_ids: strArray(payload.part1_card_ids),
    part2_card_id: str(payload.part2_card_id),
    part3_card_id: str(payload.part3_card_id),
  };

  const part2 = parsed.find((c) => c.part === 2) ?? null;
  const part3 = parsed.find((c) => c.part === 3) ?? null;

  const hasTeaching = Boolean(
    set.language_bank ||
      (set.vocabulary && set.vocabulary.length > 0) ||
      part2?.part2Teaching?.model_answers?.length ||
      part2?.part2Teaching?.prep_plan,
  );

  return {
    setId: id,
    title: str(setRow.title) ?? id,
    topicId: str(setRow.topic_id) ?? null,
    set,
    part1: parsed.filter((c) => c.part === 1),
    part2,
    part3,
    hasTeaching,
  };
}

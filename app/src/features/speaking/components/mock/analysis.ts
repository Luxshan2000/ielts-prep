/**
 * Turning one whole-test report into a part-by-part account of the sitting.
 *
 * ## Why this is derived on the client
 *
 * A real examiner marks the test once, as a whole — so the sidecar returns one set of
 * four criterion bands and no per-part bands, and inventing per-part bands here would
 * be a lie dressed as data (04 §6.4). What the report *does* carry is quotable
 * evidence, and the transcript carries the part each quote was said in. Joining those
 * two answers the only per-part question worth asking: **where did the evidence for
 * and against you actually come from?**
 *
 * So this module never produces a band. It produces, per part: how much was said, the
 * examiner's own quotes placed where they were spoken, the delivery metrics the
 * sidecar measured for that part, and a single relative *signal* used only to order
 * the parts against each other. Every consumer is expected to say so on screen.
 *
 * ## Placing a quote
 *
 * Quotes are matched to candidate turns with the same normalised-substring rule the
 * sidecar used to anchor them (`../quotes.ts`), so a quote that the server flagged as
 * unanchored will simply fail to place here too, and lands in `unplaced` rather than
 * being attributed to a part it may not belong to.
 */

import { countWords } from "@/lib/format";
import { findQuote } from "../quotes";
import type {
  CriterionKey,
  CriterionReport,
  FluencyMetrics,
  SpeakingReport,
  TranscriptTurn,
} from "../../store";
import type { SetCard } from "./api";

export type PartNumber = 1 | 2 | 3;

export const PART_LABELS: Record<PartNumber, string> = {
  1: "Part 1 — Interview",
  2: "Part 2 — Long turn",
  3: "Part 3 — Discussion",
};

export interface PartQuote {
  text: string;
  kind: "strength" | "issue";
  /** Which criterion the examiner cited it under, when it came from a criterion. */
  criterion: CriterionKey | null;
  /** For issues: what was wrong and the repair the examiner offered. */
  issue?: string;
  better?: string;
  /** Index into the candidate-turn list it was found in, or -1 when unplaced. */
  turnIndex: number;
}

export interface PartSummary {
  part: PartNumber;
  label: string;
  /** True when the candidate said anything at all in this part. */
  reached: boolean;
  turns: number;
  words: number;
  strengths: PartQuote[];
  issues: PartQuote[];
  metrics: FluencyMetrics | null;
  /**
   * Relative standing of this part against the others, roughly −1…+1. Null when
   * there was nothing to judge it on. NOT a band, and never to be printed as one.
   */
  signal: number | null;
}

export interface SittingAnalysis {
  parts: PartSummary[];
  /** True when at least one candidate turn could be placed in a part. */
  attributed: boolean;
  /** Set only when the parts can be honestly separated — see `separable()`. */
  strongest: PartSummary | null;
  weakest: PartSummary | null;
  /** Quotes that could not be tied to a part; still worth showing, just not placed. */
  unplaced: PartQuote[];
  /** Every candidate turn the transcript carried, in order. */
  candidateTurns: number;
}

// ------------------------------------------------------------------ placing ---

/** The transcript blob keeps the authoring context the flattened rows drop. */
type TurnLike = TranscriptTurn & { phase?: string | null };

const PHASE_PART: Record<string, PartNumber> = {
  P1: 1,
  P2: 2,
  P3: 3,
};

function isPart(value: unknown): value is PartNumber {
  return value === 1 || value === 2 || value === 3;
}

/**
 * Which part a candidate turn belongs to. Three sources in order of trust: the turn's
 * own `part`, the phase it was recorded in, and the part of the card it answered.
 */
export function partOfTurn(turn: TurnLike, cardParts: Map<string, number>): PartNumber | null {
  if (isPart(turn.part)) return turn.part;
  const phase = typeof turn.phase === "string" ? PHASE_PART[turn.phase.slice(0, 2)] : undefined;
  if (isPart(phase)) return phase;
  if (turn.card_id) {
    const fromCard = cardParts.get(turn.card_id);
    if (isPart(fromCard)) return fromCard;
  }
  return null;
}

// ----------------------------------------------------------------- signals ---

function clamp(value: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Delivery signal from the R2-10 metrics the sidecar measured for this part.
 *
 * Only the three that mean the same thing in every part are used. Speaking rate is
 * deliberately excluded: a fast Part 1 and a fast Part 2 are not comparable, and
 * rewarding rate would push candidates to gabble.
 */
export function deliverySignal(metrics: FluencyMetrics | null): number | null {
  if (!metrics) return null;
  const parts: number[] = [];

  if (typeof metrics.fillers_per_min === "number") {
    // 0/min reads as clean, 8/min as heavily filled.
    parts.push(clamp(1 - metrics.fillers_per_min / 4));
  }
  if (typeof metrics.mean_length_of_run_words === "number") {
    // Runs of ~8 words between pauses is the pivot; 4 is choppy, 12 is fluent.
    parts.push(clamp((metrics.mean_length_of_run_words - 8) / 4));
  }
  if (typeof metrics.pause_ratio === "number") {
    // 0.15 of the turn spent silent is comfortable, 0.45 is halting.
    parts.push(clamp((0.3 - metrics.pause_ratio) / 0.15));
  }
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * Evidence signal: how the examiner's praise and corrections fell in this part,
 * normalised so a part with two of each does not outrank a part with one of each.
 */
export function evidenceSignal(strengths: number, issues: number): number | null {
  const total = strengths + issues;
  if (total === 0) return null;
  return (strengths - issues) / total;
}

function combine(evidence: number | null, delivery: number | null): number | null {
  if (evidence === null && delivery === null) return null;
  if (evidence === null) return delivery;
  if (delivery === null) return evidence;
  // The examiner's own quotes outweigh the acoustic proxy, but not by so much that a
  // single stray correction can flip a part that was demonstrably fluent.
  return evidence * 0.6 + delivery * 0.4;
}

/**
 * Whether the parts can honestly be ranked. Two guards, both needed:
 * enough evidence to be talking about anything, and enough daylight between the top
 * and bottom part that the ordering is not noise.
 */
export function separable(parts: PartSummary[]): boolean {
  const scored = parts.filter((p) => p.signal !== null && p.reached);
  if (scored.length < 2) return false;
  const quotes = parts.reduce((n, p) => n + p.strengths.length + p.issues.length, 0);
  if (quotes < 3) return false;
  const values = scored.map((p) => p.signal as number);
  return Math.max(...values) - Math.min(...values) >= 0.2;
}

// ------------------------------------------------------------------ analyse ---

interface RawQuote {
  text: string;
  kind: "strength" | "issue";
  criterion: CriterionKey | null;
  issue?: string;
  better?: string;
}

function collectQuotes(report: SpeakingReport): RawQuote[] {
  const out: RawQuote[] = [];
  const seen = new Set<string>();

  const push = (quote: RawQuote) => {
    const text = quote.text?.trim();
    if (!text) return;
    const key = `${quote.kind}:${text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...quote, text });
  };

  for (const moment of report.best_moments ?? []) {
    push({ text: moment, kind: "strength", criterion: null });
  }
  for (const [key, criterion] of Object.entries(report.criteria ?? {})) {
    for (const line of criterion?.evidence ?? []) {
      push({ text: line, kind: "strength", criterion: key as CriterionKey });
    }
  }
  for (const error of report.errors ?? []) {
    push({
      text: error.quote,
      kind: "issue",
      criterion: null,
      issue: error.issue,
      better: error.better,
    });
  }
  return out;
}

function metricsFor(report: SpeakingReport, part: PartNumber): FluencyMetrics | null {
  const table = report.metrics?.parts;
  if (!table) return null;
  return table[String(part)] ?? null;
}

/**
 * Join the report to the transcript and describe the sitting part by part.
 *
 * `cards` is optional and only improves placement: it lets a turn that carries a
 * `card_id` but no `part` be placed anyway.
 */
export function analyseSitting(
  report: SpeakingReport,
  turns: TranscriptTurn[],
  cards: SetCard[] = [],
): SittingAnalysis {
  const cardParts = new Map<string, number>(cards.map((c) => [c.id, c.part]));
  const candidate = (turns as TurnLike[]).filter(
    (t) => t.role === "user" && (t.text ?? "").trim() !== "",
  );

  const placed = candidate.map((turn) => ({
    turn,
    part: partOfTurn(turn, cardParts),
  }));

  const buckets = new Map<PartNumber, PartSummary>();
  for (const part of [1, 2, 3] as PartNumber[]) {
    buckets.set(part, {
      part,
      label: PART_LABELS[part],
      reached: false,
      turns: 0,
      words: 0,
      strengths: [],
      issues: [],
      metrics: metricsFor(report, part),
      signal: null,
    });
  }

  for (const row of placed) {
    if (row.part === null) continue;
    const bucket = buckets.get(row.part);
    if (!bucket) continue;
    bucket.reached = true;
    bucket.turns += 1;
    bucket.words += countWords(row.turn.text ?? "");
  }

  const unplaced: PartQuote[] = [];
  for (const quote of collectQuotes(report)) {
    let landed = false;
    for (let i = 0; i < placed.length; i += 1) {
      const row = placed[i];
      if (row.part === null) continue;
      if (!findQuote(row.turn.text ?? "", quote.text)) continue;
      const bucket = buckets.get(row.part);
      if (!bucket) continue;
      const entry: PartQuote = { ...quote, turnIndex: i };
      if (quote.kind === "strength") bucket.strengths.push(entry);
      else bucket.issues.push(entry);
      landed = true;
      break;
    }
    if (!landed) unplaced.push({ ...quote, turnIndex: -1 });
  }

  const parts = [1, 2, 3].map((n) => buckets.get(n as PartNumber) as PartSummary);
  for (const part of parts) {
    part.signal = part.reached
      ? combine(evidenceSignal(part.strengths.length, part.issues.length), deliverySignal(part.metrics))
      : null;
  }

  const ranked = parts
    .filter((p) => p.reached && p.signal !== null)
    .sort((a, b) => (b.signal as number) - (a.signal as number));
  const canRank = separable(parts);

  return {
    parts,
    attributed: placed.some((row) => row.part !== null),
    strongest: canRank ? (ranked[0] ?? null) : null,
    weakest: canRank ? (ranked[ranked.length - 1] ?? null) : null,
    unplaced,
    candidateTurns: candidate.length,
  };
}

// ------------------------------------------------------------ next actions ---

export interface NextAction {
  id: string;
  title: string;
  detail: string;
  /** Where the action is carried out, when it maps to a screen. */
  to?: string;
  cta?: string;
}

const CRITERION_NAMES: Record<CriterionKey, string> = {
  fc: "Fluency and coherence",
  lr: "Lexical resource",
  gra: "Grammatical range and accuracy",
  pron: "Pronunciation",
};

/**
 * What to do next week, in the order a teacher would give it: the weakest criterion
 * first with the examiner's own improvement notes, then the weakest part, then the
 * cards just sat — which is the whole point of the loop. Model answers for those
 * cards unlock on the strength of this attempt.
 */
export function nextActions(
  report: SpeakingReport,
  analysis: SittingAnalysis,
  setId: string | null,
  setTitle: string | null,
): NextAction[] {
  const actions: NextAction[] = [];

  const keys: CriterionKey[] = ["fc", "lr", "gra", "pron"];
  const scored = keys
    .map((key) => ({ key, band: report.criteria?.[key]?.band ?? null, entry: report.criteria?.[key] }))
    .filter((row): row is { key: CriterionKey; band: number; entry: CriterionReport } =>
      typeof row.band === "number" && row.entry !== undefined,
    )
    .sort((a, b) => a.band - b.band);

  const lowest = scored[0];
  if (lowest) {
    const { key, band, entry: criterion } = lowest;
    const notes = (criterion.improvements ?? []).filter((line) => line.trim() !== "");
    actions.push({
      id: `criterion-${key}`,
      title: `${CRITERION_NAMES[key]} was your lowest criterion (band ${band})`,
      detail:
        notes.length > 0
          ? notes.slice(0, 2).join(" ")
          : "The examiner left no specific note here, so work from the transcript: read your own answers back and mark every place you had to restart.",
    });
  }

  if (analysis.weakest && analysis.weakest !== analysis.strongest) {
    const part = analysis.weakest;
    actions.push({
      id: `part-${part.part}`,
      title: `Most of what went wrong was in ${part.label.toLowerCase()}`,
      detail:
        part.issues.length > 0
          ? `${part.issues.length} of the examiner's corrections came from this part. Re-run it on its own before your next full sitting.`
          : "Your delivery metrics dipped here — longer pauses and shorter runs than the rest of the test.",
      to: "/speaking",
      cta: "Practise a single part",
    });
  }

  if (setId) {
    actions.push({
      id: "coach",
      title: setTitle ? `Study “${setTitle}” in the Topic Coach` : "Study this topic in the Topic Coach",
      detail:
        "You have now attempted these cards, so the model answers are unlocked: the same story told at bands 5 through 9, with the language that moves it up a rung.",
      to: `/speaking/coach/${encodeURIComponent(setId)}`,
      cta: "Open the topic coach",
    });
  }

  if (report.vocab_to_bank?.length) {
    actions.push({
      id: "vocab",
      title: `Bank the ${report.vocab_to_bank.length} words the examiner picked out`,
      detail:
        "They come from the gaps in this sitting, so they are the vocabulary most likely to change your next band.",
      to: `/speaking/report/${encodeURIComponent(report.report_id)}`,
      cta: "Open the full report",
    });
  }

  return actions;
}

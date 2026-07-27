/**
 * The attempt ledger: which passages this learner has actually sat, and what went
 * wrong on them.
 *
 * **Why this exists.** The worked solutions are gated behind a submitted attempt —
 * seeing where an answer was before you have looked for it teaches nothing, and a
 * reading explanation read cold is the exact equivalent of memorising a model essay.
 * The sidecar can answer "has this profile submitted an attempt on this passage?"
 * only for an attempt it can find; there is no list-attempts endpoint yet, so the
 * gate is kept here, written the moment an attempt is marked.
 *
 * It is deliberately a *ledger of facts about attempts*, not a cache of content: the
 * gated document is never fetched while the gate is shut, so an unlocked flag in
 * localStorage cannot reveal an answer that was never downloaded.
 *
 * Written by `features/reading/store.ts` on submit; read by the coach.
 */

const STORAGE_KEY = "bandready.reading.attempted.v1";
const MAX_PASSAGES = 200;

export interface PassageAttemptRecord {
  passageId: string;
  attemptId: string;
  /** Epoch ms of the most recent submission on this passage. */
  submittedAt: number;
  correct: number;
  total: number;
  /** Question numbers marked wrong, so the coach can lead with them. */
  wrong: number[];
  /** What the learner actually wrote on each wrong question, keyed by number. */
  given: Record<string, string>;
  /** How many times this passage has been sat. */
  attempts: number;
  examConditions: boolean;
}

type Ledger = Record<string, PassageAttemptRecord>;

function isRecord(value: unknown): value is PassageAttemptRecord {
  if (typeof value !== "object" || value === null) return false;
  const row = value as PassageAttemptRecord;
  return typeof row.passageId === "string" && typeof row.submittedAt === "number";
}

export function readLedger(): Ledger {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Ledger = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      // A half-written row would gate the wrong way round, so drop it rather than
      // repair it: the cost of dropping is one extra attempt, which is harmless.
      if (!isRecord(value)) continue;
      out[key] = {
        ...value,
        wrong: Array.isArray(value.wrong) ? value.wrong : [],
        given: typeof value.given === "object" && value.given !== null ? value.given : {},
        attempts: Number.isFinite(value.attempts) ? value.attempts : 1,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeLedger(ledger: Ledger): void {
  try {
    const rows = Object.values(ledger)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, MAX_PASSAGES);
    const out: Ledger = {};
    for (const row of rows) out[row.passageId] = row;
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    // A disabled or full localStorage must never break a submission.
  }
}

export interface MarkedQuestionLike {
  number: number;
  passage_id: string;
  correct: boolean;
  given: string;
}

/**
 * Record one submitted attempt, one row per passage it touched.
 *
 * Drills are excluded by the caller: a drill shows anchor paragraphs only, so
 * answering six questions from a passage is not the same as having sat it, and
 * unlocking its solution cards on that basis would be a lie.
 */
export function recordSubmission(input: {
  attemptId: string;
  examConditions: boolean;
  perQuestion: MarkedQuestionLike[];
  submittedAt?: number;
}): void {
  const stamp = input.submittedAt ?? Date.now();
  const ledger = readLedger();
  const byPassage = new Map<string, MarkedQuestionLike[]>();
  for (const question of input.perQuestion) {
    const id = String(question.passage_id ?? "");
    if (!id) continue;
    const list = byPassage.get(id) ?? [];
    list.push(question);
    byPassage.set(id, list);
  }

  for (const [passageId, questions] of byPassage) {
    const wrong = questions.filter((q) => !q.correct);
    const given: Record<string, string> = {};
    for (const question of wrong) given[String(question.number)] = question.given ?? "";
    const previous = ledger[passageId];
    ledger[passageId] = {
      passageId,
      attemptId: input.attemptId,
      submittedAt: stamp,
      correct: questions.filter((q) => q.correct).length,
      total: questions.length,
      wrong: wrong.map((q) => q.number).sort((a, b) => a - b),
      given,
      attempts: (previous?.attempts ?? 0) + 1,
      examConditions: input.examConditions,
    };
  }
  writeLedger(ledger);
}

export function attemptRecordFor(passageId: string): PassageAttemptRecord | null {
  if (!passageId) return null;
  return readLedger()[passageId] ?? null;
}

/** Every passage id with a submitted attempt, most recent first. */
export function attemptedPassageIds(): string[] {
  return Object.values(readLedger())
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .map((row) => row.passageId);
}

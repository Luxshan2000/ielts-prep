/**
 * Client-side answer checking for the auto-checked exercise types.
 *
 * The sidecar ships each exercise with a pre-normalised `expected` list
 * (`bandready/srs/exercises.py::grade_answer`) but exposes no grade endpoint —
 * cloze / collocation / audio-recall are graded here so the review loop stays
 * instant and works offline. `use_in_sentence` is the one type that goes to the
 * server, because only the LLM can judge it (`POST /api/v1/vocab/check-sentence`).
 *
 * The rating a grade produces is only a *default*; the learner always presses
 * the button (08 §5.2 — FSRS ratings stay learner-final).
 */

import type { Exercise, VocabEntry } from "./types";

const PUNCT_RE = /[^\p{L}\p{N}_\s'-]/gu;
const WS_RE = /\s+/g;

/** Mirrors `exercises.normalize_answer_text`: fold accents, lowercase, de-punctuate. */
export function normalizeAnswer(text: string): string {
  const folded = (text || "")
    .replace(/’/g, "'")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return folded.replace(PUNCT_RE, " ").replace(WS_RE, " ").trim();
}

const DOUBLE_CONSONANTS = "bdfglmnprstz";
const VOWELS = "aeiou";

/** Mirrors `exercises.word_variants` — used to detect a near-miss word form. */
export function wordVariants(headword: string, lemma?: string | null): Set<string> {
  const base = normalizeAnswer(headword);
  const forms = new Set<string>([base]);
  const root = normalizeAnswer(lemma ?? "") || base;
  forms.add(root);
  if (base.includes(" ")) {
    forms.delete("");
    return forms;
  }
  for (const stem of new Set([base, root])) {
    if (!stem) continue;
    forms.add(`${stem}s`);
    forms.add(`${stem}es`);
    forms.add(`${stem}ed`);
    forms.add(`${stem}ing`);
    forms.add(`${stem}d`);
    forms.add(`${stem}ly`);
    if (stem.endsWith("e")) {
      forms.add(`${stem.slice(0, -1)}ing`);
      forms.add(`${stem.slice(0, -1)}ed`);
      forms.add(`${stem.slice(0, -1)}ion`);
    }
    if (stem.endsWith("y")) {
      forms.add(`${stem.slice(0, -1)}ies`);
      forms.add(`${stem.slice(0, -1)}ied`);
    }
    if (
      stem.length > 3 &&
      DOUBLE_CONSONANTS.includes(stem[stem.length - 1]) &&
      VOWELS.includes(stem[stem.length - 2])
    ) {
      const doubled = stem + stem[stem.length - 1];
      forms.add(`${doubled}ing`);
      forms.add(`${doubled}ed`);
    }
  }
  forms.delete("");
  return forms;
}

export interface GradeResult {
  /** False when the exercise is self-rated (flip / speaking drill). */
  checked: boolean;
  correct: boolean | null;
  /** Right word, wrong form. */
  close: boolean;
  /** The rating button the UI pre-highlights (1–4). */
  suggestedRating: number;
  detail: string;
  /** The first acceptable answer, for the "the answer is …" line. */
  expected: string | null;
}

export interface GradeOptions {
  attempts?: number;
  revealed?: boolean;
  entry?: VocabEntry | null;
}

/** Mirrors `exercises.grade_answer` so the UI and the log agree on what happened. */
export function gradeAnswer(
  exercise: Exercise,
  answer: string,
  { attempts = 1, revealed = false, entry = null }: GradeOptions = {},
): GradeResult {
  const expected = exercise.expected ?? [];
  const given = normalizeAnswer(answer);

  if (expected.length === 0) {
    return {
      checked: false,
      correct: null,
      close: false,
      suggestedRating: 3,
      detail: "Rate yourself.",
      expected: null,
    };
  }

  const correct = Boolean(given) && expected.includes(given);
  let close = false;
  if (!correct && given && entry) {
    close = wordVariants(entry.headword, entry.lemma).has(given);
  }

  let suggestedRating: number;
  let detail: string;
  if (revealed || (!correct && !close)) {
    suggestedRating = 1;
    detail = `The answer is “${expected[0]}”.`;
  } else if (close && !correct) {
    suggestedRating = 2;
    detail = "Almost — check the word form.";
  } else if (attempts > 1) {
    suggestedRating = 2;
    detail = "Correct on the second try.";
  } else {
    suggestedRating = 3;
    detail = "Correct.";
  }

  return { checked: true, correct, close, suggestedRating, detail, expected: expected[0] ?? null };
}

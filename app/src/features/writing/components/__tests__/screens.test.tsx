/**
 * Smoke tests for the two big screens. They exist to prove there is no white
 * screen: every branch of the editor and the report renders against realistic
 * payloads, including the empty and rewrite variants.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AttemptEditor } from "../AttemptEditor";
import { AttemptReport } from "../AttemptReport";
import { useWritingStore, type WritingAttempt, type WritingEvaluation, type WritingPrompt } from "../../store";

const prompt: WritingPrompt = {
  id: "wp_1",
  task_type: "task2",
  task_label: "Writing Task 2 (essay)",
  genre: "opinion",
  difficulty: 2,
  topic_id: null,
  topic_tags: ["education"],
  prompt_text:
    "Some people believe that university education should be free for everyone. To what extent do you agree or disagree?",
  chart_spec: null,
  letter_bullets: [],
  min_words: 250,
  time_limit_s: 2400,
  source: "pack",
  license: null,
  retired: false,
  created_at: "2026-07-01T00:00:00Z",
};

const ESSAY = "Peoples are agree with this opinion because education is important for the society.";

const evaluation: WritingEvaluation = {
  id: "we_1",
  created_at: "2026-07-20T10:00:00Z",
  llm_evaluation_id: "le_1",
  prompt_version: "writing_eval/v1",
  overall_band: 6.5,
  bands: { ta: 6, cc: 7, lr: 6, gra: 7 },
  criteria: {
    ta: {
      key: "ta",
      wire: "task_achievement",
      band: 6,
      comment: "The position is clear but thinly developed.",
      evidence_quotes: ["education is important"],
      evidence_ranges: [{ quote: "education is important", start: 38, end: 60 }],
      unanchored_quotes: [],
    },
  },
  annotations: [
    {
      quote: "Peoples are agree",
      type: "grammar",
      fix: "People agree",
      explanation: "'People' is already plural and 'agree' needs no 'are'.",
      start: 0,
      end: 17,
    },
  ],
  unanchored: [
    {
      quote: "for the society",
      type: "vocabulary",
      fix: "for society",
      explanation: "'Society' is uncountable in this general sense.",
    },
  ],
  structure_analysis: {
    paragraphs: [{ index: 1, role: "introduction", verdict: "States a position but no roadmap." }],
    missing_elements: ["no conclusion"],
    summary: "One paragraph only.",
  },
  model_answer_outline: ["Intro: paraphrase and state a position", "Body 1: strongest reason"],
  prechecks: [{ id: "minimum_words", level: "warn", message: "13 words is under the 250-word minimum." }],
  vocab_suggestions: [
    {
      term: "publicly funded",
      replaces: "free",
      sentence_context: "University education should be publicly funded.",
    },
  ],
};

function makeAttempt(overrides: Partial<WritingAttempt> = {}): WritingAttempt {
  return {
    id: "wa_1",
    attempt_id: "wa_1",
    prompt_id: prompt.id,
    parent_attempt_id: null,
    mode: "practice",
    status: "scored",
    word_count: 13,
    seconds_elapsed: 900,
    overtime_seconds: 0,
    paste_events: 0,
    integrity_flag: null,
    submitted_at: "2026-07-20T10:00:00Z",
    overall_band: 6.5,
    started_at: "2026-07-20T09:45:00Z",
    essay_text: ESSAY,
    outline_text: "",
    prompt,
    min_words: 250,
    time_limit_s: 2400,
    evaluation,
    evaluations: [{ id: "we_1", created_at: null, overall_band: 6.5, bands: evaluation.bands }],
    children: [],
    parent: null,
    ...overrides,
  };
}

const wrap = (node: ReactElement) => render(<MemoryRouter>{node}</MemoryRouter>);

afterEach(() => {
  useWritingStore.getState().resetDraft();
  vi.useRealTimers();
});

describe("AttemptReport", () => {
  it("shows the overall band, the criteria and the inline annotation", () => {
    wrap(<AttemptReport attempt={makeAttempt()} evaluation={evaluation} />);
    expect(screen.getByLabelText("Band 6.5, Overall")).toBeInTheDocument();
    expect(screen.getByText("The position is clear but thinly developed.")).toBeInTheDocument();
    expect(screen.getByText(/13 words is under the 250-word minimum/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rewrite with feedback/i })).toBeInTheDocument();
  });

  it("renders the answer tab with highlights and unanchored notes", async () => {
    const user = userEvent.setup();
    wrap(<AttemptReport attempt={makeAttempt()} evaluation={evaluation} />);
    await user.click(screen.getByRole("tab", { name: /your answer/i }));
    expect(screen.getByRole("button", { name: /^error: Grammar:/ })).toBeInTheDocument();
    expect(screen.getByText(/Notes that couldn't be pinned/)).toBeInTheDocument();
  });

  it("offers vocabulary upgrades and the model-answer outline", async () => {
    const user = userEvent.setup();
    wrap(<AttemptReport attempt={makeAttempt()} evaluation={evaluation} />);
    await user.click(screen.getByRole("tab", { name: /improve/i }));
    expect(screen.getByText("publicly funded")).toBeInTheDocument();
    const outline = screen.getByRole("button", { name: /show model answer outline/i });
    await user.click(outline);
    expect(screen.getByText(/AI-generated plan/)).toBeInTheDocument();
  });

  it("shows the diff and band delta for a rewrite", async () => {
    const user = userEvent.setup();
    const attempt = makeAttempt({
      parent_attempt_id: "wa_0",
      parent: {
        id: "wa_0",
        essay_text: "Peoples are agree with this opinion.",
        word_count: 6,
        overall_band: 5.5,
        bands: { ta: 5, cc: 6, lr: 5, gra: 6 },
        annotations: evaluation.annotations,
        submitted_at: "2026-07-19T10:00:00Z",
      },
    });
    wrap(<AttemptReport attempt={attempt} evaluation={evaluation} />);
    await user.click(screen.getByRole("tab", { name: /since last time/i }));
    expect(screen.getByText("Against your previous attempt")).toBeInTheDocument();
    expect(screen.getByText("What you changed")).toBeInTheDocument();
    expect(screen.getByText(/still present/)).toBeInTheDocument();
  });

  it("degrades cleanly when the model returned nothing but bands", () => {
    const bare: WritingEvaluation = {
      ...evaluation,
      criteria: {},
      annotations: [],
      unanchored: [],
      structure_analysis: { paragraphs: [], missing_elements: [], summary: "" },
      model_answer_outline: [],
      prechecks: [],
      vocab_suggestions: [],
    };
    wrap(<AttemptReport attempt={makeAttempt()} evaluation={bare} />);
    expect(
      screen.getAllByText(/returned no comment for this criterion/).length,
    ).toBeGreaterThan(0);
  });
});

describe("AttemptEditor", () => {
  // Real timers: the editor's one-second tick produces act() warnings in the
  // log, but fake timers deadlock userEvent's internal delays.
  const setup = () => userEvent.setup();

  function mount(attempt: WritingAttempt) {
    useWritingStore.setState({
      attempt,
      essay: attempt.essay_text,
      outline: attempt.outline_text,
      secondsElapsed: attempt.seconds_elapsed,
      pasteEvents: attempt.paste_events,
      dirty: false,
      saving: false,
      savedAt: null,
      saveError: null,
    });
    return wrap(<AttemptEditor attempt={attempt} />);
  }

  it("shows the prompt, the live word count and the practice affordances", () => {
    mount(makeAttempt({ status: "draft", submitted_at: null, overall_band: null, evaluation: null }));
    expect(screen.getByText(/university education should be free/)).toBeInTheDocument();
    const textarea = screen.getByLabelText("Your answer") as HTMLTextAreaElement;
    expect(textarea.getAttribute("spellcheck")).toBe("true");
    expect(screen.getByRole("button", { name: /phrase help/i })).toBeInTheDocument();
    const counter = screen.getByText("/ 250 words").parentElement as HTMLElement;
    expect(within(counter).getByText("13")).toBeInTheDocument();
  });

  it("turns off every assistance in exam mode", () => {
    mount(
      makeAttempt({
        status: "draft",
        mode: "exam",
        submitted_at: null,
        overall_band: null,
        evaluation: null,
      }),
    );
    const textarea = screen.getByLabelText("Your answer") as HTMLTextAreaElement;
    expect(textarea.getAttribute("spellcheck")).toBe("false");
    expect(textarea.getAttribute("data-gramm")).toBe("false");
    expect(screen.queryByRole("button", { name: /phrase help/i })).toBeNull();
  });

  it("counts a paste without blocking it", async () => {
    const user = setup();
    mount(
      makeAttempt({
        status: "draft",
        essay_text: "",
        word_count: 0,
        submitted_at: null,
        overall_band: null,
        evaluation: null,
      }),
    );
    const textarea = screen.getByLabelText("Your answer") as HTMLTextAreaElement;
    await user.click(textarea);
    await user.paste("three more words");
    expect(textarea.value).toBe("three more words");
    expect(useWritingStore.getState().pasteEvents).toBe(1);
    expect(useWritingStore.getState().dirty).toBe(true);
  });

  it("opens the outline scratchpad on demand", async () => {
    const user = setup();
    mount(makeAttempt({ status: "draft", submitted_at: null, overall_band: null, evaluation: null }));
    expect(screen.queryByLabelText("Outline scratchpad")).toBeNull();
    await user.click(screen.getByRole("button", { name: /outline scratchpad/i }));
    expect(screen.getByLabelText("Outline scratchpad")).toBeInTheDocument();
  });
});

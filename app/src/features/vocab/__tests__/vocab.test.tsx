import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { gradeAnswer, normalizeAnswer, wordVariants } from "../grading";
import { formatDue, sourceAttribution } from "../labels";
import { ExerciseCard } from "../components/ExerciseCard";
import type { QueueItem, VocabEntry } from "../types";

// --------------------------------------------------------------------- fixtures

const entry: VocabEntry = {
  id: "ve_1",
  headword: "mitigate",
  lemma: "mitigate",
  is_phrase: false,
  ipa: "/ˈmɪtɪɡeɪt/",
  pos: "verb",
  definition: "make something less severe",
  own_context_sentence: "Governments must mitigate the effects of climate change.",
  own_context_origin: "learner",
  example_sentences: [],
  collocations: ["mitigate the effects of"],
  topic_tags: ["environment"],
  cefr_level: "C1",
  audio_ref: "media/vocab/ve_1.wav",
  audio_url: "/api/v1/media/vocab/ve_1.wav",
  status: "active",
  created_at: "2026-03-12T09:00:00.000Z",
  updated_at: "2026-03-12T09:00:00.000Z",
  source: { module: "speaking", session_id: "sp_1", detail: null },
  srs: {
    card_id: "sc_1",
    state: "review",
    state_code: 2,
    step: null,
    stability: 9.5,
    difficulty: 5.1,
    due: "2026-03-20T09:00:00.000Z",
    last_review: "2026-03-13T09:00:00.000Z",
    reps: 4,
    lapses: 1,
    retrievability: 0.88,
    maturity: "young",
  },
};

const clozeItem: QueueItem = {
  card_id: "sc_1",
  entry_id: "ve_1",
  entry,
  exercise_type: "cloze",
  exercise: {
    type: "cloze",
    prompt: "Fill the gap (from your Speaking practice)",
    payload: {
      entry_id: "ve_1",
      masked_sentence: "Governments must ________ the effects of climate change.",
      blanks: 1,
      hint_first_letter: "m",
      hint_length: 8,
      ipa: "/ˈmɪtɪɡeɪt/",
      pos: "verb",
      audio_url: "/api/v1/media/vocab/ve_1.wav",
      definition: "make something less severe",
    },
    expected: ["mitigate"],
  },
  intervals: {
    again: { rating: 1, interval_s: 600, label: "10m", due_at: null },
    hard: { rating: 2, interval_s: 86400, label: "1d", due_at: null },
    good: { rating: 3, interval_s: 259200, label: "3d", due_at: null },
    easy: { rating: 4, interval_s: 604800, label: "7d", due_at: null },
  },
};

// ---------------------------------------------------------------------- grading

describe("normalizeAnswer", () => {
  it("folds case, accents and punctuation like the sidecar does", () => {
    expect(normalizeAnswer("  Mitigate! ")).toBe("mitigate");
    expect(normalizeAnswer("naïve")).toBe("naive");
    expect(normalizeAnswer("it’s well-known")).toBe("it's well-known");
    expect(normalizeAnswer("a   b")).toBe("a b");
  });
});

describe("wordVariants", () => {
  it("covers the regular inflections a learner might type", () => {
    const forms = wordVariants("mitigate", "mitigate");
    expect(forms.has("mitigates")).toBe(true);
    expect(forms.has("mitigated")).toBe(true);
    expect(forms.has("mitigating")).toBe(true);
  });
});

describe("gradeAnswer", () => {
  it("accepts the exact answer and suggests Good", () => {
    const grade = gradeAnswer(clozeItem.exercise, "Mitigate", { entry });
    expect(grade.correct).toBe(true);
    expect(grade.suggestedRating).toBe(3);
  });

  it("treats a wrong word form as close and suggests Hard", () => {
    const grade = gradeAnswer(clozeItem.exercise, "mitigating", { entry });
    expect(grade.correct).toBe(false);
    expect(grade.close).toBe(true);
    expect(grade.suggestedRating).toBe(2);
  });

  it("suggests Again when the answer was revealed", () => {
    const grade = gradeAnswer(clozeItem.exercise, "", { revealed: true, entry });
    expect(grade.suggestedRating).toBe(1);
    expect(grade.detail).toContain("mitigate");
  });

  it("does not auto-check exercises without an expected answer", () => {
    const grade = gradeAnswer(
      { ...clozeItem.exercise, expected: null },
      "anything",
      { entry },
    );
    expect(grade.checked).toBe(false);
    expect(grade.correct).toBeNull();
  });
});

// ----------------------------------------------------------------------- labels

describe("sourceAttribution", () => {
  it("names the module and the day the word was captured", () => {
    expect(sourceAttribution(entry)).toMatch(/^from your Speaking session on /);
  });

  it("names the deck for seeded words", () => {
    expect(
      sourceAttribution({
        ...entry,
        source: { module: "seed", session_id: null, detail: "deck:topic-environment" },
      }),
    ).toBe("from the topic environment study deck");
  });
});

describe("formatDue", () => {
  it("reads overdue cards as past and future cards as upcoming", () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
    expect(formatDue(past)).toBe("3 days ago");
    expect(formatDue(future)).toBe("in 2 days");
    expect(formatDue(null)).toBe("—");
  });
});

// ------------------------------------------------------------------ review card

function renderCard(onRate = vi.fn()) {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ExerciseCard item={clozeItem} onRate={onRate} submitting={false} />
    </MemoryRouter>,
  );
  return onRate;
}

describe("ExerciseCard (cloze)", () => {
  it("grades a typed answer and shows the four intervals", async () => {
    const user = userEvent.setup();
    const onRate = renderCard();

    await user.type(screen.getByLabelText("The missing word"), "mitigate");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("Correct.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Good — next in 3d/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Again — next in 10m/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Good — next in 3d/ }));
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate.mock.calls[0][0]).toBe(3);
    expect(onRate.mock.calls[0][1].correct).toBe(true);
  });

  it("reveals with Space and rates with the number keys", async () => {
    const user = userEvent.setup();
    const onRate = renderCard();

    await user.click(document.body);
    await user.keyboard(" ");
    expect(screen.getByText(/The answer is/)).toBeInTheDocument();

    await user.keyboard("1");
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate.mock.calls[0][0]).toBe(1);
  });

  it("keeps the hint hidden until it is asked for", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.queryByText(/Starts with/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hint" }));
    expect(screen.getByText(/Starts with “m”, 8 letters/)).toBeInTheDocument();
  });
});

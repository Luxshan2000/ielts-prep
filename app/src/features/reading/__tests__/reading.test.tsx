import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  instructionFor,
  layoutGapNumbers,
  splitGaps,
  splitLetters,
  wordLimitState,
} from "../qtypes";
import {
  chosenLetters,
  distributeLetters,
  findQuote,
  flattenQuestions,
  numberWindow,
  paletteStatus,
  sentenceAround,
  sliceSpans,
  usedLetters,
} from "../model";
import { QuestionGroupCard } from "../components/QuestionGroupCard";
import type { PassageDoc, QuestionGroup } from "../types";

describe("word limits (mirrors scoring/answers.py)", () => {
  const limit = { max_words: 2, numbers_allowed: true };

  it("accepts two words and one number", () => {
    expect(wordLimitState("ceramic jars", limit)?.over).toBe(false);
    expect(wordLimitState("40 ceramic jars", limit)?.over).toBe(false);
  });

  it("counts articles as words, so 'the coal mine' breaks a two-word limit", () => {
    expect(wordLimitState("the coal mine", limit)?.over).toBe(true);
  });

  it("treats a hyphenated compound as one word", () => {
    expect(wordLimitState("well-being", { max_words: 1, numbers_allowed: false })?.over).toBe(false);
  });

  it("says nothing when the group carries no limit", () => {
    expect(wordLimitState("anything at all", null)).toBeNull();
  });

  it("renders the 06 §2.1 instruction strings", () => {
    expect(instructionFor({ max_words: 1, numbers_allowed: false })).toBe(
      "Write ONE WORD ONLY for each answer.",
    );
    expect(instructionFor(limit)).toBe(
      "Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.",
    );
    expect(instructionFor(null)).toBe("");
  });
});

describe("gap markers", () => {
  it("splits a prompt into text and gap tokens", () => {
    const tokens = splitGaps("Cargoes were sealed inside {{gap}} to protect them.");
    expect(tokens.map((t) => t.kind)).toEqual(["text", "gap", "text"]);
    expect(tokens[1].number).toBeNull();
  });

  it("resolves numbered and bare gaps against the group's numbers", () => {
    const layout = { kind: "table", rows: [["Purpose", "{{14}}"], ["Cost", "{{gap}}"]] };
    expect(layoutGapNumbers(layout, null, [14, 15])).toEqual([14, 15]);
  });

  it("reads diagram labels as the gap order", () => {
    const layout = {
      kind: "diagram",
      image: "assets/x.svg",
      labels: [
        { number: 27, x: 0.1, y: 0.2 },
        { number: 28, x: 0.3, y: 0.4 },
      ],
    };
    expect(layoutGapNumbers(layout, null, [])).toEqual([27, 28]);
  });
});

describe("passage annotations", () => {
  const text = "Alpha beta gamma. Delta epsilon zeta.";

  it("slices highlight ranges into spans that remember their id", () => {
    const spans = sliceSpans(text, [{ start: 6, end: 10, kind: "highlight", id: 3 }]);
    const marked = spans.filter((span) => span.highlight);
    expect(marked).toHaveLength(1);
    expect(marked[0].text).toBe("beta");
    expect(marked[0].highlightId).toBe(3);
  });

  it("finds an evidence quote even when whitespace differs", () => {
    expect(findQuote(text, "beta   gamma")).toEqual({ start: 6, end: 16 });
    expect(findQuote(text, "nothing here")).toBeNull();
  });

  it("extracts the sentence a looked-up word sits in", () => {
    expect(sentenceAround(text, 20)).toBe("Delta epsilon zeta.");
  });
});

describe("answer bookkeeping", () => {
  const group: QuestionGroup = {
    id: "g1",
    type: "multiple_choice_multi",
    select_count: 2,
    options: [
      { key: "A", text: "one" },
      { key: "B", text: "two" },
      { key: "C", text: "three" },
    ],
    questions: [
      { number: 5, prompt: "" },
      { number: 6, prompt: "" },
    ],
  };

  it("spreads chosen letters across the group's answer slots", () => {
    expect(distributeLetters(group, ["A", "C"])).toEqual({ "5": "A", "6": "C" });
    expect(distributeLetters(group, ["A"])).toEqual({ "5": "A", "6": "" });
  });

  it("reads them back as one set", () => {
    expect(chosenLetters(group, { "5": "A", "6": "C" })).toEqual(["A", "C"]);
  });

  it("collects used letters for a no-reuse bank", () => {
    expect([...usedLetters(group, { "5": "a" })]).toEqual(["A"]);
    expect(splitLetters("b, c")).toEqual(["B", "C"]);
  });
});

describe("attempt shape", () => {
  const passages: PassageDoc[] = [
    {
      id: "p1",
      title: "First",
      question_groups: [
        {
          id: "g1",
          type: "true_false_not_given",
          questions: [
            { number: 1, prompt: "a", anchor_paragraphs: ["A"] },
            { number: 2, prompt: "b" },
          ],
        },
      ],
    },
    {
      id: "p2",
      title: "Second",
      question_groups: [
        { id: "g2", type: "short_answer", questions: [{ number: 3, prompt: "c" }] },
      ],
    },
  ];

  it("flattens every question with its passage and anchor", () => {
    const flat = flattenQuestions(passages);
    expect(flat.map((q) => q.number)).toEqual([1, 2, 3]);
    expect(flat[1].anchor).toBe("A"); // inherited from the group's first anchor
    expect(flat[2].passageIndex).toBe(1);
    expect(numberWindow(flat)).toEqual({ start: 1, end: 3 });
  });

  it("maps answered / flagged / blank onto the palette", () => {
    const flat = flattenQuestions(passages);
    expect(paletteStatus(flat, { "1": "TRUE" }, [2])).toEqual({
      1: "answered",
      2: "flagged",
      3: "blank",
    });
  });
});

describe("QuestionGroupCard input affordances", () => {
  function renderGroup(group: QuestionGroup, answers: Record<string, string> = {}) {
    const onAnswer = vi.fn();
    const onAnswers = vi.fn();
    render(
      <QuestionGroupCard
        group={group}
        answers={answers}
        flags={[]}
        current={null}
        onAnswer={onAnswer}
        onAnswers={onAnswers}
        onToggleFlag={vi.fn()}
        onFocusQuestion={vi.fn()}
      />,
    );
    return { onAnswer, onAnswers };
  }

  it("renders TRUE/FALSE/NOT GIVEN as a radio group and records the choice", async () => {
    const { onAnswer } = renderGroup({
      id: "g1",
      type: "true_false_not_given",
      instructions: "Do the following statements agree with the passage?",
      questions: [{ number: 1, prompt: "Trade predated Europe." }],
    });
    await userEvent.click(screen.getByRole("radio", { name: "NOT GIVEN" }));
    expect(onAnswer).toHaveBeenCalledWith("1", "NOT GIVEN");
  });

  it("uses YES/NO/NOT GIVEN for the opinion variant", () => {
    renderGroup({
      id: "g1",
      type: "yes_no_not_given",
      questions: [{ number: 1, prompt: "The writer approves." }],
    });
    expect(screen.getByRole("radio", { name: "YES" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "TRUE" })).not.toBeInTheDocument();
  });

  const gapGroup: QuestionGroup = {
    id: "g2",
    type: "sentence_completion",
    word_limit: { max_words: 2, numbers_allowed: true },
    questions: [{ number: 8, prompt: "Cargoes were sealed inside {{gap}} to survive." }],
  };

  it("renders an inline gap for sentence completion and reports what was typed", async () => {
    const { onAnswer } = renderGroup(gapGroup);
    await userEvent.type(screen.getByRole("textbox", { name: /Question 8/ }), "j");
    expect(onAnswer).toHaveBeenCalledWith("8", "j");
  });

  it("warns live when the answer breaks the group's word limit", () => {
    renderGroup(gapGroup, { "8": "the coal mine" });
    expect(screen.getByText(/over the limit/)).toBeInTheDocument();
  });

  it("shows the heading bank and dims a heading already used", () => {
    renderGroup(
      {
        id: "g3",
        type: "matching_headings",
        allow_reuse: false,
        options: [
          { key: "i", text: "A decline" },
          { key: "ii", text: "Evidence underwater" },
        ],
        questions: [
          { number: 1, prompt: "Paragraph A" },
          { number: 2, prompt: "Paragraph B" },
        ],
      },
      { "1": "II" },
    );
    expect(screen.getByText("List of headings")).toBeInTheDocument();
    expect(screen.getByText("Evidence underwater").parentElement).toHaveClass("line-through");
  });

  it("spreads a two-letter multi-select across both answer slots", async () => {
    const { onAnswers } = renderGroup({
      id: "g4",
      type: "multiple_choice_multi",
      select_count: 2,
      options: [
        { key: "A", text: "one" },
        { key: "B", text: "two" },
        { key: "C", text: "three" },
      ],
      questions: [
        { number: 5, prompt: "" },
        { number: 6, prompt: "" },
      ],
    });
    await userEvent.click(screen.getByRole("checkbox", { name: /one/ }));
    expect(onAnswers).toHaveBeenCalledWith({ "5": "A", "6": "" });
  });

  it("renders a table skeleton with one input per numbered gap", () => {
    renderGroup({
      id: "g5",
      type: "table_completion",
      word_limit: { max_words: 1, numbers_allowed: true },
      layout: {
        kind: "table",
        columns: ["Field", "Value"],
        rows: [["Purpose", "{{14}}"], ["Cost", "{{15}}"]],
      },
      questions: [
        { number: 14, prompt: "Purpose" },
        { number: 15, prompt: "Cost" },
      ],
    });
    expect(screen.getByRole("textbox", { name: /Question 14/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Question 15/ })).toBeInTheDocument();
  });

  it("falls back to a text box for an unknown question type instead of dropping it", () => {
    renderGroup({
      id: "g6",
      type: "some_future_type",
      questions: [{ number: 20, prompt: "Anything" }],
    });
    expect(screen.getByRole("textbox", { name: /Question 20/ })).toBeInTheDocument();
  });
});

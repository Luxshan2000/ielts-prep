/**
 * A form completion is one form, not one form per gap.
 *
 * Form, note and table prompts are authored once per group and copied onto every question
 * in that group, with `**n**` marking which gap belongs to which number. The answer sheet
 * drew a QuestionBlock per question, so a six-gap form rendered the entire form six times —
 * and printed the markers literally, so the learner saw the same block over and over with
 * `**1**` scattered through it. Both halves of that are pinned here.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SharedBlock, isSharedBlock } from "../components/SharedBlock";
import type { ListeningQuestion } from "../types";

const FORM = [
  "**PENVALE COTTAGES — BOOKING**",
  "Surname: **1** ______",
  "Arrival: Saturday **2** ______ April",
  "Deposit: **3** ______ pounds",
].join("\n");

function q(number: number, over: Partial<ListeningQuestion> = {}): ListeningQuestion {
  return {
    id: `q${number}`,
    number,
    type: "form_completion",
    prompt: FORM,
    options: null,
    word_limit: 2,
    asset: null,
    ...over,
  } as ListeningQuestion;
}

const GROUP = [q(1), q(2), q(3)];

function renderBlock(
  questions: ListeningQuestion[] = GROUP,
  answers: Record<string, string> = {},
  onAnswer = vi.fn(),
) {
  render(
    <SharedBlock
      questions={questions}
      answers={answers}
      onAnswer={onAnswer}
      activeNumber={1}
      onActive={vi.fn()}
    />,
  );
  return onAnswer;
}

describe("isSharedBlock", () => {
  it("recognises one block copied across a group", () => {
    expect(isSharedBlock(GROUP)).toBe(true);
  });

  it("is false when the prompts genuinely differ", () => {
    expect(isSharedBlock([q(1), q(2, { prompt: "A different question entirely" })])).toBe(false);
  });

  it("is false without markers — nothing says which gap is whose", () => {
    const plain = "Write the answer here: ______";
    expect(isSharedBlock([q(1, { prompt: plain }), q(2, { prompt: plain })])).toBe(false);
  });

  it("is false for a lone question, which has nothing to share with", () => {
    expect(isSharedBlock([q(1)])).toBe(false);
  });
});

describe("SharedBlock", () => {
  it("draws the form once, not once per question", () => {
    renderBlock();
    expect(screen.getAllByText(/PENVALE COTTAGES/)).toHaveLength(1);
    expect(screen.getAllByText(/Surname:/)).toHaveLength(1);
  });

  it("never shows the authoring markers", () => {
    const { container } = render(
      <SharedBlock
        questions={GROUP}
        answers={{}}
        onAnswer={vi.fn()}
        activeNumber={1}
        onActive={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).toContain("PENVALE COTTAGES");
  });

  it("gives every question its own field", () => {
    renderBlock();
    for (const n of [1, 2, 3]) {
      expect(screen.getByLabelText(`Answer for question ${n}`)).toBeInTheDocument();
    }
  });

  it("routes typing to the question whose marker precedes the gap", async () => {
    const onAnswer = renderBlock();
    await userEvent.type(screen.getByLabelText("Answer for question 2"), "7");
    expect(onAnswer).toHaveBeenCalledWith(2, "7");
  });

  it("keeps the text around each gap", () => {
    renderBlock();
    expect(screen.getByText(/Arrival: Saturday/)).toBeInTheDocument();
    expect(screen.getByText(/April/)).toBeInTheDocument();
  });

  it("shows the answers it already has", () => {
    renderBlock(GROUP, { "1": "Hooper", "3": "40" });
    expect(screen.getByLabelText("Answer for question 1")).toHaveValue("Hooper");
    expect(screen.getByLabelText("Answer for question 3")).toHaveValue("40");
  });

  it("names the questions that are over the word limit", () => {
    renderBlock(GROUP, { "2": "far too many words here" });
    expect(screen.getByText(/over the word limit/)).toHaveTextContent("2");
  });

  it("states the word limit when nothing is over it", () => {
    renderBlock();
    expect(screen.queryByText(/over the word limit/)).not.toBeInTheDocument();
  });

  it("renders a gap with no owning question as a blank rather than dropping the line", () => {
    // Question 2 is in another part of the sheet; its gap must still hold the line's shape.
    render(
      <SharedBlock
        questions={[q(1), q(3)]}
        answers={{}}
        onAnswer={vi.fn()}
        activeNumber={1}
        onActive={vi.fn()}
      />,
    );
    expect(screen.getByText(/Arrival: Saturday/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Answer for question 2")).not.toBeInTheDocument();
  });

  it("keeps a table's headers and puts the field in the right cell", () => {
    const table = [
      "| Stage | Detail |",
      "| --- | --- |",
      "| Survey | **1** ______ |",
      "| Report | filed in **2** ______ |",
    ].join("\n");
    render(
      <SharedBlock
        questions={[q(1, { prompt: table }), q(2, { prompt: table })]}
        answers={{}}
        onAnswer={vi.fn()}
        activeNumber={1}
        onActive={vi.fn()}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Stage" })).toBeInTheDocument();
    const row = screen.getByText("Report").closest("tr")!;
    expect(within(row).getByLabelText("Answer for question 2")).toBeInTheDocument();
  });

  it("locks every field when the part is read-only", () => {
    render(
      <SharedBlock
        questions={GROUP}
        answers={{}}
        onAnswer={vi.fn()}
        readOnly
        activeNumber={1}
        onActive={vi.fn()}
      />,
    );
    for (const n of [1, 2, 3]) {
      expect(screen.getByLabelText(`Answer for question ${n}`)).toHaveAttribute("readonly");
    }
  });
});

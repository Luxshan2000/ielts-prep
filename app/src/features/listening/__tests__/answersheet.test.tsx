import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerSheet } from "../components/AnswerSheet";
import { CheckStep } from "../components/CheckStep";
import { QuestionBlock } from "../components/QuestionBlock";
import type { ListeningPart, ListeningQuestion } from "../types";

const question = (over: Partial<ListeningQuestion>): ListeningQuestion => ({
  id: `q-${over.number ?? 1}`,
  number: over.number ?? 1,
  source_number: over.number ?? 1,
  type: "note_completion",
  instruction: null,
  prompt: null,
  options: null,
  select_n: null,
  asset: null,
  word_limit: null,
  slots: 1,
  ...over,
});

const part = (questions: ListeningQuestion[]): ListeningPart => ({
  id: "ls_1",
  part: 1,
  title: "Booking a cycling tour",
  scenario: "A caller books a tour",
  accent_set: "uk",
  target_band: 6,
  source: "pack",
  speakers: [],
  questions,
  audio: {
    audio_hash: "abc",
    expected_audio_hash: "abc",
    ready: true,
    duration_ms: 300_000,
    media_path: "/api/v1/media/listening/abc.wav",
    timing_path: "/api/v1/media/listening/abc.timing.json",
    accent_set: "uk",
    accent_label: "British",
  },
});

describe("QuestionBlock — completion types", () => {
  it("puts one input in the prompt's gap and reports typing", async () => {
    const onChange = vi.fn();
    render(
      <QuestionBlock
        question={question({ number: 3, prompt: "Surname: ______", word_limit: 2 })}
        value=""
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Answer for question 3");
    await userEvent.type(input, "B");
    expect(onChange).toHaveBeenCalledWith("B");
    expect(screen.getByText(/NO MORE THAN TWO WORDS/)).toBeInTheDocument();
  });

  it("warns when the answer is over the word limit instead of blocking it", () => {
    render(
      <QuestionBlock
        question={question({ number: 4, prompt: "Meeting point: ______", word_limit: 1 })}
        value="the market square"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/over the limit of 1/)).toBeInTheDocument();
    expect(screen.getByLabelText("Answer for question 4")).toHaveAttribute("aria-invalid", "true");
  });

  it("renders a table prompt as a real table with the input in the gapped cell", () => {
    render(
      <QuestionBlock
        question={question({
          number: 5,
          type: "table_completion",
          prompt: ["| Ticket | Price |", "|---|---|", "| Day pass | £______ |"].join("\n"),
        })}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Ticket" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Answer for question 5")).toHaveLength(1);
  });

  it("locks the input when the part is read only", () => {
    render(
      <QuestionBlock
        question={question({ number: 6, prompt: "Surname: ______" })}
        value="bramley"
        onChange={vi.fn()}
        readOnly
      />,
    );
    expect(screen.getByLabelText("Answer for question 6")).toHaveAttribute("readonly");
  });
});

describe("QuestionBlock — letter types", () => {
  it("selects a single letter by click", async () => {
    const onChange = vi.fn();
    render(
      <QuestionBlock
        question={question({
          number: 7,
          type: "multiple_choice",
          prompt: "The tour departs from",
          options: { A: "the ferry terminal", B: "the railway station" },
        })}
        value=""
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /railway station/ }));
    expect(onChange).toHaveBeenCalledWith("B");
  });

  it("accepts typing the letter, as CD-IELTS does", async () => {
    const onChange = vi.fn();
    render(
      <QuestionBlock
        question={question({
          number: 8,
          type: "matching",
          prompt: "Museum shop",
          options: { A: "closed", B: "moved", C: "extended" },
        })}
        value=""
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /closed/ }));
    onChange.mockClear();
    await userEvent.keyboard("c");
    expect(onChange).toHaveBeenCalledWith("C");
  });

  it("holds two letters for a choose-TWO question", async () => {
    const onChange = vi.fn();
    const q = question({
      number: 9,
      type: "multiple_choice",
      select_n: 2,
      slots: 2,
      prompt: "Choose TWO facilities",
      options: { A: "pool", B: "gym", C: "cafe" },
    });
    const { rerender } = render(
      <QuestionBlock question={q} value="" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /pool/ }));
    expect(onChange).toHaveBeenCalledWith("A");
    rerender(<QuestionBlock question={q} value="A" onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /cafe/ }));
    expect(onChange).toHaveBeenLastCalledWith("A, C");
  });
});

describe("AnswerSheet", () => {
  it("shows a shared instruction once per group", () => {
    render(
      <AnswerSheet
        part={part([
          question({ number: 1, instruction: "Complete the notes.", prompt: "Name: ______" }),
          question({ number: 2, instruction: "Complete the notes.", prompt: "Town: ______" }),
        ])}
        answers={{ "1": "bramley" }}
        onAnswer={vi.fn()}
        activeNumber={1}
        onActive={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Complete the notes.")).toHaveLength(1);
    expect(screen.getByText("Questions 1–2")).toBeInTheDocument();
  });
});

describe("CheckStep", () => {
  it("counts the blanks and submits on demand", async () => {
    const onSubmit = vi.fn();
    render(
      <CheckStep
        parts={[part([question({ number: 1 }), question({ number: 2 })])]}
        answers={{ "1": "bramley" }}
        onAnswer={vi.fn()}
        exam={false}
        submitting={false}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText("1 unanswered")).toBeInTheDocument();
    expect(screen.getByText(/Spelling is marked/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("auto-submits when the two-minute exam check runs out", () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    render(
      <CheckStep
        parts={[part([question({ number: 1 })])]}
        answers={{}}
        onAnswer={vi.fn()}
        exam
        submitting={false}
        onSubmit={onSubmit}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(121_000);
    });
    vi.useRealTimers();
    expect(onSubmit).toHaveBeenCalled();
  });
});

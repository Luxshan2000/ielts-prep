/**
 * Smoke tests for the coach: every surface renders against a realistic payload,
 * and — the part that actually matters — the model answers stay shut until there
 * is a submitted attempt.
 *
 * The gate is asserted twice on purpose: once as "locked before", once as "open
 * after", because a gate that never opens and a gate that never closes both pass a
 * single-direction test.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AttemptGate, ModelAnswerViewer, NoticeGate } from "../ModelAnswers";
import { LanguageBankPanel } from "../LanguageBank";
import { OverviewCoach } from "../OverviewCoach";
import { PlanPanel } from "../PlanPanel";
import { SentenceLadder } from "../SentenceLadder";
import { TaskBrief } from "../TaskBrief";
import { placeSpans } from "../spans";
import { hasTeaching, type WritingTeaching } from "../types";
import type { WritingPrompt } from "../../../store";

const prompt: WritingPrompt = {
  id: "wp_a1_01_grouped_bar_food",
  task_type: "ac_task1",
  task_label: "Writing Task 1 (Academic)",
  genre: "grouped_bar",
  difficulty: 2,
  topic_id: "topic_food",
  topic_tags: ["food", "income", "households"],
  prompt_text:
    "The chart below shows how households at three income levels in Marrowfield divided their weekly food budget in 2024.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
  chart_spec: {
    kind: "grouped_bar",
    title: "Share of the weekly food budget by income group, Marrowfield, 2024",
    unit: "% of the food budget",
    x_axis: { label: "Category", categories: ["Staples", "Eating out"] },
    y_axis: { label: "%", min: 0, max: 40 },
    series: [
      { name: "Lower income", values: [26, 10] },
      { name: "Higher income", values: [12, 29] },
    ],
  },
  letter_bullets: [],
  min_words: 150,
  time_limit_s: 1200,
  source: "pack",
  license: null,
  retired: false,
  created_at: "2026-07-01T00:00:00Z",
};

const BAND6 =
  "The chart shows food budgets.\n\nOverall, eating out was 10% in the lower group.\n\nStaples were 26% in the lower group and 12% in the higher group.\n\nEating out was 29% in the higher group.";
const BAND7 =
  "The chart compares food budgets.\n\nOverall, the higher the income, the smaller the share going on staples.\n\nStaples fell from 26% to 12% as income rose.\n\nEating out ran the other way, at 29% against 10%.";

const teaching: WritingTeaching = {
  schema_version: 1,
  cluster: "ac1-trends",
  teaches: "Split five categories into two behaviours and say which one income does not touch.",
  band_move: "Write the overview before the body, and let it carry no figures at all.",
  exam_note: "There is no length credit in Task 1.",
  time_plan: [
    { phase: "decode", minutes: 3, does: "Read the unit: shares of a budget, not amounts." },
    { phase: "plan", minutes: 2, does: "Commit to both overview sentences before writing." },
    { phase: "write", minutes: 12, does: "Intro and overview first, then sixty words a group." },
    { phase: "check", minutes: 3, does: "Re-read every figure against the chart." },
  ],
  plan: {
    lines: [
      { label: "TENSE", note: "2024 finished -> past simple" },
      { label: "OVERVIEW", note: "staples DOWN / eating out UP" },
    ],
    test: "Could a stranger write both body paragraphs from these lines?",
    trap: "Most people report the middle group in full.",
  },
  structure_plan: [
    { para: 1, role: "introduction", words: 26, must_do: "Paraphrase the description line." },
    { para: 2, role: "overview", words: 38, must_do: "Two sentences, no digits." },
  ],
  parts_checklist: [
    {
      part: "A figure-free overview in its own paragraph",
      evidence_question: "Which sentence is true of every group and has no number in it?",
    },
  ],
  language_bank: {
    warning: "These are frames with gaps, not sentences to recite.",
    moves: [
      {
        move: "grouping",
        why_here: "The categories split cleanly into movers and non-movers.",
        grammar: "grouping sentences",
        frames: [{ frame: "___ of the five categories ___ with income.", slot_hint: "how many" }],
        avoid: "Firstly, I will describe the first category.",
      },
    ],
  },
  collocations: [
    {
      chunk: "account for a third of the total",
      example: "Eating out accounted for a third of the total in the highest group.",
      cefr: "C1",
    },
  ],
  upgrade_pairs: [{ vague: "went up a lot", precise: "took a substantially larger share", why: "Shares, not money." }],
  target_structures: [
    {
      name: "Correlative comparative",
      model: "The higher the income, the smaller the share.",
      trap: "Both halves need 'the'.",
    },
  ],
  error_watchlist: [
    {
      pattern: "share versus amount",
      wrong: "Higher-income households spent less money on staples.",
      right: "Staples took a smaller share of higher-income budgets.",
      why: "A smaller share of a bigger budget can still be more money.",
      criterion: "ta",
    },
  ],
  checklist: ["Is my overview free of every single number?"],
  rewrite_focus: {
    focus: "Delete every figure from your second paragraph.",
    why: "It turns a mechanical overview into a clear one.",
    drill: "Four minutes: write two overview sentences with no digits.",
  },
  sentence_ladder: {
    idea: "Eating out takes a bigger share of richer budgets.",
    rungs: [
      { band: 5, text: "Eating out is more high in rich group." },
      { band: 6, text: "Eating out was 10% for lower-income households and 29% for higher." },
      { band: 7, text: "Eating out ran the other way, at 29% against 10%." },
      { band: 8, text: "eating out, which climbed from a marginal 10% to 29%" },
    ],
  },
  overview_brief: {
    must_capture: [
      "As income rises the budget shifts away from staples and towards eating out.",
      "Fresh produce takes almost the same share of every budget.",
    ],
    model_overview:
      "Overall, the higher a household's income, the smaller the share going on cheap staples.",
    weak_overview: {
      text: "Overall, lower-income households spent 26% on staples.",
      failure: "W2",
    },
    group_as: {
      body1: "The shares that move with income.",
      body2: "The shares income barely touches.",
      why: "Grouping by behaviour lets one sentence carry three categories.",
    },
    must_report: ["Eating out nearly tripled its share"],
    omit: ["The middle group's figures"],
    figure_budget: { min: 8, max: 12 },
    tense: "Past simple throughout: 2024 has finished.",
  },
  model_answers: [
    {
      band_target: 6,
      label: "Where most candidates land",
      word_count: 34,
      text: BAND6,
      what_caps_it: [{ criterion: "ta", point: "The overview is a data sentence." }],
      what_lifts_it: [],
      annotations: [
        {
          span: "Overall, eating out was 10% in the lower group.",
          kind: "avoid",
          criterion: "ta",
          label: "An overview with a figure in it",
          why: "Say what is true of the whole chart instead.",
          transferable: false,
        },
      ],
    },
    {
      band_target: 7,
      label: "The target",
      word_count: 38,
      text: BAND7,
      what_caps_it: [],
      what_lifts_it: [{ criterion: "ta", point: "A figure-free overview." }],
      annotations: [
        {
          span: "the higher the income, the smaller the share going on staples",
          kind: "overview",
          criterion: "ta",
          label: "One sentence for the whole pattern",
          why: "A correlative comparative covers every group at once.",
          transferable: true,
        },
      ],
    },
  ],
};

function mount(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("teaching payload detection", () => {
  it("treats an absent payload as absent, not as an empty coach", () => {
    expect(hasTeaching(null)).toBe(false);
    expect(hasTeaching(undefined)).toBe(false);
    expect(hasTeaching({})).toBe(false);
    expect(hasTeaching(teaching)).toBe(true);
  });
});

describe("span placement", () => {
  it("anchors every authored span and reports the ones it cannot", () => {
    const { placed, unresolved } = placeSpans(BAND7, [
      { span: "Eating out ran the other way", label: "a" },
      { span: "a sentence that is not in the text", label: "b" },
    ]);
    expect(placed).toHaveLength(1);
    expect(unresolved).toHaveLength(1);
    expect(BAND7.slice(placed[0].start, placed[0].end)).toBe("Eating out ran the other way");
  });

  it("walks forward through repeated spans instead of stacking on the first", () => {
    const text = "one two one two";
    const { placed } = placeSpans(text, [{ span: "one" }, { span: "one" }]);
    expect(placed.map((p) => p.start)).toEqual([0, 8]);
  });
});

describe("the task brief", () => {
  it("leads with the one behaviour and names the errors before they are made", () => {
    mount(<TaskBrief prompt={prompt} teaching={teaching} />);
    expect(screen.getByText(/Write the overview before the body/)).toBeInTheDocument();
    expect(screen.getByText("share versus amount")).toBeInTheDocument();
    expect(
      screen.getByText(/A figure-free overview in its own paragraph/),
    ).toBeInTheDocument();
  });

  it("renders a prompt with no teaching payload at all", () => {
    mount(<TaskBrief prompt={prompt} teaching={null} />);
    expect(screen.getByText(/Summarise the information/)).toBeInTheDocument();
  });
});

describe("the plan", () => {
  it("shows the four phases and withholds the trap until there is an attempt", () => {
    const { unmount } = mount(
      <PlanPanel teaching={teaching} taskType="ac_task1" attempted={false} />,
    );
    expect(screen.getByText("The 20 minutes, spent")).toBeInTheDocument();
    expect(screen.queryByText(/Most people report the middle group/)).not.toBeInTheDocument();
    unmount();

    mount(<PlanPanel teaching={teaching} taskType="ac_task1" attempted />);
    expect(screen.getByText(/Most people report the middle group/)).toBeInTheDocument();
  });
});

describe("the overview builder", () => {
  it("refuses to call two statements done while either contains a digit", async () => {
    const user = userEvent.setup();
    mount(
      <OverviewCoach
        brief={teaching.overview_brief ?? {}}
        draft={["Staples fall as income rises across the groups.", "Produce holds its share of 26%"]}
        onDraftChange={() => undefined}
        attempted={false}
      />,
    );
    expect(screen.getByText(/There is a digit in there/)).toBeInTheDocument();
    expect(screen.getByText("Both boxes, no digits.")).toBeInTheDocument();
    // And the authored answers are not on the page before an attempt.
    expect(screen.queryByText(/the smaller the share going on cheap staples/)).not.toBeInTheDocument();
    await user.tab();
  });

  it("opens the authored statements once the task has been written", () => {
    mount(
      <OverviewCoach
        brief={teaching.overview_brief ?? {}}
        draft={["", ""]}
        onDraftChange={() => undefined}
        attempted
      />,
    );
    expect(screen.getByText(/the smaller the share going on cheap staples/)).toBeInTheDocument();
    expect(screen.getByText("A data sentence in disguise")).toBeInTheDocument();
  });
});

describe("the attempt gate", () => {
  it("hides the models behind one sentence of reason and one way out", () => {
    mount(
      <AttemptGate locked reason="Because it would be a script." onWrite={() => undefined}>
        <p>the model</p>
      </AttemptGate>,
    );
    expect(screen.getByText("Have a go first")).toBeInTheDocument();
    expect(screen.queryByText("the model")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /write this one first/i })).toBeInTheDocument();
  });

  it("gets out of the way once it is unlocked", () => {
    mount(
      <AttemptGate locked={false} reason="unused">
        <p>the model</p>
      </AttemptGate>,
    );
    expect(screen.getByText("the model")).toBeInTheDocument();
  });
});

describe("the noticing gate", () => {
  it("will not open on an empty answer and opens on a real one", async () => {
    const user = userEvent.setup();
    let passed = false;
    const { rerender } = mount(
      <NoticeGate
        answers={teaching.model_answers ?? []}
        answer=""
        onAnswerChange={() => undefined}
        onPass={() => {
          passed = true;
        }}
      />,
    );
    const button = screen.getByRole("button", { name: /show the annotated models/i });
    expect(button).toBeDisabled();

    rerender(
      <MemoryRouter>
        <NoticeGate
          answers={teaching.model_answers ?? []}
          answer="it groups two categories in one sentence"
          onAnswerChange={() => undefined}
          onPass={() => {
            passed = true;
          }}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /show the annotated models/i }));
    expect(passed).toBe(true);
  });
});

describe("the band ladder", () => {
  it("opens one rung above the learner's own criterion-1 band", () => {
    mount(
      <ModelAnswerViewer
        teaching={teaching}
        promptId={prompt.id}
        promptTitle="Food budgets"
        taskType="ac_task1"
        ownBand={6}
      />,
    );
    // Band 6 → opens on 7, and the band-7 model's own label is showing.
    expect(screen.getByText("The target")).toBeInTheDocument();
  });

  it("shows what caps the band-6 answer rather than what lifts it", async () => {
    const user = userEvent.setup();
    mount(
      <ModelAnswerViewer
        teaching={teaching}
        promptId={prompt.id}
        promptTitle="Food budgets"
        taskType="ac_task1"
        ownBand={6}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Band 6" }));
    expect(screen.getByText("What holds it below band 7")).toBeInTheDocument();
    expect(screen.getByText("The overview is a data sentence.")).toBeInTheDocument();
  });
});

describe("the sentence ladder", () => {
  it("labels what changes between each rung", () => {
    mount(<SentenceLadder ladder={teaching.sentence_ladder ?? {}} />);
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText(/Density of relevant detail/)).toBeInTheDocument();
  });
});

describe("the language bank", () => {
  it("renders every frame with a real gap and every canned line beside it", async () => {
    const user = userEvent.setup();
    mount(
      <LanguageBankPanel
        teaching={teaching}
        taskType="ac_task1"
        promptId={prompt.id}
        promptTitle="Food budgets"
      />,
    );
    expect(screen.getByText(/These are frames with gaps/)).toBeInTheDocument();
    // The first move is open by default, so its gap is on the page as an input.
    expect(screen.getAllByLabelText(/Fill the gap/).length).toBeGreaterThan(0);
    expect(screen.getByText("Sounds canned")).toBeInTheDocument();
    expect(screen.getByText("account for a third of the total")).toBeInTheDocument();
    await user.tab();
  });
});

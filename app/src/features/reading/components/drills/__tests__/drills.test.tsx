import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JudgementItem, type JudgementAnswer } from "../JudgementItem";
import { ParaphraseItem, type ParaphraseAnswer } from "../ParaphraseItem";
import { SelfDiagnose } from "../SelfDiagnose";
import { SolutionCard } from "../SolutionCard";
import { TWO_STAGE_VERDICT, headlineFor, verdictTone } from "../labels";
import type { DrillItem, ItemResult, Reveal, TrapInfo } from "../types";

// --------------------------------------------------------------------------- fixtures ---

const TRAP: TrapInfo = {
  slug: "absence_read_as_contradiction",
  family: "judgement",
  name: "Phantom contradiction",
  what: "The key is NOT GIVEN and you wrote FALSE.",
};

const JUDGEMENT_ITEM: DrillItem = {
  item_id: "rdr_trap_3_aaaa1111",
  kind: "trap",
  index: 1,
  question_id: "rq_1",
  passage_id: "rp_t1",
  passage_title: "The Verdon tramway",
  number: 3,
  qtype: "true_false_not_given",
  prompt: "Ashfield's line cost less to maintain than the Verdon tramway.",
  seconds: 75,
  choices: ["TRUE", "FALSE", "NOT GIVEN"],
  self_diagnosis_options: [TRAP],
  two_stage: {
    one: {
      question: "Does the passage settle this statement at all?",
      options: ["GIVEN", "NOT GIVEN"],
      hint: "Answer this and nothing else first.",
    },
    two: { question: "Which way does it settle it?", options: ["TRUE", "FALSE"], when: "GIVEN" },
    not_given_label: "NOT GIVEN",
  },
};

const PARAPHRASE_ITEM: DrillItem = {
  item_id: "rdr_paraphrase_2_bbbb2222",
  kind: "paraphrase",
  index: 1,
  question_id: "rq_2",
  passage_id: "rp_t1",
  passage_title: "The Verdon tramway",
  number: 2,
  qtype: "true_false_not_given",
  prompt: "Which extract says the same thing as the phrase from the question?",
  stem_phrase: "raised money on more than one occasion",
  source_prompt: "The company raised money on more than one occasion.",
  seconds: 45,
  options: [
    { key: "A", text: "used steel sleepers throughout" },
    { key: "B", text: "borrowed twice to pay for the work" },
    { key: "C", text: "passengers were an afterthought" },
    { key: "D", text: "nothing is known about what it spent" },
  ],
  device_step: {
    question: "Did that rewording change the meaning, or keep it?",
    options: ["preserving", "changing"],
    why: "A rewording that changes scope or certainty is what makes a statement FALSE.",
  },
};

const FULL_REVEAL: Reveal = {
  correct: false,
  key: "NOT GIVEN",
  accepted: ["NOT GIVEN"],
  location: {
    passage_id: "rp_t1",
    passage_title: "The Verdon tramway",
    anchor_paragraphs: ["C"],
    evidence_quote: null,
    paragraphs: [],
    nearest_text: "Ashfield's own line, opened in the same decade, used steel sleepers",
  },
  paraphrase_link: {
    stem_phrase: "cost less to maintain",
    text_phrase: "used steel sleepers throughout",
    devices: ["compression"],
    note: "Steel lasting longer is a fact you supply, not one stated.",
  },
  decision_rule:
    "Costs are given for one line and explicitly unavailable for the other, so no sentence supports or denies the ranking.",
  explanation: "Paragraph C says Ashfield's accounts are lost.",
  distractors: [
    {
      key: "TRUE",
      why_tempting: "Steel outlasts timber, so the ranking follows from what you already know.",
      why_wrong: "That step is the reader's, not the text's.",
      diagnosis: "unstated",
    },
    {
      key: "FALSE",
      why_tempting: "Only Verdon's borrowing is described, which reads like a denial.",
      why_wrong: "Silence about Ashfield is not a denial.",
      diagnosis: "no_contradiction",
    },
  ],
  reusable_rule: "Two facts placed side by side do not make the comparison between them.",
  traps: [TRAP],
  gear: "close",
  contrast: {
    type: "true_false_not_given",
    key: "NOT GIVEN",
    verdicts: [
      { verdict: "TRUE", role: "distractor", why_tempting: null, why_wrong: "The step is yours.", diagnosis: "unstated" },
      { verdict: "FALSE", role: "distractor", why_tempting: null, why_wrong: "Silence is not a denial.", diagnosis: "no_contradiction" },
      { verdict: "NOT GIVEN", role: "key", why_tempting: null, why_wrong: null, diagnosis: null },
    ],
    boundary: {
      key: "NOT GIVEN",
      rival: "FALSE",
      line: "FALSE would need a sentence that says the opposite. There isn't one.",
      authored: "Silence about Ashfield is not a denial.",
      tempting: "Only Verdon's borrowing is described.",
    },
    decision_rule: "No sentence supports or denies the ranking.",
    nearest_text: null,
    complete: true,
  },
};

/** What a pre-payload (`schema_version: 1`) row actually returns. */
const BARE_REVEAL: Reveal = {
  correct: true,
  key: "1954",
  accepted: ["1954"],
  location: {
    passage_id: "rp_t2",
    passage_title: "Sandmouth harbour",
    anchor_paragraphs: ["A"],
    evidence_quote: "Dredging began in 1954",
    paragraphs: [],
    nearest_text: null,
  },
  paraphrase_link: null,
  decision_rule: null,
  explanation: "Stated verbatim in paragraph A.",
  distractors: [],
  reusable_rule: null,
  traps: [],
};

function result(overrides: Partial<ItemResult> = {}): ItemResult {
  return {
    item_id: "rdr_trap_3_aaaa1111",
    question_id: "rq_1",
    passage_id: "rp_t1",
    number: 3,
    qtype: "true_false_not_given",
    correct: false,
    marking: { correct: false, answered: true, given: "FALSE", form_trap: null },
    traps: ["absence_read_as_contradiction"],
    self_diagnosis: {
      picked: null,
      picked_label: null,
      authored: ["absence_read_as_contradiction"],
      agreed: false,
      authored_labels: ["Phantom contradiction"],
      comparable: false,
    },
    two_stage: null,
    time_ms: 4000,
    reveal: FULL_REVEAL,
    ...overrides,
  };
}

// ------------------------------------------------------------------- the two-stage rule ---

describe("the two-stage TFNG scaffold", () => {
  it("keeps 'never found it' and 'read it backwards' as different lessons", () => {
    // These are the two outcomes a score sheet cannot tell apart and that want opposite
    // remedies: one is a searching failure, one is a close-reading failure.
    const missed = TWO_STAGE_VERDICT.did_not_locate;
    const backwards = TWO_STAGE_VERDICT.located_wrong_direction;

    expect(missed.title).not.toBe(backwards.title);
    expect(missed.note).toMatch(/searching failure/i);
    expect(backwards.note).toMatch(/close-reading fix/i);
  });

  function TwoStageHarness() {
    const [value, setValue] = useState<JudgementAnswer>({ given: "", stageOne: "" });
    return <JudgementItem item={JUDGEMENT_ITEM} value={value} onChange={setValue} />;
  }

  it("only opens step two once the learner says the passage settles it", async () => {
    const user = userEvent.setup();
    render(<TwoStageHarness />);

    expect(screen.queryByText("Which way does it settle it?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "GIVEN" }));
    expect(screen.getByText("Which way does it settle it?")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "TRUE" })).toBeInTheDocument();
  });

  it("clears a stale direction when the learner backs out to NOT GIVEN", async () => {
    const user = userEvent.setup();
    render(<TwoStageHarness />);

    await user.click(screen.getByRole("radio", { name: "GIVEN" }));
    await user.click(screen.getByRole("radio", { name: "TRUE" }));
    expect(screen.getByRole("radio", { name: "TRUE" })).toHaveAttribute("aria-checked", "true");

    // Changing your mind about stage one must not submit a TRUE alongside a NOT GIVEN.
    await user.click(screen.getByRole("radio", { name: "NOT GIVEN" }));
    expect(screen.queryByRole("radio", { name: "TRUE" })).not.toBeInTheDocument();
  });

  it("offers step two on every item, so its absence cannot leak the key", async () => {
    const user = userEvent.setup();
    render(<TwoStageHarness />);
    // The fixture's real answer is NOT GIVEN, and the control still offers step two —
    // hiding it here would announce which items those are.
    await user.click(screen.getByRole("radio", { name: "GIVEN" }));
    expect(screen.getByRole("radio", { name: "FALSE" })).toBeInTheDocument();
  });
});

// --------------------------------------------------------------------- the solution card ---

describe("the solution card", () => {
  it("leads a judgement item with the boundary against the rival verdict", () => {
    render(<SolutionCard reveal={FULL_REVEAL} given="FALSE" />);
    expect(screen.getByText("NOT GIVEN, not FALSE")).toBeInTheDocument();
    expect(
      screen.getByText(/FALSE would need a sentence that says the opposite/),
    ).toBeInTheDocument();
  });

  it("pins the option the learner actually chose to the top of the autopsy", () => {
    render(<SolutionCard reveal={FULL_REVEAL} given="FALSE" />);
    // FALSE is second in the authored order; choosing it must bring it first, because it
    // is the only row the learner will certainly read.
    const autopsy = screen.getByText("Why the others pull").closest("section")!;
    const rows = within(autopsy).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("You chose this");
    expect(rows[0]).toHaveTextContent("Silence about Ashfield is not a denial.");
    expect(rows[1]).toHaveTextContent("TRUE");
  });

  it("shows the tempting sentence where there is no evidence span to point at", () => {
    render(<SolutionCard reveal={FULL_REVEAL} given="FALSE" />);
    expect(screen.getByText("The sentence that tempts you")).toBeInTheDocument();
    expect(screen.getByText(FULL_REVEAL.location!.nearest_text!)).toBeInTheDocument();
  });

  it("renders the paraphrase link as a labelled pair", () => {
    render(<SolutionCard reveal={FULL_REVEAL} given="FALSE" />);
    expect(screen.getByText("Paraphrase link")).toBeInTheDocument();
    expect(screen.getByText("cost less to maintain")).toBeInTheDocument();
    expect(screen.getByText("compression")).toBeInTheDocument();
  });

  it("renders a pre-payload row without pretending it has fields it does not", () => {
    render(<SolutionCard reveal={BARE_REVEAL} given="1954" />);
    expect(screen.getByText("Decision rule")).toBeInTheDocument();
    expect(screen.getByText("Stated verbatim in paragraph A.")).toBeInTheDocument();
    expect(screen.queryByText("Paraphrase link")).not.toBeInTheDocument();
    expect(screen.queryByText("Why the others pull")).not.toBeInTheDocument();
    expect(screen.queryByText("Rule to reuse")).not.toBeInTheDocument();
  });

  it("names the two-stage diagnosis when the item was run in stages", () => {
    render(
      <SolutionCard
        reveal={FULL_REVEAL}
        given="FALSE"
        twoStage={{
          available: true,
          stage_one: { given: "GIVEN", key: "NOT GIVEN", correct: false },
          stage_two: null,
          diagnosis: "read_something_that_was_not_there",
        }}
      />,
    );
    expect(screen.getByText("Found something that is not there")).toBeInTheDocument();
  });

  it("tones the key green and the chosen wrong verdict red", () => {
    const rows = FULL_REVEAL.contrast!.verdicts;
    expect(verdictTone(rows[2], "FALSE")).toBe("success");
    expect(verdictTone(rows[1], "FALSE")).toBe("destructive");
    expect(verdictTone(rows[0], "FALSE")).toBe("outline");
  });
});

// ------------------------------------------------------------------- self-diagnosis (F2) ---

describe("self-diagnosis", () => {
  function Harness() {
    const [value, setValue] = useState<string | null>(null);
    return <SelfDiagnose options={[TRAP]} value={value} onChange={setValue} />;
  }

  it("always offers 'I'm not sure', because a forced guess is worse data than none", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /not sure/i })).toBeInTheDocument();
  });

  it("toggles a trap on and off", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Phantom contradiction" });

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });
});

// ------------------------------------------------------------------------ paraphrase gym ---

describe("the paraphrase gym", () => {
  function Harness() {
    const [value, setValue] = useState<ParaphraseAnswer>({ given: "", device: "" });
    return <ParaphraseItem item={PARAPHRASE_ITEM} value={value} onChange={setValue} />;
  }

  it("asks the meaning question only after an extract is chosen", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByText(/change the meaning/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /borrowed twice/ }));
    expect(screen.getByText(/change the meaning/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "changing" })).toBeInTheDocument();
  });

  it("shows four extracts and never says which is real", () => {
    render(<Harness />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(JSON.stringify(PARAPHRASE_ITEM)).not.toContain("answer_key");
  });
});

// ------------------------------------------------------------------------- the report line ---

describe("the report headline", () => {
  const base = { n_items: 6, n_correct: 2, per_trap: [], results: [] };

  it("calls out pacing when most losses were blanks, not comprehension", () => {
    const blank = result({
      correct: false,
      marking: { correct: false, answered: false, given: "", form_trap: "ran_out_of_time" },
    });
    const line = headlineFor({ ...base, results: [blank, blank, blank] });
    expect(line).toMatch(/pacing, not reading/);
  });

  it("names the single trap behind the losses when there is one", () => {
    const line = headlineFor({
      ...base,
      per_trap: [{ name: "Phantom contradiction", lost: 3 }],
      results: [result(), result(), result()],
    });
    expect(line).toMatch(/phantom contradiction/);
    expect(line).toMatch(/Drill that one next/);
  });

  it("does not congratulate a clean set into stopping", () => {
    const line = headlineFor({ ...base, n_correct: 6, results: [] });
    expect(line).toMatch(/bounded search off|harder trap/);
  });
});

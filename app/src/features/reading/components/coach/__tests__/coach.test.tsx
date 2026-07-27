/**
 * The coach's two load-bearing behaviours: the gate, and the solution card.
 *
 * The gate is the one that matters. In a receptive skill the answer span *is* the
 * answer, so a worked solution shown before the attempt does not teach the passage,
 * it spends it. That is enforced twice — the keyed document is not fetched while the
 * gate is shut, and the card itself makes a wrong answer diagnose itself first.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { attemptRecordFor, readLedger, recordSubmission } from "../attempted";
import { trapsForType, TRAPS, DEVICES, ANSWER_ORDER, TYPE_PAGES } from "../labels";
import { SolutionsPanel } from "../SolutionsPanel";
import { hasKey, solutionRows, type CoachPassage } from "../types";
import { useCoachStore } from "../store";

const here = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------ fixtures ---

const PASSAGE: CoachPassage = {
  id: "rp_x",
  passage_id: "rp_x",
  title: "Peat",
  texts: [
    {
      id: "t1",
      paragraphs: [
        { id: "A", text: "Underneath the surface lies one of the largest stores of carbon." },
        { id: "B", text: "Water stops the decay that would otherwise release it." },
      ],
    },
  ],
  question_groups: [
    {
      id: "g1",
      type: "true_false_not_given",
      teaching: {
        schema_version: 1,
        answer_order: "sequential",
        strategy: "Work down the passage; each answer sits below the last.",
        order_note: "Q2 is below Q1.",
        time_budget_s: 140,
        watch_out: "Two of these are silent rather than contradicted.",
      },
      questions: [
        {
          number: 1,
          prompt: "Drained peat releases carbon.",
          answers: [{ value: "TRUE" }],
          anchor_paragraphs: ["B"],
          evidence_quote: "Water stops the decay that would otherwise release it.",
          explanation: "The passage states the mechanism directly.",
          teaching: {
            schema_version: 1,
            paraphrase_link: {
              stem_phrase: "releases carbon",
              text_phrase: "release it",
              devices: ["synonym"],
              note: "the pronoun carries the carbon",
            },
            decision_rule: "The text states the release, so the statement is supported in full.",
            distractors: [
              {
                key: "NOT GIVEN",
                why_tempting: "The word drained never appears in this sentence.",
                why_wrong: "The mechanism is stated, so silence is not the issue.",
                diagnosis: "support_present",
              },
            ],
            reusable_rule: "A stated mechanism supports a statement about its effect.",
            traps: ["paraphrase_missed"],
            gear: "close",
          },
        },
      ],
    },
  ],
};

const ROWS = solutionRows(PASSAGE);

beforeEach(() => {
  window.localStorage.clear();
  useCoachStore.setState({ diagnosis: {}, mapDrafts: {}, mapRevealed: {} });
});

// -------------------------------------------------------------------- ledger ---

describe("the attempt ledger", () => {
  it("records one row per passage, with the wrong numbers and what was written", () => {
    recordSubmission({
      attemptId: "rd_1",
      examConditions: true,
      perQuestion: [
        { number: 1, passage_id: "rp_a", correct: true, given: "TRUE" },
        { number: 2, passage_id: "rp_a", correct: false, given: "FALSE" },
        { number: 14, passage_id: "rp_b", correct: true, given: "iv" },
      ],
    });
    const a = attemptRecordFor("rp_a");
    expect(a?.correct).toBe(1);
    expect(a?.total).toBe(2);
    expect(a?.wrong).toEqual([2]);
    expect(a?.given["2"]).toBe("FALSE");
    expect(attemptRecordFor("rp_b")?.wrong).toEqual([]);
    expect(attemptRecordFor("rp_never")).toBeNull();
  });

  it("counts repeat sittings rather than overwriting the history silently", () => {
    const perQuestion = [{ number: 1, passage_id: "rp_a", correct: false, given: "" }];
    recordSubmission({ attemptId: "rd_1", examConditions: false, perQuestion });
    recordSubmission({
      attemptId: "rd_2",
      examConditions: false,
      perQuestion: [{ number: 1, passage_id: "rp_a", correct: true, given: "TRUE" }],
    });
    const record = attemptRecordFor("rp_a");
    expect(record?.attempts).toBe(2);
    expect(record?.wrong).toEqual([]);
    expect(record?.attemptId).toBe("rd_2");
  });

  it("survives a corrupt or absent store rather than throwing into a render", () => {
    window.localStorage.setItem("bandready.reading.attempted.v1", "{ not json");
    expect(readLedger()).toEqual({});
  });
});

// ---------------------------------------------------------------- gate policy ---

describe("the gate", () => {
  const source = readFileSync(join(here, "..", "store.ts"), "utf8");

  it("only requests the keyed document once the learner has sat the passage", () => {
    // `mode=review` is the endpoint that carries the answers and the solutions.
    const review = source.match(/mode=review/g) ?? [];
    expect(review).toHaveLength(1);
    // …and the single call site is inside the `unlocked` branch.
    const branch = source.slice(source.indexOf("if (unlocked)"), source.indexOf("if (!doc)"));
    expect(branch).toMatch(/mode=review/);
  });

  it("falls back to the open document when the sidecar refuses the keyed one", () => {
    expect(source).toMatch(/err\.status === 403 \|\| err\.status === 409/);
    expect(source).toMatch(/mode=exam/);
  });

  it("drops the per-question key from a locked document before storing it", () => {
    // Belt and braces: a service that has not yet learned to strip `teaching` from
    // an exam-mode document must still not be able to leak it into a locked screen.
    expect(source).toMatch(/function withoutTheKey/);
    for (const field of ["answers", "explanation", "evidence_quote", "trap_note", "teaching"]) {
      expect(source).toMatch(new RegExp(`${field}: _`));
    }
    expect(source).toMatch(/unlocked && serverLocked === null \? open : withoutTheKey\(open\)/);
  });

  it("knows a document without a key when it sees one", () => {
    expect(hasKey(PASSAGE)).toBe(true);
    const stripped: CoachPassage = {
      ...PASSAGE,
      question_groups: [
        {
          ...PASSAGE.question_groups![0],
          questions: [{ number: 1, prompt: "Drained peat releases carbon." }],
        },
      ],
    };
    expect(hasKey(stripped)).toBe(false);
  });
});

// -------------------------------------------------------------- solution card ---

describe("the solution card", () => {
  it("makes a wrong answer diagnose itself before it reveals anything", async () => {
    const user = userEvent.setup();
    render(
      <SolutionsPanel
        passageId="rp_x"
        rows={ROWS}
        record={{
          passageId: "rp_x",
          attemptId: "rd_1",
          submittedAt: Date.now(),
          correct: 0,
          total: 1,
          wrong: [1],
          given: { "1": "NOT GIVEN" },
          attempts: 1,
          examConditions: false,
        }}
        onLocate={() => undefined}
      />,
    );

    // The evidence and the rule are absent until the self-check is answered.
    expect(screen.queryByText(/A stated mechanism supports/)).not.toBeInTheDocument();
    expect(screen.getByText(/Did you know where the answer was/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show the worked solution" }));
    expect(screen.getByText(/A stated mechanism supports/)).toBeInTheDocument();
    // Location, paraphrase link, decision rule and the autopsy, in that order.
    expect(screen.getByText(/Water stops the decay/)).toBeInTheDocument();
    expect(screen.getByText("releases carbon")).toBeInTheDocument();
    expect(screen.getByText(/silence is not the issue/)).toBeInTheDocument();
    // The option the learner actually chose is called out.
    expect(screen.getByText("What you chose")).toBeInTheDocument();
  });

  it("opens straight away on a question that was answered correctly", () => {
    render(
      <SolutionsPanel
        passageId="rp_x"
        rows={ROWS}
        record={{
          passageId: "rp_x",
          attemptId: "rd_1",
          submittedAt: Date.now(),
          correct: 1,
          total: 1,
          wrong: [],
          given: {},
          attempts: 1,
          examConditions: false,
        }}
        onLocate={() => undefined}
      />,
    );
    expect(screen.queryByText(/Did you know where the answer was/)).not.toBeInTheDocument();
    expect(screen.getByText(/A stated mechanism supports/)).toBeInTheDocument();
  });

  it("hands the answer span back to the passage pane when the quote is clicked", async () => {
    const user = userEvent.setup();
    const calls: Array<[string, string | null | undefined]> = [];
    render(
      <SolutionsPanel
        passageId="rp_x"
        rows={ROWS}
        record={null}
        onLocate={(paragraph, quote) => calls.push([paragraph, quote])}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Show it in the passage/ }));
    expect(calls[0][0]).toBe("B");
    expect(calls[0][1]).toMatch(/Water stops the decay/);
  });
});

// ------------------------------------------------------------------ vocabulary ---

describe("the closed vocabularies", () => {
  it("carries every slug in the pack's trap taxonomy, in its four families", () => {
    // The content spec's heading says twenty-six; its four tables list twenty-seven
    // rows (8 judgement + 7 proposition + 7 locating + 5 form). The tables are the
    // authority — content is authored against the slugs, not against the heading.
    const families = Object.values(TRAPS).reduce<Record<string, number>>((acc, info) => {
      acc[info.family] = (acc[info.family] ?? 0) + 1;
      return acc;
    }, {});
    expect(families).toEqual({ judgement: 8, proposition: 7, locating: 7, form: 5 });
    // The two inverse judgement errors are the highest-loss pair in the paper.
    expect(TRAPS.absence_read_as_contradiction.family).toBe("judgement");
    expect(TRAPS.contradiction_read_as_absence.family).toBe("judgement");
  });

  it("carries the 14 rewording devices, exactly two of which change meaning", () => {
    expect(Object.keys(DEVICES)).toHaveLength(14);
    const changing = Object.entries(DEVICES).filter(([, info]) => info.changes).map(([slug]) => slug);
    expect(changing.sort()).toEqual(["modality_change", "scope_change"]);
  });

  it("offers a short, type-appropriate trap list rather than all twenty-six", () => {
    const tfng = trapsForType("true_false_not_given");
    expect(tfng.length).toBeLessThanOrEqual(7);
    expect(tfng).toContain("absence_read_as_contradiction");
    expect(trapsForType("matching_headings")).toContain("heading_cascade");
    expect(trapsForType("sentence_completion")).toContain("over_limit");
  });

  it("agrees with the published order behaviour of every type it has a page for", () => {
    expect(TYPE_PAGES.matching_headings.order).toBe("scattered");
    expect(TYPE_PAGES.matching_sentence_endings.order).toBe("sequential");
    expect(TYPE_PAGES.summary_completion.order).toBe("section_local");
    expect(ANSWER_ORDER.section_local.badge).toMatch(/one section/i);
  });
});

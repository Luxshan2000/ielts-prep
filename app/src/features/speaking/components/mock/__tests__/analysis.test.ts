import { describe, expect, it } from "vitest";
import {
  analyseSitting,
  deliverySignal,
  evidenceSignal,
  nextActions,
  partOfTurn,
  separable,
} from "../analysis";
import type { SpeakingReport, TranscriptTurn } from "../../../store";

function report(overrides: Partial<SpeakingReport> = {}): SpeakingReport {
  return {
    report_id: "sr_01",
    session_id: "ss_01",
    created_at: "2026-07-25T10:00:00Z",
    model_id: "qwen3-30b-a3b",
    prompt_version: "speaking-eval-v1",
    overall_band: 6.5,
    criteria: {
      fc: { band: 7, evidence: [], improvements: [] },
      lr: { band: 6, evidence: [], improvements: ["Swap vague quantifiers for collocations."] },
      gra: { band: 7, evidence: [], improvements: [] },
      pron: { band: 6, evidence: [], improvements: [] },
    },
    best_moments: [],
    errors: [],
    vocab_to_bank: [],
    unanchored: [],
    pronunciation_blind: false,
    metrics: {},
    mode: "mock",
    activity: "full_mock",
    card_set_id: "cs_travel",
    duration_s: 760,
    honesty_note: "AI-estimated band.",
    ...overrides,
  };
}

function turn(text: string, extra: Partial<TranscriptTurn> = {}): TranscriptTurn {
  return { role: "user", text, t_ms: 0, ...extra };
}

describe("partOfTurn", () => {
  it("trusts the turn's own part first", () => {
    expect(partOfTurn(turn("hi", { part: 3 }), new Map())).toBe(3);
  });

  it("falls back to the phase the turn was recorded in", () => {
    const withPhase = { ...turn("hi"), phase: "P2_LONG_TURN" };
    expect(partOfTurn(withPhase, new Map())).toBe(2);
  });

  it("falls back to the part of the card being answered", () => {
    expect(partOfTurn(turn("hi", { card_id: "c9" }), new Map([["c9", 3]]))).toBe(3);
  });

  it("returns null rather than guessing", () => {
    expect(partOfTurn(turn("hi"), new Map())).toBeNull();
  });
});

describe("signals", () => {
  it("has no evidence signal without evidence", () => {
    expect(evidenceSignal(0, 0)).toBeNull();
  });

  it("normalises praise against corrections", () => {
    expect(evidenceSignal(3, 1)).toBeCloseTo(0.5);
    expect(evidenceSignal(1, 3)).toBeCloseTo(-0.5);
  });

  it("has no delivery signal without metrics", () => {
    expect(deliverySignal(null)).toBeNull();
    expect(deliverySignal({})).toBeNull();
  });

  it("reads clean delivery as positive and halting delivery as negative", () => {
    const clean = deliverySignal({
      fillers_per_min: 0.5,
      mean_length_of_run_words: 12,
      pause_ratio: 0.15,
    });
    const halting = deliverySignal({
      fillers_per_min: 9,
      mean_length_of_run_words: 4,
      pause_ratio: 0.5,
    });
    expect(clean).not.toBeNull();
    expect(halting).not.toBeNull();
    expect(clean as number).toBeGreaterThan(0.5);
    expect(halting as number).toBeLessThan(-0.5);
  });

  it("ignores speaking rate, which is not comparable across parts", () => {
    expect(deliverySignal({ wpm: 200 })).toBeNull();
  });
});

describe("analyseSitting", () => {
  const turns: TranscriptTurn[] = [
    turn("I live in a small city and there were very much cars", { part: 1 }),
    turn("My daily commute takes an hour on a good day", { part: 2 }),
    turn("I think the government should of invested earlier", { part: 3 }),
  ];

  it("places each quote in the part it was said in", () => {
    const analysis = analyseSitting(
      report({
        best_moments: ["my daily commute takes an hour"],
        errors: [
          { quote: "very much cars", issue: "quantifier", better: "heavy traffic" },
          { quote: "should of invested", issue: "modal + have", better: "should have invested" },
        ],
      }),
      turns,
    );

    const [p1, p2, p3] = analysis.parts;
    expect(analysis.attributed).toBe(true);
    expect(p1.issues.map((q) => q.text)).toEqual(["very much cars"]);
    expect(p2.strengths.map((q) => q.text)).toEqual(["my daily commute takes an hour"]);
    expect(p3.issues.map((q) => q.text)).toEqual(["should of invested"]);
    expect(analysis.unplaced).toHaveLength(0);
  });

  it("counts words and answers per part", () => {
    const analysis = analyseSitting(report(), turns);
    expect(analysis.parts[0].turns).toBe(1);
    expect(analysis.parts[0].words).toBe(12);
    expect(analysis.parts.every((p) => p.reached)).toBe(true);
  });

  it("keeps a quote it cannot match rather than attributing it to a part", () => {
    const analysis = analyseSitting(
      report({ best_moments: ["a phrase the candidate never actually said"] }),
      turns,
    );
    expect(analysis.unplaced.map((q) => q.text)).toEqual([
      "a phrase the candidate never actually said",
    ]);
    expect(analysis.parts.every((p) => p.strengths.length === 0)).toBe(true);
  });

  it("marks an unreached part as unreached instead of weakest", () => {
    const analysis = analyseSitting(report(), [turns[0]]);
    expect(analysis.parts[0].reached).toBe(true);
    expect(analysis.parts[2].reached).toBe(false);
    expect(analysis.parts[2].signal).toBeNull();
    expect(analysis.weakest).toBeNull();
  });

  it("withholds strongest and weakest when the evidence is too thin", () => {
    const analysis = analyseSitting(
      report({ errors: [{ quote: "very much cars", issue: "quantifier", better: "heavy traffic" }] }),
      turns,
    );
    expect(analysis.strongest).toBeNull();
    expect(analysis.weakest).toBeNull();
  });

  it("ranks the parts once there is enough to rank them on", () => {
    const analysis = analyseSitting(
      report({
        best_moments: ["my daily commute takes an hour"],
        criteria: {
          fc: { band: 7, evidence: ["on a good day"], improvements: [] },
          lr: { band: 6, evidence: [], improvements: [] },
          gra: { band: 7, evidence: [], improvements: [] },
          pron: { band: 6, evidence: [], improvements: [] },
        },
        errors: [
          { quote: "very much cars", issue: "quantifier", better: "heavy traffic" },
          { quote: "should of invested", issue: "modal + have", better: "should have invested" },
        ],
      }),
      turns,
    );
    expect(analysis.strongest?.part).toBe(2);
    expect(analysis.weakest).not.toBeNull();
    expect(analysis.weakest?.part).not.toBe(2);
  });

  it("says so when no turn can be placed at all", () => {
    const analysis = analyseSitting(report(), [turn("something, somewhere")]);
    expect(analysis.attributed).toBe(false);
  });

  it("ignores the examiner's own turns", () => {
    const analysis = analyseSitting(report(), [
      { role: "assistant", text: "Let's talk about where you live.", t_ms: 0, part: 1 },
      turn("I live in a small city", { part: 1 }),
    ]);
    expect(analysis.candidateTurns).toBe(1);
    expect(analysis.parts[0].turns).toBe(1);
  });
});

describe("separable", () => {
  const base = {
    label: "",
    reached: true,
    turns: 2,
    words: 60,
    strengths: [],
    issues: [],
    metrics: null,
  };

  it("needs at least two scored parts", () => {
    expect(
      separable([
        { ...base, part: 1 as const, signal: 0.8 },
        { ...base, part: 2 as const, reached: false, signal: null },
        { ...base, part: 3 as const, reached: false, signal: null },
      ]),
    ).toBe(false);
  });
});

describe("nextActions", () => {
  it("leads with the lowest criterion and its improvement notes", () => {
    const doc = report();
    const actions = nextActions(doc, analyseSitting(doc, []), null, null);
    expect(actions[0].id).toBe("criterion-lr");
    expect(actions[0].title).toContain("band 6");
    expect(actions[0].detail).toContain("collocations");
  });

  it("sends the learner to the coach for the set they just sat", () => {
    const doc = report();
    const actions = nextActions(doc, analyseSitting(doc, []), "cs_travel", "Travel");
    const coach = actions.find((a) => a.id === "coach");
    expect(coach?.to).toBe("/speaking/coach/cs_travel");
    expect(coach?.title).toContain("Travel");
  });

  it("offers no coach link when the sitting had no card set", () => {
    const doc = report({ card_set_id: null });
    const actions = nextActions(doc, analyseSitting(doc, []), null, null);
    expect(actions.some((a) => a.id === "coach")).toBe(false);
  });
});

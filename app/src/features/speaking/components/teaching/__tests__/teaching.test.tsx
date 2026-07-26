import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { layerSpans, placeSpans, segmentText } from "../spans";
import { readPack } from "../types";
import { AttemptGate, ModelAnswerViewer } from "../ModelAnswers";
import { LanguageBankPanel } from "../LanguageBank";
import { TopicVocabulary } from "../TopicVocabulary";
import type { Part2Teaching } from "../types";

// ------------------------------------------------------------------- fixtures ---

const TRANSCRIPT =
  "We've been friends since we were six.\n\nShe grew up next door, which is the whole reason we met. We went to different schools, and we met again later.";

const TEACHING: Part2Teaching = {
  band_move: "Characterise, don't narrate.",
  transfer_drill: "Now do the same about somebody you've known a year. Forty-five seconds.",
  swap_slots: [{ span: "next door", prompt: "Your own place." }],
  model_answers: [
    {
      band_target: 6,
      label: "Where most candidates land",
      approx_seconds: 95,
      transcript: TRANSCRIPT,
      what_caps_it: [{ criterion: "GRA", point: "Tense drifts into the present." }],
      what_lifts_it: [],
      annotations: [
        {
          span: "We went to different schools",
          kind: "avoid",
          criterion: "FC",
          label: "Flat listing",
          why: "Add one line of comment after each fact.",
          transferable: false,
        },
      ],
    },
    {
      band_target: 7,
      label: "The target",
      approx_seconds: 118,
      transcript: TRANSCRIPT,
      what_caps_it: [],
      what_lifts_it: [{ criterion: "LR", point: "Chunks replace flat adjectives." }],
      annotations: [
        {
          span: "We've been friends since we were six",
          kind: "grammar",
          criterion: "GRA",
          label: "Present perfect for a live duration",
          why: "Use it when the situation began in the past and is still true.",
          transferable: true,
        },
      ],
    },
    {
      band_target: 8,
      label: "One further step",
      approx_seconds: 120,
      transcript: TRANSCRIPT,
      what_caps_it: [],
      what_lifts_it: [{ criterion: "FC", point: "Closes by abstracting away from the anecdote." }],
      annotations: [],
    },
  ],
};

// ---------------------------------------------------------------------- spans ---

describe("span placement", () => {
  it("maps two identical spans onto successive occurrences", () => {
    const text = "we met and then we met again";
    const { placed, unresolved } = placeSpans(text, [{ span: "we met" }, { span: "we met" }]);
    expect(unresolved).toHaveLength(0);
    expect(placed.map((p) => p.start)).toEqual([0, 16]);
  });

  it("reports a span that is not in the transcript instead of throwing", () => {
    const { placed, unresolved } = placeSpans("hello there", [{ span: "goodbye" }]);
    expect(placed).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
  });

  it("keeps the earlier of two overlapping spans", () => {
    const { placed, unresolved } = placeSpans("one two three", [
      { span: "one two" },
      { span: "two three" },
    ]);
    expect(placed).toHaveLength(1);
    expect(placed[0].mark.span).toBe("one two");
    expect(unresolved).toHaveLength(1);
  });

  it("rebuilds the original text from its segments", () => {
    const { placed } = placeSpans(TRANSCRIPT, [{ span: "next door" }]);
    expect(
      segmentText(TRANSCRIPT, placed)
        .map((s) => s.text)
        .join(""),
    ).toBe(TRANSCRIPT);
  });

  it("cuts a run where two layers overlap so both marks survive", () => {
    const text = "alpha beta gamma";
    const a = placeSpans(text, [{ span: "alpha beta" }]);
    const b = placeSpans(text, [{ span: "beta gamma" }]);
    const runs = layerSpans(text, a.placed, b.placed);
    expect(runs.map((r) => r.text)).toEqual(["alpha ", "beta", " gamma"]);
    expect(runs[1].aIndex).toBe(0);
    expect(runs[1].bIndex).toBe(0);
  });
});

// -------------------------------------------------------------- normalisation ---

describe("pack normalisation", () => {
  it("reads a schema_version 2 row and its cards", () => {
    const pack = readPack(
      {
        id: "set_oldest_friend_101",
        title: "Friendship over time",
        topic_id: "topic_family",
        payload_json: {
          schema_version: 2,
          tags: ["friendship"],
          teaches: "Characterise a person.",
          vocabulary: [
            {
              item: "drift apart",
              type: "phrasal_verb",
              cefr: "B2",
              meaning: "slowly stop being close",
              example: "We drifted apart after she moved.",
              used_in: "any",
            },
          ],
          language_bank: {
            warning: "These are shapes with holes in them.",
            functions: [
              {
                function: "evaluating",
                why_here: "Bullet four asks why it lasted.",
                grammar: "cleft sentences",
                frames: [{ frame: "What I value about him is ___", slot_hint: "one quality" }],
                avoid: "He is a very kind person and I like him very much.",
              },
            ],
          },
        },
      },
      [
        {
          id: "card_p2_oldest_friend_101",
          part: 2,
          title: "Describe a friend you have known longest.",
          difficulty: "core",
          payload_json: {
            id: "card_p2_oldest_friend_101",
            part: 2,
            cue_card: {
              topic: "Describe a friend you have known longest.",
              bullets: ["who this person is", "how you met", "what you do now", "and explain why"],
              rounding_off: ["Do you live near each other?"],
            },
            teaching: TEACHING,
          },
        },
      ],
    );

    expect(pack).not.toBeNull();
    expect(pack?.hasTeaching).toBe(true);
    expect(pack?.part2?.cue_card?.bullets).toHaveLength(4);
    expect(pack?.part2?.part2Teaching?.model_answers).toHaveLength(3);
    expect(pack?.set.language_bank?.functions[0].function).toBe("evaluating");
  });

  it("marks a legacy set as carrying no teaching payload", () => {
    const pack = readPack(
      { id: "set_legacy_001", title: "A place near your home", payload_json: { schema_version: 1 } },
      [{ id: "card_p2_legacy_001", part: 2, payload_json: { cue_card: { topic: "x", bullets: [] } } }],
    );
    expect(pack?.hasTeaching).toBe(false);
  });

  it("drops a malformed model answer rather than rendering half of one", () => {
    const pack = readPack({ id: "s1", payload_json: {} }, [
      { id: "c1", part: 2, payload_json: { teaching: { model_answers: [{ label: "no band" }] } } },
    ]);
    expect(pack?.part2?.part2Teaching?.model_answers).toEqual([]);
  });
});

// -------------------------------------------------------------------- screens ---

describe("model answers", () => {
  it("opens on band 7 and swaps only the transcript when the band changes", async () => {
    render(<ModelAnswerViewer teaching={TEACHING} cardTitle="a friend" />);
    expect(screen.getByRole("tab", { name: "Band 7" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("The target")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Band 6" }));
    expect(screen.getByText("Where most candidates land")).toBeInTheDocument();
    expect(screen.getByText("What holds it at band 6")).toBeInTheDocument();
  });

  it("shows an annotation's reasoning when its span is activated", async () => {
    render(<ModelAnswerViewer teaching={TEACHING} cardTitle="a friend" />);
    // The same phrase is reachable twice — inline in the transcript and as a chip in
    // the rail. The inline one comes first in the DOM.
    const [span] = screen.getAllByRole("button", {
      name: /We've been friends since we were six/,
    });
    await userEvent.click(span);
    expect(
      screen.getAllByText("Use it when the situation began in the past and is still true.").length,
    ).toBeGreaterThan(0);
  });

  it("offers only transferable annotations in the Steal this rail", () => {
    render(<ModelAnswerViewer teaching={TEACHING} cardTitle="a friend" />);
    expect(screen.getByText("Steal this")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Add to bank/ }).length).toBe(1);
  });

  it("says so instead of rendering an empty ladder", () => {
    render(<ModelAnswerViewer teaching={{}} cardTitle="a friend" />);
    expect(screen.getByText("No model answers on this card")).toBeInTheDocument();
  });
});

describe("attempt gate", () => {
  it("hides the model until the card has been attempted", () => {
    render(
      <AttemptGate locked reason="Speak it first.">
        <p>the model</p>
      </AttemptGate>,
    );
    expect(screen.queryByText("the model")).not.toBeInTheDocument();
    expect(screen.getByText("Speak it first.")).toBeInTheDocument();
  });

  it("passes its children straight through once unlocked", () => {
    render(
      <AttemptGate locked={false} reason="Speak it first.">
        <p>the model</p>
      </AttemptGate>,
    );
    expect(screen.getByText("the model")).toBeInTheDocument();
  });
});

describe("language bank", () => {
  const BANK = {
    warning: "Every line here is a shape with a hole in it.",
    functions: [
      {
        function: "evaluating",
        why_here: "Bullet four asks why it lasted.",
        grammar: "cleft sentences",
        frames: [{ frame: "What I value about him is ___", slot_hint: "one quality" }],
        avoid: "He is a very kind person and I like him very much.",
      },
    ],
  };

  it("keeps the warning visible and shows the canned version beside the frame", () => {
    render(<LanguageBankPanel bank={BANK} setTitle="Friendship" />);
    expect(screen.getByText("Every line here is a shape with a hole in it.")).toBeInTheDocument();
    expect(screen.getByText("Sounds canned")).toBeInTheDocument();
    expect(
      screen.getByText("He is a very kind person and I like him very much."),
    ).toBeInTheDocument();
  });

  it("renders the gap as something the learner can type into", async () => {
    render(<LanguageBankPanel bank={BANK} setTitle="Friendship" />);
    const slot = screen.getByLabelText("Fill the gap: one quality");
    await userEvent.type(slot, "how straight he is with me");
    expect(slot).toHaveValue("how straight he is with me");
    expect(screen.getByRole("button", { name: /Bank your version/ })).toBeInTheDocument();
  });
});

describe("topic vocabulary", () => {
  const ITEMS = [
    {
      item: "drift apart",
      type: "phrasal_verb",
      cefr: "B2",
      meaning: "slowly stop being close",
      example: "We drifted apart after she moved.",
      used_in: "any",
    },
    {
      item: "considerate",
      type: "word",
      cefr: "C1",
      meaning: "thinks about how others feel",
      example: "She's the most considerate person I know.",
      used_in: "part2",
    },
  ];

  it("puts partners before single words and reveals the example on demand", async () => {
    render(<TopicVocabulary items={ITEMS} setTitle="Friendship" />);
    const rows = screen.getAllByRole("button", { expanded: false });
    expect(rows[0]).toHaveTextContent("drift apart");

    expect(screen.queryByText(/We drifted apart after she moved/)).not.toBeInTheDocument();
    await userEvent.click(rows[0]);
    expect(screen.getByText(/We drifted apart after she moved/)).toBeInTheDocument();
  });

  it("explains an empty vocabulary list rather than showing a blank panel", () => {
    render(<TopicVocabulary items={[]} setTitle="Friendship" />);
    expect(screen.getByText("No topic vocabulary yet")).toBeInTheDocument();
  });
});

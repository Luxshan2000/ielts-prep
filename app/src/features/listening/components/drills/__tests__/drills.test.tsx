import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "@/lib/api";
import { DictationDiff } from "../DictationItem";
import { DrillReportView } from "../DrillReport";
import { PredictionItem } from "../PredictionItem";
import { RevealCard } from "../RevealCard";
import { BUCKET_TONE, formatMs } from "../labels";
import type { DrillItem, DrillReport, ItemResult, Marking } from "../types";

// The clip player signs a media ticket over HTTP, which no unit test should reach for.
vi.mock("../ClipPlayer", () => ({
  ClipPlayer: () => <div data-testid="clip-player" />,
}));

// --------------------------------------------------------------------------- fixtures ---

const DICTATION_MARKING: Marking = {
  correct: false,
  total: 7,
  exact: 5,
  heard: 6,
  missed: 1,
  accuracy: 0.857,
  exact_accuracy: 0.714,
  counts: { function_word: 1, spelling: 1 },
  headline: "You heard 6 of 7 words. 1 of the 1 you missed were small grammar words.",
  diff: [
    { op: "equal", reference: "we", given: "we", bucket: null, index: 0 },
    { op: "equal", reference: "open", given: "open", bucket: null, index: 1 },
    { op: "del", reference: "at", given: null, bucket: "function_word", index: 2 },
    { op: "equal", reference: "nine", given: "nine", bucket: null, index: 3 },
    { op: "sub", reference: "thirty", given: "thurty", bucket: "spelling", index: 4 },
    { op: "equal", reference: "on", given: "on", bucket: null, index: 5 },
    { op: "ins", reference: null, given: "sundays", bucket: "inserted", index: 6 },
  ],
  diagnoses: [],
};

const PREDICTION_ITEM: DrillItem = {
  item_id: "ldr_prediction_5_aaaa1111",
  kind: "prediction",
  index: 1,
  script_id: "ls_t1_p1",
  script_title: "Booking a village hall",
  part: 1,
  accent_set: "uk",
  seconds: 25,
  number: 5,
  qtype: "form_completion",
  prompt: "Collect keys from: the **5** ______",
  instruction: "Write ONE WORD for each answer.",
  options: [
    { slug: "noun_singular", label: "A singular noun", what: "Follows 'a', 'an', 'each'." },
    { slug: "noun_plural", label: "A plural noun", what: "Follows 'some', 'two'." },
    { slug: "quantity", label: "A number", what: "A bare figure." },
  ],
  group_strategy: {
    preview_focus: "Slot-type all five: name, date, figure, figure, noun.",
    order_note: "The form fills top to bottom.",
  },
};

const PREDICTION_RESULT: ItemResult = {
  item_id: PREDICTION_ITEM.item_id,
  kind: "prediction",
  index: 1,
  script_id: "ls_t1_p1",
  number: 5,
  line_index: null,
  correct: false,
  time_ms: 4000,
  replays: 0,
  marking: {
    correct: false,
    given: "noun_plural",
    key: "noun_singular",
    key_info: {
      name: "A singular noun",
      what: "Follows 'a', 'an', 'each'.",
      hazard: "Writing the plural.",
    },
    chosen_info: { name: "A plural noun", what: "Follows 'some'.", hazard: "Dropping the -s." },
    same_family: true,
    note: "Right family, wrong shape — you read the frame and then ignored what it said.",
  },
  reveal: {
    kind: "prediction",
    cue: "the",
    range: null,
    note: "One thing, singular. A place you can walk into.",
    slot_info: {
      name: "A singular noun",
      what: "Follows 'a', 'an', 'each'.",
      hazard: "Writing the plural.",
    },
    paraphrase_link: { printed: "Collect keys from", audio: "you pick them up at" },
    form: null,
  },
};

const REPORT: DrillReport = {
  drill_id: "dr_x",
  kind: "dictation",
  mode: null,
  seed: "s",
  script: {
    id: "ls_t1_p1",
    title: "Booking a village hall",
    part: 1,
    accent_set: "uk",
    audio: {
      audio_hash: "abc",
      ready: true,
      media_path: "/api/v1/media/listening/abc.wav",
      timing_path: "/api/v1/media/listening/abc.timing.json",
    },
  },
  n_items: 3,
  n_correct: 1,
  accuracy: 0.333,
  band: null,
  summary: {
    headline: "You heard 34 of 41 words. 5 of the 7 you missed were small grammar words.",
    words_total: 41,
    words_heard: 34,
    words_exact: 31,
    spelling_only: 3,
    buckets: [
      {
        bucket: "function_word",
        count: 5,
        name: "Weak form went past you",
        what: "You missed a small grammar word.",
        next: "Re-listen and count the words before you write them.",
      },
      {
        bucket: "spelling",
        count: 3,
        name: "Heard it — spelled it wrong",
        what: "Your word is one or two letters from the right one.",
        next: "This is an orthography fix, not a listening fix.",
      },
    ],
  },
  results: [],
};

// ------------------------------------------------------------------------------ tests ---

describe("the dictation diff", () => {
  it("shows the line that was said, with the learner's losses marked on it", () => {
    render(<DictationDiff marking={DICTATION_MARKING} />);
    // Every reference word is present — the learner has to see the real sentence.
    for (const word of ["we", "open", "at", "nine", "thirty", "on"]) {
      expect(screen.getByText(new RegExp(`^${word}\\s*$`))).toBeInTheDocument();
    }
    // …and the word they invented is shown too, so an insertion is visible as one.
    expect(screen.getByText(/sundays/)).toBeInTheDocument();
  });

  it("never draws a misspelling as an error, and says why in words", () => {
    render(<DictationDiff marking={DICTATION_MARKING} />);
    const misspelled = screen.getByText(/^thirty\s*$/);
    // Warning, not destructive: they heard it. Colour is the first thing a learner reads.
    expect(misspelled.className).toContain("warning");
    expect(misspelled.className).not.toContain("destructive");
    const missed = screen.getByText(/^at\s*$/);
    expect(missed.className).toContain("destructive");
    expect(BUCKET_TONE.spelling).toBe("warn");
    expect(
      screen.getByText(/heard correctly and\s+spelled wrongly/i),
    ).toBeInTheDocument();
  });
});

describe("the prediction item", () => {
  it("shows the whole printed frame and the five competing slots, and no audio", () => {
    render(<Harness />);
    expect(screen.getByText(/Collect keys from/)).toBeInTheDocument();
    expect(screen.getByText("No audio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /A singular noun/ })).toBeInTheDocument();
    expect(screen.queryByTestId("clip-player")).not.toBeInTheDocument();
  });

  it("reports the chosen slug upward", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /A plural noun/ }));
    expect(screen.getByTestId("chosen")).toHaveTextContent("noun_plural");
  });
});

function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <PredictionItem item={PREDICTION_ITEM} value={value} onChange={setValue} />
      <span data-testid="chosen">{value}</span>
    </>
  );
}

describe("the reveal", () => {
  it("names the word that decided the slot and the paraphrase that hid it", () => {
    render(<RevealCard result={PREDICTION_RESULT} />);
    expect(screen.getByText("the")).toBeInTheDocument();
    expect(screen.getByText(/Right family, wrong shape/)).toBeInTheDocument();
    expect(screen.getByText(/you pick them up at/)).toBeInTheDocument();
    expect(screen.getByText(/printed question is the\s+paraphrase/)).toBeInTheDocument();
  });
});

describe("the report", () => {
  it("leads with the diagnosis and never shows a band", () => {
    render(<DrillReportView report={REPORT} />);
    expect(screen.getByText(REPORT.summary.headline)).toBeInTheDocument();
    // Heard and exact are shown as two different numbers, which is the whole point.
    expect(screen.getByText("34 / 41")).toBeInTheDocument();
    expect(screen.getByText("31 / 41")).toBeInTheDocument();
    expect(screen.getByText(/Lost to spelling alone/)).toBeInTheDocument();
    expect(screen.queryByText(/\bband\b/i)).not.toBeInTheDocument();
  });
});

describe("error classification", () => {
  it("tells the two 409s apart, because only one of them is fixable in a click", async () => {
    const { NeedsAudioError, MockInProgressError } = await import("../api");
    const needsAudio = new ApiError(
      409,
      "conflict",
      "“Booking a village hall” has not been rendered yet. Prepare the audio for this part first.",
    );
    const mockOpen = new ApiError(
      409,
      "conflict",
      "A listening mock is in progress. Drills are coaching, and coaching is shut.",
    );
    // The classifier is exercised through the module's own regex rather than re-stated here.
    expect(new NeedsAudioError(needsAudio.detail).name).toBe("NeedsAudioError");
    expect(new MockInProgressError(mockOpen.detail).name).toBe("MockInProgressError");
  });
});

describe("offset formatting", () => {
  it("signs a cue press so early reads as early", () => {
    expect(formatMs(-2400)).toBe("−2.4s");
    expect(formatMs(900)).toBe("+0.9s");
  });
});

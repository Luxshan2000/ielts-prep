/**
 * Two things a spoken drill must never do to a learner.
 *
 * 1. Offer a microphone it cannot read. With no speech-to-text the recording reaches
 *    the grader as an empty transcript, and the honest server verdict — "Nothing came
 *    through. Check the microphone" — names the wrong subsystem, because the microphone
 *    was fine. `POST /drills/attempts` has always accepted a typed `transcript`; the
 *    runner now asks `GET /speech/capabilities` first and uses it.
 * 2. Show a verdict without the words. The route returns `you_said` and a list of
 *    feedback sentences under `detail.alignment` — not `heard`, not `words`, not one
 *    string — so the old reader rendered a bare "Not quite" with the sentences glued
 *    together and no indication of which word failed.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fetchCardDrills = vi.fn();
const fetchItemAudio = vi.fn();
const fetchSpeechCapabilities = vi.fn();
const submitAttempt = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchCardDrills: (...a: unknown[]) => fetchCardDrills(...a),
    fetchItemAudio: (...a: unknown[]) => fetchItemAudio(...a),
    fetchSpeechCapabilities: () => fetchSpeechCapabilities(),
    submitAttempt: (...a: unknown[]) => submitAttempt(...a),
  };
});

const { DrillRunner } = await import("../DrillRunner");

const ITEM = {
  item_id: "d_repair_1",
  kind: "error_repair" as const,
  seconds: 20,
  title: "Say the corrected sentence",
  instruction: "Say it out loud with the fix.",
  prompt: { wrong: "I am waiting for that desk since three weeks." },
  grading: { mode: "stt_repair" as const },
  card_id: "card_p2",
};

const PACK = {
  card_id: "card_p2",
  gate: { unlocked: false },
  items: [ITEM],
  plan: [ITEM.item_id],
  available_kinds: ["error_repair" as const],
  set_budget_s: 120,
};

/** Exactly the payload `POST /api/v1/speaking/drills/attempts` returns today. */
const RESULT = {
  item_id: ITEM.item_id,
  kind: "error_repair" as const,
  mode: "stt_repair",
  passed: false,
  score: 40,
  you_said: "I am waiting for that desk since three weeks.",
  feedback: [
    "That was the wrong sentence read back, not the fix.",
    "'For' takes a length; 'since' takes a start point.",
  ],
  detail: {
    alignment: [
      { index: 0, expected: "had", heard: "am", status: "substituted" },
      { index: 1, expected: "been", heard: null, status: "missed" },
      { index: 2, expected: "waiting", heard: "waiting", status: "hit" },
    ],
  },
};

beforeEach(() => {
  fetchCardDrills.mockReset().mockResolvedValue(PACK);
  fetchItemAudio.mockReset().mockResolvedValue(null);
  fetchSpeechCapabilities.mockReset();
  submitAttempt.mockReset().mockResolvedValue(RESULT);
});

async function open(canTranscribe: boolean, reason: string | null = null) {
  fetchSpeechCapabilities.mockResolvedValue({ transcription: canTranscribe, reason });
  render(<DrillRunner cardId="card_p2" attempted />);
  const start = await screen.findByRole("button", { name: /Start the set/i });
  await userEvent.click(start);
  return start;
}

describe("a spoken drill with no speech-to-text", () => {
  it("does not offer a microphone it cannot read", async () => {
    await open(false, "Speech-to-text is not installed in this build.");
    await screen.findByLabelText("Type what you said");
    expect(screen.queryByRole("button", { name: /Record/i })).not.toBeInTheDocument();
  });

  it("says why, in the sidecar's own words", async () => {
    await open(false, "Speech-to-text is not installed in this build.");
    expect(
      await screen.findByText(/Speech-to-text is not installed in this build/),
    ).toBeInTheDocument();
  });

  it("grades the typed answer instead of dead-ending", async () => {
    await open(false);
    const box = await screen.findByLabelText("Type what you said");
    await userEvent.type(box, "I had been waiting for that desk for three weeks.");
    await userEvent.click(screen.getByRole("button", { name: /Check what I said/i }));
    await waitFor(() => expect(submitAttempt).toHaveBeenCalled());
    expect(submitAttempt.mock.calls[0][0]).toMatchObject({
      itemId: ITEM.item_id,
      transcript: "I had been waiting for that desk for three weeks.",
    });
  });

  it("will not submit an empty answer", async () => {
    await open(false);
    await screen.findByLabelText("Type what you said");
    expect(screen.getByRole("button", { name: /Check what I said/i })).toBeDisabled();
  });
});

describe("a spoken drill with speech-to-text working", () => {
  it("keeps the microphone first but still lets the learner type", async () => {
    await open(true);
    expect(await screen.findByRole("button", { name: /Record 20s/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Type it instead/i }));
    expect(screen.getByLabelText("Type what you said")).toBeInTheDocument();
  });
});

describe("a recording that carried no words", () => {
  it("offers the keyboard rather than the same button again", async () => {
    submitAttempt.mockResolvedValue({
      item_id: ITEM.item_id,
      kind: "error_repair" as const,
      passed: false,
      score: 0,
      you_said: "",
      feedback: ["Nothing came through. Check the microphone, then say it again."],
    });
    await open(false);
    const box = await screen.findByLabelText("Type what you said");
    await userEvent.type(box, "something");
    await userEvent.click(screen.getByRole("button", { name: /Check what I said/i }));

    expect(await screen.findByText(/Nothing was picked up from that recording/)).toBeInTheDocument();
    expect(screen.getByLabelText("Type what you said")).toBeInTheDocument();
  });
});

describe("the verdict a learner reads", () => {
  it("shows what was heard, from the field the route actually sends", async () => {
    await open(false);
    const box = await screen.findByLabelText("Type what you said");
    await userEvent.type(box, "I am waiting for that desk since three weeks.");
    await userEvent.click(screen.getByRole("button", { name: /Check what I said/i }));
    expect(await screen.findByText(/Heard:/)).toHaveTextContent(
      "I am waiting for that desk since three weeks.",
    );
  });

  it("keeps the feedback sentences apart instead of gluing them", async () => {
    await open(false);
    const box = await screen.findByLabelText("Type what you said");
    await userEvent.type(box, "wrong one");
    await userEvent.click(screen.getByRole("button", { name: /Check what I said/i }));
    expect(
      await screen.findByText("That was the wrong sentence read back, not the fix."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("'For' takes a length; 'since' takes a start point."),
    ).toBeInTheDocument();
  });

  it("marks the words that did not survive, from detail.alignment", async () => {
    await open(false);
    const box = await screen.findByLabelText("Type what you said");
    await userEvent.type(box, "wrong one");
    await userEvent.click(screen.getByRole("button", { name: /Check what I said/i }));
    const had = await screen.findByText("had");
    expect(had.className).toMatch(/destructive/);
    expect(screen.getByText("waiting").className).not.toMatch(/destructive/);
  });
});

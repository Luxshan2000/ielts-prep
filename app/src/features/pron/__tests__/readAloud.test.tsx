/**
 * What this screen is allowed to say about a learner's voice.
 *
 * The method behind it infers from ASR confidence, which falls for rare words, proper nouns,
 * background noise and — the case that decides how every string here is written — speech that
 * is accented and perfectly intelligible. So the screen never says a word was mispronounced,
 * because it does not know that. It says the recogniser was unsure, which is true, and which
 * makes the result a reason to listen again rather than a verdict.
 *
 * These are copy tests, which usually earn their keep poorly. They earn it here because the
 * copy *is* the feature: the same data rendered with the word "wrong" in it would be the
 * accent detector docs/09 §0 forbids.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RESULT = {
  transcript: "The sheep left the field.",
  overall: null,
  mean_confidence: 41,
  words_the_recogniser_was_unsure_of: [
    { word: "sheep", confidence: 0.31, score: null, recogniser_unsure: true },
  ],
  method: "proxy-v1",
  method_note:
    "This check listens for words the recogniser found hard to catch. It does not score your pronunciation, and a strong accent is not a mistake.",
  accent_notice:
    "IELTS accepts every accent. These scores measure how clearly each sound comes across.",
};

function stub(result: unknown = RESULT) {
  vi.doMock("../api", () => ({ readAloud: vi.fn().mockResolvedValue(result), getDrills: vi.fn() }));
  vi.doMock("@/components/practice/useRecorder", () => ({
    useRecorder: () => ({
      state: "idle",
      remaining: null,
      error: null,
      record: vi.fn().mockResolvedValue(new Blob(["x"])),
      stop: vi.fn(),
    }),
  }));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("ReadAloud", () => {
  it("shows the sentence the learner is asked to say", async () => {
    stub();
    const { ReadAloud } = await import("../components/ReadAloud");
    render(<ReadAloud sentence="The sheep left the field." />);
    expect(screen.getByText("The sheep left the field.")).toBeInTheDocument();
  });

  it("reports unsure words as worth another listen, never as errors", async () => {
    stub();
    const { ReadAloud } = await import("../components/ReadAloud");
    const { container } = render(<ReadAloud sentence="The sheep left the field." />);

    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(screen.getByText(/worth listening to again/i)).toBeInTheDocument());

    const text = container.textContent ?? "";
    for (const forbidden of ["mispronounce", "incorrect", "wrong", "poor", "bad"]) {
      expect(text.toLowerCase(), `screen must not say "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("always carries the accent notice with a result", async () => {
    stub();
    const { ReadAloud } = await import("../components/ReadAloud");
    render(<ReadAloud sentence="The sheep left the field." />);

    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(screen.getByText(/accepts every accent/i)).toBeInTheDocument());
  });

  it("says plainly that it is not scoring pronunciation", async () => {
    stub();
    const { ReadAloud } = await import("../components/ReadAloud");
    render(<ReadAloud sentence="The sheep left the field." />);

    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() =>
      expect(screen.getByText(/does not score your pronunciation/i)).toBeInTheDocument(),
    );
  });

  it("says so when every word was caught, rather than showing an empty list", async () => {
    stub({ ...RESULT, words_the_recogniser_was_unsure_of: [] });
    const { ReadAloud } = await import("../components/ReadAloud");
    render(<ReadAloud sentence="The sheep left the field." />);

    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() =>
      expect(screen.getByText(/caught every word without hesitating/i)).toBeInTheDocument(),
    );
  });

  it("turns a missing speech provider into an instruction", async () => {
    vi.doMock("../api", () => ({
      readAloud: vi.fn().mockRejectedValue(new Error("503 speech_unavailable")),
      getDrills: vi.fn(),
    }));
    vi.doMock("@/components/practice/useRecorder", () => ({
      useRecorder: () => ({
        state: "idle",
        remaining: null,
        error: null,
        record: vi.fn().mockResolvedValue(new Blob(["x"])),
        stop: vi.fn(),
      }),
    }));
    const { ReadAloud } = await import("../components/ReadAloud");
    render(<ReadAloud sentence="The sheep left the field." />);

    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(screen.getByText(/not set up on this machine/i)).toBeInTheDocument());
    expect(screen.getByText(/settings/i)).toBeInTheDocument();
  });
});

/**
 * Speaking is an alternative to typing, so it may never become a dead end.
 *
 * Every failure this panel can hit — permission denied, no microphone, an unsupported
 * browser, no speech provider on the machine — leaves the learner with a typed exercise that
 * still works. The panel's job when it fails is to say why in a sentence somebody can act on,
 * and then get out of the way.
 *
 * The other half is the refusal. Silence and Whisper's stock hallucinations come back from
 * the sidecar as `gradeable: false`, and that is emphatically not a wrong answer: being
 * marked down because a microphone was muted is worse than being told nothing.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpeakAnswer, type SpokenResult } from "../SpeakAnswer";

const ok: SpokenResult = {
  transcript: "The site must have closed early.",
  heard: "The site must have closed early.",
  gradeable: true,
  refusal: null,
  graded: { correct: true },
};

const refused: SpokenResult = {
  transcript: "thank you",
  heard: "thank you",
  gradeable: false,
  refusal: "Nothing was picked up. Check the microphone is not muted and try again.",
  graded: null,
};

/** A recorder that resolves immediately with a blob, so tests never touch real hardware. */
function stubRecorder(blob: Blob | null = new Blob(["x"], { type: "audio/webm" })) {
  const record = vi.fn().mockResolvedValue(blob);
  vi.doMock("../useRecorder", () => ({
    useRecorder: () => ({ state: "idle", remaining: null, error: null, record, stop: vi.fn() }),
  }));
  return record;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("SpeakAnswer", () => {
  it("offers speaking without taking the typed path away", () => {
    render(<SpeakAnswer onSubmit={vi.fn()} />);
    // The button is an offer — "instead" is the word that says typing still works.
    expect(screen.getByRole("button", { name: /say it instead/i })).toBeInTheDocument();
  });

  it("shows the prompt it was given", () => {
    render(<SpeakAnswer onSubmit={vi.fn()} prompt="Or say your sentence out loud." />);
    expect(screen.getByText("Or say your sentence out loud.")).toBeInTheDocument();
  });

  it("is disabled when the caller says so", () => {
    render(<SpeakAnswer onSubmit={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /say it instead/i })).toBeDisabled();
  });

  it("always shows what was heard, so a verdict is arguable", async () => {
    stubRecorder();
    const { SpeakAnswer: Panel } = await import("../SpeakAnswer");
    render(<Panel onSubmit={vi.fn().mockResolvedValue(ok)} />);

    await userEvent.click(screen.getByRole("button", { name: /say it instead/i }));
    await waitFor(() =>
      expect(screen.getByText("The site must have closed early.")).toBeInTheDocument(),
    );
    expect(screen.getByText(/heard/i)).toBeInTheDocument();
  });

  it("reports a refusal as a refusal, not as a wrong answer", async () => {
    stubRecorder();
    const { SpeakAnswer: Panel } = await import("../SpeakAnswer");
    render(<Panel onSubmit={vi.fn().mockResolvedValue(refused)} />);

    await userEvent.click(screen.getByRole("button", { name: /say it instead/i }));
    await waitFor(() => expect(screen.getByText(/nothing was picked up/i)).toBeInTheDocument());
    // Nothing that reads as a judgement on the learner.
    expect(screen.queryByText(/wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/incorrect/i)).not.toBeInTheDocument();
  });

  it("hands a missing speech provider back as an instruction, not a stack trace", async () => {
    stubRecorder();
    const { SpeakAnswer: Panel } = await import("../SpeakAnswer");
    render(<Panel onSubmit={vi.fn().mockRejectedValue(new Error("503 speech_unavailable"))} />);

    await userEvent.click(screen.getByRole("button", { name: /say it instead/i }));
    await waitFor(() => expect(screen.getByText(/type your answer instead/i)).toBeInTheDocument());
    expect(screen.getByText(/settings/i)).toBeInTheDocument();
  });

  it("survives any other failure with a usable message", async () => {
    stubRecorder();
    const { SpeakAnswer: Panel } = await import("../SpeakAnswer");
    render(<Panel onSubmit={vi.fn().mockRejectedValue(new Error("boom"))} />);

    await userEvent.click(screen.getByRole("button", { name: /say it instead/i }));
    await waitFor(() => expect(screen.getByText(/could not be checked/i)).toBeInTheDocument());
    expect(screen.getByText(/type your answer instead/i)).toBeInTheDocument();
  });

  it("does not call the server when the recorder returns nothing", async () => {
    stubRecorder(null); // permission denied — the recorder surfaces its own reason
    const { SpeakAnswer: Panel } = await import("../SpeakAnswer");
    const onSubmit = vi.fn();
    render(<Panel onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: /say it instead/i }));
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });
});

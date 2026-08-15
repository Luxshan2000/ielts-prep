/**
 * What the perception drill is, and what it is not allowed to become.
 *
 * The drill plays one of two words and asks which one was said. That is a *listening*
 * result — it is checked against a key this screen drew, not against the learner's voice —
 * and docs/09 §0 draws the line exactly there: a pronunciation score, a good/warn/poor band
 * or the word "mispronounced" would all be claims this app cannot make. So one test guards
 * the copy and the rest guard the mechanism, because the mechanism had quietly stopped
 * working: the row read its answer key off `item.key`, which the sidecar has never sent, so
 * every answer was unmarked and the drill taught nothing.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SET = {
  drill_type: "minimal_pair_ab",
  contrast: null,
  items: [
    {
      id: "mp_ship_sheep",
      drill_type: "minimal_pair_ab",
      a: "ship",
      b: "sheep",
      contrast: "ɪ–iː",
      sentence_a: "The ship left the harbour.",
      sentence_b: "The sheep left the field.",
    },
  ],
  contrasts: [{ contrast: "ɪ–iː", items: 5 }],
  accuracy: [],
  accent_notice:
    "IELTS accepts every accent. These scores measure how clearly each sound comes across — not how British or American you sound.",
  empty_reason: null,
};

const getDrills = vi.fn();
const recordDrillAttempt = vi.fn();

vi.mock("../api", () => ({
  getDrills: (...args: unknown[]) => getDrills(...args),
  recordDrillAttempt: (...args: unknown[]) => recordDrillAttempt(...args),
}));

/** jsdom has no synthesiser; without one the drill correctly refuses to ask. */
function giveTheBrowserAVoice() {
  const speak = vi.fn();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { speak, cancel: vi.fn() },
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: class {
      lang = "";
      rate = 1;
      constructor(public text: string) {}
    },
  });
  return speak;
}

beforeEach(() => {
  getDrills.mockResolvedValue(SET);
  recordDrillAttempt.mockResolvedValue({});
  // "a" — Math.random() < 0.5 picks the first word of the pair.
  vi.spyOn(Math, "random").mockReturnValue(0.1);
});

afterEach(() => {
  Reflect.deleteProperty(window, "speechSynthesis");
});

async function open() {
  const { MinimalPairDrill } = await import("../components/MinimalPairDrill");
  return render(<MinimalPairDrill />);
}

describe("the minimal-pair drill", () => {
  it("will not take an answer until the sound has been played", async () => {
    giveTheBrowserAVoice();
    await open();

    const ship = await screen.findByRole("button", { name: /ship/ });
    expect(ship).toBeDisabled();
    expect(screen.getByText(/Play it before you choose/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: /ship/ })).toBeEnabled();
  });

  it("marks the answer against the word it actually played", async () => {
    const speak = giveTheBrowserAVoice();
    await open();

    await userEvent.click(await screen.findByRole("button", { name: "Play" }));
    expect(speak.mock.calls[0][0].text).toBe("ship");

    await userEvent.click(screen.getByRole("button", { name: /sheep/ }));
    expect(await screen.findByText(/It was “ship”/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Another set/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: /ship/ }));
    expect(await screen.findByText(/That's the one/)).toBeInTheDocument();
  });

  it("records the answer so the bank can bring the pair back", async () => {
    giveTheBrowserAVoice();
    await open();

    await userEvent.click(await screen.findByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: /sheep/ }));

    await waitFor(() => expect(recordDrillAttempt).toHaveBeenCalledTimes(1));
    expect(recordDrillAttempt.mock.calls[0][0]).toMatchObject({
      itemId: "mp_ship_sheep",
      correct: false,
      contrast: "ɪ–iː",
    });
  });

  it("says the pair is unplayable rather than pretending, on a machine with no voice", async () => {
    await open();
    expect(await screen.findByText(/no built-in voice/i)).toBeInTheDocument();
    // The words are still readable, so the option stays usable.
    expect(screen.getByRole("button", { name: /ship/ })).toBeEnabled();
  });

  it("carries the accent notice", async () => {
    giveTheBrowserAVoice();
    await open();
    expect(await screen.findByText(/accepts every accent/i)).toBeInTheDocument();
  });

  it("never scores, bands or judges the learner's pronunciation", async () => {
    const { container } = await open();
    await screen.findByRole("button", { name: /ship/ });

    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of ["mispronounce", "your pronunciation score", "poor", "your accent is"]) {
      expect(text, `the drill must not say "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("names the sound pairs with example words instead of bare phonetic symbols", async () => {
    giveTheBrowserAVoice();
    await open();
    await userEvent.click(await screen.findByLabelText("Sound pair"));
    expect(await screen.findByText(/as in ship \/ sheep/)).toBeInTheDocument();
  });

  it("offers a way back when the drills cannot be loaded", async () => {
    getDrills.mockRejectedValueOnce(new Error("sidecar down"));
    await open();
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });
});

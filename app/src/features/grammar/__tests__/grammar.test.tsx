import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/lib/api";

import { DecisionPanel } from "../components/DecisionPanel";
import { Cue } from "../components/primitives";
import { SessionScreen } from "../components/SessionScreen";
import { GrammarPage } from "../page";
import { codeLabel, familyLabel, stageName } from "../labels";
import { useGrammarStore } from "../store";
import type { AnswerResult, Contrast, SessionItem, SessionResponse } from "../types";

// The store talks to exactly one module, so the whole sidecar is one mock.
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    startSession: vi.fn(),
    submitAnswer: vi.fn(),
    finishSession: vi.fn(async () => ({ ok: true })),
    fetchPath: vi.fn(),
    fetchProgress: vi.fn(),
  };
});

import { fetchPath, finishSession, startSession, submitAnswer } from "../api";

// --------------------------------------------------------------------- fixtures

const chooseItem: SessionItem = {
  id: "gi_pp_vs_past_simple_09",
  point_id: "gr_pp_vs_past_simple",
  point_title: "Saying whether the time you mean is finished or still running",
  card_id: "gc_1",
  kind: "choose_form",
  stage: 3,
  register: "spoken",
  decision_cue: "she still works",
  retryable: true,
  payload: {
    context: "Nadia is showing a visitor round the depot where she still works.",
    stem: "I ___ here for six years.",
    options: [{ text: "worked" }, { text: "have worked" }],
  },
};

const session: SessionResponse = {
  session_id: "gs_1",
  items: [chooseItem],
  counts: { total: 1 },
};

/** Beat 1: wrong, and the server withholds the key so the learner can try again. */
const withheld: AnswerResult = { correct: false, reveal: null, committed: false };

const revealed: AnswerResult = {
  correct: true,
  committed: true,
  next_label: "4 days",
  reveal: {
    key: 1,
    decision_cue: "she still works",
    why_key: "The six years are still running, so English keeps the period open.",
    feed_forward: "Ask whether the time period has closed before you choose.",
    options: [
      { text: "worked", why_this_means: "That the six years are over and she has left." },
      { text: "have worked", why_this_means: "That the six years are still running." },
    ],
  },
};

function renderSession() {
  return render(
    <MemoryRouter initialEntries={["/grammar/practice?point=gr_pp_vs_past_simple"]}>
      <SessionScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useGrammarStore.getState().resetSession();
  vi.mocked(startSession).mockResolvedValue(session);
  vi.mocked(finishSession).mockResolvedValue({ ok: true });
});

// ------------------------------------------------------------------------ tests

describe("the contrast engine", () => {
  it("shows no answer on the first wrong attempt — it signals, then elicits", async () => {
    vi.mocked(submitAnswer).mockResolvedValueOnce(withheld);
    const user = userEvent.setup();
    renderSession();

    await screen.findByText(/Nadia is showing a visitor/);
    await user.click(screen.getByRole("button", { name: "worked" }));

    // Beat 1: the verdict and a nudge — never the key, never the explanation.
    expect(await screen.findByText(/Not this one\./)).toBeInTheDocument();
    expect(screen.queryByText(/still running, so English keeps/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("reveals the meaning of both options, not a verdict, once the item is finished", async () => {
    vi.mocked(submitAnswer).mockResolvedValueOnce(revealed);
    const user = userEvent.setup();
    renderSession();

    await screen.findByText(/Nadia is showing a visitor/);
    await user.click(screen.getByRole("button", { name: "have worked" }));

    expect(await screen.findByText(/The six years are still running, so English keeps/)).toBeInTheDocument();
    // The rejected option's meaning is spelled out — that is the teaching.
    expect(screen.getByText(/That the six years are over and she has left\./)).toBeInTheDocument();
    // And one imperative for next time.
    expect(screen.getByText(/Ask whether the time period has closed/)).toBeInTheDocument();
  });

  it("sends the second attempt with attempt = 2 after a retry", async () => {
    vi.mocked(submitAnswer).mockResolvedValueOnce(withheld).mockResolvedValueOnce(revealed);
    const user = userEvent.setup();
    renderSession();

    await screen.findByText(/Nadia is showing a visitor/);
    await user.click(screen.getByRole("button", { name: "worked" }));
    await user.click(await screen.findByRole("button", { name: /Try again/ }));
    await user.click(screen.getByRole("button", { name: "have worked" }));

    await waitFor(() => expect(vi.mocked(submitAnswer)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(submitAnswer).mock.calls[0][0].attempt).toBe(1);
    expect(vi.mocked(submitAnswer).mock.calls[1][0].attempt).toBe(2);
  });

  it("keeps the card on screen and says so when an answer cannot be saved", async () => {
    vi.mocked(submitAnswer).mockRejectedValueOnce(new Error("network went away"));
    const user = userEvent.setup();
    renderSession();

    await screen.findByText(/Nadia is showing a visitor/);
    await user.click(screen.getByRole("button", { name: "have worked" }));

    expect(await screen.findByText(/network went away/)).toBeInTheDocument();
    expect(screen.getByText(/Nadia is showing a visitor/)).toBeInTheDocument();
  });
});

describe("a build with no grammar content", () => {
  it("says so calmly instead of showing an error", async () => {
    // A sidecar without the grammar routes, or a pack without `grammar.jsonl`,
    // 404s. That is a shipping state, not a fault the learner caused.
    vi.mocked(fetchPath).mockRejectedValueOnce(new ApiError(404, "not_found", "no such route"));
    useGrammarStore.setState({ path: null, missing: false, pathLoading: false, pathError: null });

    render(
      <MemoryRouter initialEntries={["/grammar"]}>
        <GrammarPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/grammar syllabus is not in this build yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });
});

describe("the decision panel", () => {
  const contrast: Contrast = {
    question: "Is the period of time I am talking about finished?",
    board_id: "gb_pp_vs_past",
    fork: [
      { answer: "Finished — yesterday, in 2019", selects: "past simple" },
      { answer: "Still open — this year, since 2019", selects: "present perfect" },
    ],
    minimal_pair: {
      a: { text: "I worked at the Marlow depot for six years.", means: "The six years are over." },
      b: { text: "I have worked at the Marlow depot for six years.", means: "The six years are still running." },
      only_difference: "worked / have worked",
    },
    wrong_choice_note: "You chose worked. That says the six years are over.",
    edge_case: { text: "American English often prefers the past simple here.", ignore_the_rest: true },
  };

  it("renders all five authored parts", () => {
    render(<DecisionPanel contrast={contrast} />);
    expect(screen.getByText(contrast.question)).toBeInTheDocument();
    expect(screen.getByText("past simple")).toBeInTheDocument();
    expect(screen.getByText(/The six years are still running\./)).toBeInTheDocument();
    expect(screen.getByText(/You chose worked/)).toBeInTheDocument();
    expect(screen.getByText(/American English often prefers/)).toBeInTheDocument();
    expect(screen.getByText("worked / have worked")).toBeInTheDocument();
  });
});

describe("the deciding span", () => {
  it("marks the authored substring", () => {
    const { container } = render(<Cue text="She still works there." cue="still works" />);
    expect(container.querySelector("mark")?.textContent).toBe("still works");
  });

  it("renders the sentence untouched when the span does not match", () => {
    // An authored cue that is not a literal substring is a content bug. Showing
    // the sentence plainly is the honest failure; throwing is not.
    const { container } = render(<Cue text="She still works there." cue="no such span" />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("She still works there.");
  });
});

describe("the shared vocabulary", () => {
  it("names the six rungs", () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => stageName(s))).toEqual([
      "Meet",
      "Notice",
      "Build",
      "Choose",
      "Use",
      "Under pressure",
    ]);
  });

  it("turns an error code into something a learner can read", () => {
    expect(codeLabel("comma_splice")).toBe("Two sentences joined by a comma");
    expect(familyLabel("comma_splice")).toBe("Sentence boundaries");
    // A code from a newer pack still renders, rather than showing a raw slug.
    expect(codeLabel("some_future_code")).toBe("Some future code");
  });
});

/**
 * The two ways a practice sitting used to end before it began.
 *
 * **The vocabulary card.** The sidecar's daily queue interleaves vocabulary by default
 * (`include_vocabulary`), and each of those items names its own route in `review_via`
 * because `/api/v1/grammar/answer` answers a bare 404 for one. This screen has no renderer
 * for a vocabulary card either, so a queue that led with one showed a stub — "Answer the
 * question", the headword, a Continue button — and then refused to advance. On a fresh
 * install every item in that queue was one of these, which made "Today's practice"
 * unfinishable.
 *
 * **The placement link.** The path screen's "Find where to start" links to
 * `?mode=placement`, and the query string was read for `point`, `code` and `board` only —
 * so the button quietly delivered the daily queue instead of the twenty-question set it
 * promised.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionScreen } from "../components/SessionScreen";
import { useGrammarStore } from "../store";
import type { SessionResponse } from "../types";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    startSession: vi.fn(),
    submitAnswer: vi.fn(),
    finishSession: vi.fn(async () => ({ ok: true })),
    fetchPath: vi.fn(async () => {
      throw new Error("the path is not what this file is about");
    }),
  };
});

import { startSession } from "../api";

const LEX_ONLY = {
  session_id: "gs_1",
  items: [
    {
      id: "lex:ve_1",
      point_id: null,
      family: "lex",
      kind: "flip",
      stage: 2,
      review_via: "/api/v1/srs/review",
      payload: { question: "concede" },
    },
    {
      id: "lex:ve_2",
      point_id: null,
      family: "lex",
      kind: "flip",
      stage: 2,
      review_via: "/api/v1/srs/review",
      payload: { question: "premise" },
    },
  ],
  counts: { total: 2, gram: 0, lex: 2 },
} as unknown as SessionResponse;

const ONE_GRAMMAR_ITEM = {
  session_id: "gs_2",
  items: [
    {
      id: "gi_aux_01",
      point_id: "gr_aux_system",
      point_title: "The one move behind every question and every negative in English",
      family: "gram",
      kind: "gap_fill",
      stage: 2,
      payload: { stem: "___ the night bus run on a Sunday?" },
    },
  ],
  counts: { total: 1, gram: 1, lex: 0 },
} as unknown as SessionResponse;

function open(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SessionScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useGrammarStore.getState().resetSession();
  useGrammarStore.setState({ path: null });
  vi.mocked(startSession).mockResolvedValue({
    session_id: "gs_0",
    items: [],
    counts: { total: 0 },
  } as unknown as SessionResponse);
});

describe("what the screen asks the sidecar for", () => {
  it("asks for grammar only, because it cannot submit a vocabulary answer anywhere", async () => {
    open("/grammar/practice");
    await vi.waitFor(() => expect(startSession).toHaveBeenCalled());
    expect(vi.mocked(startSession).mock.calls[0][0]).toMatchObject({
      mode: "daily",
      include_vocabulary: false,
    });
  });

  it("builds the placement set when the path screen links to it", async () => {
    vi.mocked(startSession).mockResolvedValue(ONE_GRAMMAR_ITEM);
    open("/grammar/practice?mode=placement");
    await vi.waitFor(() => expect(startSession).toHaveBeenCalled());
    expect(vi.mocked(startSession).mock.calls[0][0]).toMatchObject({ mode: "placement" });
    expect(await screen.findByText("Finding where to start")).toBeInTheDocument();
  });
});

describe("a queue that comes back with vocabulary in it anyway", () => {
  it("never puts a card on screen that cannot be answered", async () => {
    vi.mocked(startSession).mockResolvedValue(LEX_ONLY);
    open("/grammar/practice");

    expect(await screen.findByText(/Nothing is due right now/)).toBeInTheDocument();
    expect(screen.queryByText("concede")).toBeNull();
  });

  it("says where those words are reviewed instead of dropping them silently", async () => {
    vi.mocked(startSession).mockResolvedValue(LEX_ONLY);
    open("/grammar/practice");

    expect(await screen.findByRole("button", { name: /Review 2 words instead/ })).toBeInTheDocument();
  });
});

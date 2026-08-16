/**
 * The two screens the adapter feeds, at the level the user complained about: can I get
 * to my conversations, and does an empty one explain itself.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { SessionRecord } from "../../store";

const get = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { ...actual.api, get: (url: string) => get(url) } };
});

const fetchTranscript = vi.fn();
vi.mock("../../store", async () => {
  const actual = await vi.importActual<typeof import("../../store")>("../../store");
  return { ...actual, fetchTranscript: (id: string) => fetchTranscript(id) };
});

const { SpeakingHistoryPage } = await import("../HistoryPage");
const { SessionTranscript } = await import("../../SessionTranscript");

const CHAT: SessionRecord = {
  id: "ss_chat",
  mode: "micro",
  activity: "quick_chat",
  part: null,
  card_set_id: null,
  state: "CHAT",
  status: "complete",
  overall_band: null,
  started_at: "2026-07-26T15:38:14.886Z",
  ended_at: "2026-07-26T15:46:25.541Z",
  duration_s: 490,
  has_transcript: true,
  turn_count: 22,
  opening_line: "My name is Sam Perera.",
};

beforeEach(() => {
  get.mockReset();
  fetchTranscript.mockReset();
});

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={["/speaking/history"]}>
      <Routes>
        <Route path="/speaking/history" element={<SpeakingHistoryPage />} />
        <Route path="/speaking/session/:sessionId/transcript" element={<p>Transcript screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/speaking/history", () => {
  it("lists an unscored chat and opens its transcript", async () => {
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/speaking/sessions")
        ? Promise.resolve({ items: [CHAT] })
        : Promise.resolve({ items: [] }),
    );

    renderHistory();

    const row = await screen.findByRole("button", { name: /Sam Perera/ });
    // This is the regression: before the history screen existed, every stored chat was
    // a disabled row that went nowhere.
    await userEvent.click(row);
    expect(await screen.findByText("Transcript screen")).toBeInTheDocument();
  });

  it("filters by what was said", async () => {
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/speaking/sessions")
        ? Promise.resolve({
            items: [CHAT, { ...CHAT, id: "ss_2", opening_line: "I work as a nurse." }],
          })
        : Promise.resolve({ items: [] }),
    );

    renderHistory();
    await screen.findByRole("button", { name: /Sam Perera/ });

    await userEvent.type(screen.getByLabelText("Search your history"), "nurse");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Sam Perera/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /nurse/ })).toBeInTheDocument();
  });

  it("says so plainly when nothing has ever been spoken here", async () => {
    get.mockResolvedValue({ items: [] });
    renderHistory();
    expect(await screen.findByText("You haven't spoken here yet")).toBeInTheDocument();
  });

  it("still lists the sessions when the enrichment calls all fail", async () => {
    // No mock has ever been sat, a mock is open so the drill routes answer 409, and the
    // cue-card bank is unreadable. None of that is a reason to lose the session list.
    get.mockImplementation((url: string) =>
      url === "/api/v1/speaking/sessions?limit=200"
        ? Promise.resolve({ items: [CHAT] })
        : Promise.reject(new Error("nope")),
    );
    renderHistory();
    expect(await screen.findByRole("button", { name: /Sam Perera/ })).toBeInTheDocument();
  });

  it("lists a coaching drill as a row that says why it cannot be opened", async () => {
    get.mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/speaking/sessions")) return Promise.resolve({ items: [CHAT] });
      if (url.startsWith("/api/v1/speaking/drills/history")) {
        return Promise.resolve({
          items: [
            {
              id: "dr_1",
              kind: "minimal_pair",
              at: "2026-07-22T10:00:00Z",
              duration_s: 95,
              card_id: "sc_1",
              card_set_id: null,
              item_id: "it_1",
              passed: true,
              score: 80,
              headline: "You kept ship and sheep apart every time.",
            },
          ],
        });
      }
      if (url.startsWith("/api/v1/speaking/cards")) {
        return Promise.resolve({ items: [{ id: "sc_1", title: "A place you like to visit" }] });
      }
      return Promise.resolve({ items: [] });
    });

    renderHistory();

    expect(
      await screen.findByText("A place you like to visit · Minimal pairs"),
    ).toBeInTheDocument();
    expect(screen.getByText(/coaching drills aren't kept as a report/)).toBeInTheDocument();
    // Not a link: the row is drawn, but there is nothing behind it to press.
    expect(
      screen.queryByRole("button", { name: /Minimal pairs/ }),
    ).not.toBeInTheDocument();
    // All four filter chips, which is what the learner asked for.
    expect(screen.getByRole("button", { name: /Coaching/ })).toBeInTheDocument();
  });
});

function renderTranscript() {
  return render(
    <MemoryRouter initialEntries={["/speaking/session/ss_chat/transcript"]}>
      <Routes>
        <Route path="/speaking/session/:sessionId/transcript" element={<SessionTranscript />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/speaking/session/:id/transcript", () => {
  it("shows both sides of the conversation in order, with timings", async () => {
    get.mockResolvedValue(CHAT);
    fetchTranscript.mockResolvedValue([
      { role: "assistant", text: "Where do you live?", t_ms: 500 },
      { role: "user", text: "In a small city by the sea.", t_ms: 3_000 },
    ]);

    renderTranscript();

    expect(await screen.findByText("Where do you live?")).toBeInTheDocument();
    expect(screen.getByText("In a small city by the sea.")).toBeInTheDocument();
    expect(screen.getByText("Examiner")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    // Unscored is a rule of the mode, not a fault — the page has to say which.
    expect(screen.getByText(/isn't scored/)).toBeInTheDocument();
  });

  it("explains an empty transcript instead of rendering a blank page", async () => {
    get.mockResolvedValue({ ...CHAT, has_transcript: false, turn_count: 0 });
    fetchTranscript.mockResolvedValue([]);

    renderTranscript();

    expect(await screen.findByText("Nothing was said in this session")).toBeInTheDocument();
  });

  it("names a session that no longer exists rather than showing an empty transcript", async () => {
    const { ApiError } = await import("@/lib/api");
    get.mockRejectedValue(new ApiError(404, "not_found", "gone"));
    fetchTranscript.mockResolvedValue([]);

    renderTranscript();

    expect(await screen.findByText(/doesn't exist any more/)).toBeInTheDocument();
  });
});

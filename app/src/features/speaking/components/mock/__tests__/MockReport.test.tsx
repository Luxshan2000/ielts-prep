import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { MockReport } from "../MockReport";
import type { SpeakingReport, TranscriptTurn } from "../../../store";

const fetchReport = vi.fn();
const fetchTranscript = vi.fn();
const fetchSetOutline = vi.fn();

vi.mock("../../../store", async () => {
  const actual = await vi.importActual<typeof import("../../../store")>("../../../store");
  return {
    ...actual,
    fetchReport: (...args: unknown[]) => fetchReport(...args),
    fetchTranscript: (...args: unknown[]) => fetchTranscript(...args),
  };
});

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, fetchSetOutline: (...args: unknown[]) => fetchSetOutline(...args) };
});

vi.mock("../store", () => {
  const state = { history: [], loadHistory: () => Promise.resolve() };
  return {
    useMockStore: Object.assign((selector: (s: unknown) => unknown) => selector(state), {
      getState: () => state,
    }),
    isMockRecord: () => true,
  };
});

const REPORT: SpeakingReport = {
  report_id: "sr_mock_01",
  session_id: "ss_mock_01",
  created_at: "2026-07-25T10:00:00Z",
  model_id: "qwen3-30b-a3b",
  prompt_version: "speaking-eval-v1",
  overall_band: 6.5,
  criteria: {
    fc: { band: 7, evidence: ["on a good day"], improvements: [] },
    lr: { band: 6, evidence: [], improvements: ["Swap vague quantifiers for collocations."] },
    gra: { band: 7, evidence: [], improvements: [] },
    pron: { band: 6, evidence: [], improvements: [] },
  },
  best_moments: ["my daily commute takes an hour"],
  errors: [
    { quote: "very much cars", issue: "quantifier", better: "heavy traffic" },
    { quote: "should of invested", issue: "modal + have", better: "should have invested" },
  ],
  vocab_to_bank: [],
  unanchored: [],
  pronunciation_blind: false,
  metrics: { parts: { "1": { wpm: 110 }, "2": { wpm: 128 } } },
  mode: "mock",
  activity: "full_mock",
  card_set_id: "cs_travel",
  duration_s: 760,
  honesty_note: "AI-estimated band — treat the trend as the signal.",
};

const TURNS: TranscriptTurn[] = [
  { role: "user", text: "I live in a small city and there were very much cars", t_ms: 0, part: 1 },
  { role: "user", text: "My daily commute takes an hour on a good day", t_ms: 1, part: 2 },
  { role: "user", text: "I think the government should of invested earlier", t_ms: 2, part: 3 },
];

function renderAt(reportId = "sr_mock_01") {
  return render(
    <MemoryRouter initialEntries={[`/speaking/mock/report/${reportId}`]}>
      <Routes>
        <Route path="/speaking/mock/report/:reportId" element={<MockReport />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchReport.mockReset();
  fetchTranscript.mockReset();
  fetchSetOutline.mockReset();
  fetchTranscript.mockResolvedValue(TURNS);
  fetchSetOutline.mockResolvedValue({
    id: "cs_travel",
    title: "Travel and commuting",
    cards: [
      { id: "c1", part: 1, title: "Where you live" },
      { id: "c2", part: 2, title: "A journey you remember" },
    ],
  });
});

describe("MockReport", () => {
  it("shows the whole-test band and every criterion", async () => {
    fetchReport.mockResolvedValue(REPORT);
    renderAt();

    await waitFor(() => expect(screen.getByText("Whole test")).toBeInTheDocument());
    expect(screen.getByText(/AI-estimated band/)).toBeInTheDocument();
    expect(screen.getByText("Fluency & Coherence")).toBeInTheDocument();
    expect(screen.getByText("Pronunciation")).toBeInTheDocument();
  });

  it("breaks the sitting down part by part with the examiner's own quotes", async () => {
    fetchReport.mockResolvedValue(REPORT);
    renderAt();

    await waitFor(() => expect(screen.getByText("Part by part")).toBeInTheDocument());
    expect(screen.getByText("Part 1: Interview")).toBeInTheDocument();
    expect(screen.getByText("Part 2: Long turn")).toBeInTheDocument();
    expect(screen.getByText("Part 3: Discussion")).toBeInTheDocument();
    expect(screen.getByText(/very much cars/)).toBeInTheDocument();
    expect(screen.getByText(/my daily commute takes an hour/)).toBeInTheDocument();
  });

  it("links back to the topic coach for the cards just sat", async () => {
    fetchReport.mockResolvedValue(REPORT);
    renderAt();

    await waitFor(() =>
      expect(screen.getByText(/Model answers are now unlocked/)).toBeInTheDocument(),
    );
    expect(screen.getByText("A journey you remember")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /topic coach/i }).length).toBeGreaterThan(0);
  });

  it("survives a sitting with no card set behind it", async () => {
    fetchReport.mockResolvedValue({ ...REPORT, card_set_id: null });
    renderAt();

    await waitFor(() => expect(screen.getByText("What to do next")).toBeInTheDocument());
    expect(screen.queryByText(/Model answers are now unlocked/)).not.toBeInTheDocument();
    expect(fetchSetOutline).not.toHaveBeenCalled();
  });

  it("explains a missing report instead of rendering an empty page", async () => {
    fetchReport.mockRejectedValue(new ApiError(404, "not_found", "no speaking report"));
    renderAt();

    await waitFor(() => expect(screen.getByText("Report unavailable")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("never offers coaching material the sitting itself would have leaked", async () => {
    fetchReport.mockResolvedValue(REPORT);
    renderAt();

    await waitFor(() => expect(screen.getByText("Part by part")).toBeInTheDocument());
    // The unlock only happens after the attempt, so the wording must not claim the
    // model answers were available during the test.
    expect(screen.getByText(/stayed locked until you had attempted them/)).toBeInTheDocument();
  });
});

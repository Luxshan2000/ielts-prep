import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { ConfirmProvider } from "@/components/ui";
import { FeedbackReport } from "../FeedbackReport";
import type { SpeakingReport } from "../store";

const fetchReport = vi.fn();
const fetchTranscript = vi.fn();
const fetchTurnRecordings = vi.fn();

vi.mock("../store", async () => {
  const actual = await vi.importActual<typeof import("../store")>("../store");
  return {
    ...actual,
    fetchReport: (...args: unknown[]) => fetchReport(...args),
    fetchTranscript: (...args: unknown[]) => fetchTranscript(...args),
    fetchTurnRecordings: (...args: unknown[]) => fetchTurnRecordings(...args),
    fetchSuggestions: () => Promise.resolve([]),
    useSpeakingStore: Object.assign(
      (selector: (s: unknown) => unknown) =>
        selector({ history: [], loadHistory: () => Promise.resolve() }),
      { getState: () => ({ history: [], loadHistory: () => Promise.resolve() }) },
    ),
  };
});

const REPORT: SpeakingReport = {
  report_id: "sr_01",
  session_id: "ss_01",
  created_at: "2026-07-25T10:00:00Z",
  model_id: "qwen2.5:7b",
  prompt_version: "speaking-eval-v1",
  overall_band: 6.5,
  criteria: {
    fc: { band: 6, evidence: ["I live in a small city"], improvements: ["Link with 'whereas'"] },
    lr: { band: 7, evidence: [], improvements: [] },
    gra: { band: 6, evidence: [], improvements: [] },
    pron: { band: null, evidence: [], improvements: [] },
  },
  best_moments: ["my daily commute takes an hour"],
  errors: [{ quote: "very much cars", issue: "quantifier", better: "heavy traffic" }],
  vocab_to_bank: [],
  unanchored: [],
  pronunciation_blind: true,
  metrics: { overall: { wpm: 128 }, session: { speech_secs: 240 } },
  mode: "mock",
  activity: "full_mock",
  card_set_id: "cs_1",
  duration_s: 760,
  honesty_note: "AI-estimated band — typically within ±1.0 of an official examiner.",
};

function renderAt(reportId = "sr_01") {
  return render(
    <MemoryRouter initialEntries={[`/speaking/report/${reportId}`]}>
      <ConfirmProvider>
        <Routes>
          <Route path="/speaking/report/:reportId" element={<FeedbackReport />} />
          <Route path="/speaking" element={<p>Speaking hub</p>} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchTranscript.mockResolvedValue([]);
  fetchTurnRecordings.mockResolvedValue([]);
});

describe("FeedbackReport", () => {
  it("renders the overall band, the criterion chips and the honesty note", async () => {
    fetchReport.mockResolvedValue(REPORT);
    renderAt();

    await waitFor(() => expect(screen.getByLabelText("Band 6.5 — Overall")).toBeInTheDocument());
    expect(screen.getByText(/AI-estimated band/)).toBeInTheDocument();
    // Pronunciation came back null, so it must read as "not assessed", never as 0.
    expect(screen.getByText(/Pronunciation couldn't be assessed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lexical Resource/ })).toBeInTheDocument();
  });

  it("expands a criterion to its evidence and improvements", async () => {
    fetchReport.mockResolvedValue(REPORT);
    renderAt();
    await waitFor(() => expect(screen.getByLabelText("Band 6.5 — Overall")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Fluency & Coherence/ }));
    expect(await screen.findByText(/I live in a small city/)).toBeInTheDocument();
    expect(screen.getByText("Link with 'whereas'")).toBeInTheDocument();
  });

  it("explains a missing transcript instead of rendering an empty pane", async () => {
    fetchReport.mockResolvedValue(REPORT);
    renderAt();
    await waitFor(() => expect(screen.getByLabelText("Band 6.5 — Overall")).toBeInTheDocument());

    expect(screen.getByText("Transcript not available")).toBeInTheDocument();
    // The flagged error is still shown, with its correction.
    expect(screen.getByText(/very much cars/)).toBeInTheDocument();
    expect(screen.getByText(/heavy traffic/)).toBeInTheDocument();
  });

  it("shows an actionable error state with a retry when the report 404s", async () => {
    fetchReport.mockRejectedValue(new ApiError(404, "not_found", "no speaking report"));
    renderAt("sr_missing");

    expect(await screen.findByText("Report unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

    fetchReport.mockResolvedValue(REPORT);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByLabelText("Band 6.5 — Overall")).toBeInTheDocument());
  });
});

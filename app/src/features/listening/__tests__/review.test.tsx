import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/lib/api";
import { ReviewScreen } from "../components/ReviewScreen";
import { useListeningStore } from "../store";
import type { ReviewDoc } from "../types";

const review: ReviewDoc = {
  attempt_id: "la_1",
  mode: "exam",
  status: "submitted",
  raw_score: 1,
  total_questions: 2,
  band: null,
  duration_s: 1_805,
  submitted_at: "2026-07-25T10:00:00.000Z",
  play_count: 1,
  parts: [
    {
      script_id: "ls_1",
      part: 1,
      title: "Booking a cycling tour",
      accent_set: "uk",
      audio_hash: "abc",
      media_path: "/api/v1/media/listening/abc.wav",
      transcript: {
        speakers: [{ id: "s1", name: "Agent" }],
        lines: [
          { index: 0, speaker: "s1", text: "Could I take your surname?", start_ms: 0 },
          { index: 1, speaker: "s1", text: "It's Bramley, B-R-A-M-L-E-Y.", start_ms: 12_000 },
        ],
      },
      questions: [
        {
          number: 1,
          question_id: "lq_1",
          type: "form_completion",
          instruction: "Write ONE WORD.",
          prompt: "Surname",
          options: null,
          word_limit: 1,
          given: "bramley",
          correct: true,
          accepted: [["bramley"]],
          explanation: null,
          cue_line_index: 1,
          cue_text: "It's Bramley, B-R-A-M-L-E-Y.",
          audio_ms: 12_000,
          near_miss_spelling: false,
        },
        {
          number: 2,
          question_id: "lq_2",
          type: "form_completion",
          instruction: "Write ONE WORD.",
          prompt: "Meeting point",
          options: null,
          word_limit: 2,
          given: "harbor bridge",
          correct: false,
          accepted: [["harbour bridge", "harbor bridge"]],
          explanation: "The agent corrects the meeting point later in the call.",
          cue_line_index: 1,
          cue_text: "We meet at the harbour bridge.",
          audio_ms: 30_000,
          near_miss_spelling: true,
        },
      ],
    },
  ],
};

function renderReview() {
  return render(
    <MemoryRouter initialEntries={["/listening/review/la_1"]}>
      <Routes>
        <Route path="/listening/review/:attemptId" element={<ReviewScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useListeningStore.setState({ review: null, reviewError: null, attempt: null });
  vi.spyOn(api, "get").mockResolvedValue(review);
  vi.spyOn(api, "mediaUrl").mockResolvedValue("blob:audio");
});

describe("ReviewScreen", () => {
  it("shows the learner's answer against the accepted one", async () => {
    renderReview();
    expect(await screen.findByText("Booking a cycling tour", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("harbor bridge")).toBeInTheDocument();
    expect(screen.getByText("harbour bridge / harbor bridge")).toBeInTheDocument();
    expect(screen.getByText("spelling")).toBeInTheDocument();
    expect(screen.getByText(/Raw score only/)).toBeInTheDocument();
  });

  it("offers a jump-to-timestamp replay built from the timing data", async () => {
    renderReview();
    expect(await screen.findByRole("button", { name: "Replay from 0:12" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replay from 0:30" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play from 0:12" })).toBeInTheDocument();
  });

  it("highlights the answer line when a question is selected", async () => {
    renderReview();
    await userEvent.click(await screen.findByRole("button", { name: "Meeting point" }));
    expect(screen.getByText(/Question 2's answer line is highlighted/)).toBeInTheDocument();
  });

  it("sends only missed words to the vocabulary inbox, and says nothing is scheduled", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ ids: ["v1"], items: [], count: 1 });
    renderReview();

    const add = await screen.findByRole("button", { name: "Add to vocabulary" });
    await userEvent.click(add);

    expect(post).toHaveBeenCalledWith("/api/v1/vocab/suggestions", {
      items: [
        {
          term: "harbour bridge",
          sentence_context: "We meet at the harbour bridge.",
          source: { kind: "listening", item_id: "lq_2" },
          card_type: "spelling",
        },
      ],
    });
    expect(await screen.findByText("In your vocabulary inbox")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is scheduled until you accept it there/)).toBeInTheDocument();
  });

  it("says what the letters meant, because a bare 'You wrote B' teaches nothing", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      ...review,
      parts: [
        {
          ...review.parts[0],
          questions: [
            {
              ...review.parts[0].questions[0],
              number: 9,
              question_id: "lq_9",
              type: "multiple_choice",
              prompt: "What must Daniel bring?",
              options: { A: "an apron", B: "a pair of scissors", C: "a bone folder" },
              word_limit: null,
              given: "B",
              correct: false,
              accepted: [["C"]],
              near_miss_spelling: false,
            },
          ],
        },
      ],
    } as ReviewDoc);
    renderReview();
    expect(await screen.findByText("B: a pair of scissors")).toBeInTheDocument();
    expect(screen.getByText("C: a bone folder")).toBeInTheDocument();
  });
});

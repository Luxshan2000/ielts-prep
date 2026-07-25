import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider } from "@/components/ui";
import { api } from "@/lib/api";
import { TestRunner } from "../components/TestRunner";
import { useListeningStore } from "../store";
import type { ListeningTestDetail } from "../types";

const detail: ListeningTestDetail = {
  id: "lt_1",
  title: "Harbour tours",
  source: "pack",
  created_at: "2026-01-01",
  total_questions: 2,
  audio_ready: true,
  parts: [
    {
      id: "ls_1",
      part: 1,
      title: "Booking a cycling tour",
      scenario: "A caller books a tour",
      accent_set: "uk",
      target_band: 6,
      source: "pack",
      speakers: [],
      questions: [
        {
          id: "lq_1",
          number: 1,
          source_number: 1,
          type: "form_completion",
          instruction: "Write ONE WORD AND/OR A NUMBER for each answer.",
          prompt: "Surname: ______",
          options: null,
          select_n: null,
          asset: null,
          word_limit: 2,
          slots: 1,
        },
        {
          id: "lq_2",
          number: 2,
          source_number: 2,
          type: "form_completion",
          instruction: "Write ONE WORD AND/OR A NUMBER for each answer.",
          prompt: "Departure time: ______",
          options: null,
          select_n: null,
          asset: null,
          word_limit: 2,
          slots: 1,
        },
      ],
      audio: {
        audio_hash: "abc",
        expected_audio_hash: "abc",
        ready: true,
        duration_ms: 240_000,
        media_path: "/api/v1/media/listening/abc.wav",
        timing_path: "/api/v1/media/listening/abc.timing.json",
        accent_set: "uk",
        accent_label: "British",
      },
    },
  ],
};

function renderRunner(mode: "exam" | "practice") {
  return render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={[`/listening/test/lt_1?mode=${mode}`]}>
        <Routes>
          <Route path="/listening/test/:testId" element={<TestRunner />} />
          <Route path="/listening/review/:attemptId" element={<p>review screen</p>} />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>,
  );
}

beforeEach(() => {
  useListeningStore.setState({ detail: null, attempt: null, result: null, prepare: {} });
  vi.spyOn(api, "get").mockResolvedValue(detail);
  vi.spyOn(api, "patch").mockResolvedValue({});
  vi.spyOn(api, "mediaUrl").mockResolvedValue("blob:audio");
  vi.spyOn(api, "post").mockImplementation(async (path: string) => {
    if (path.endsWith("/submit")) {
      return {
        attempt_id: "la_1",
        raw_score: 1,
        total_questions: 2,
        band: null,
        per_question: [],
        per_type: {},
        per_part: [],
        near_miss_spellings: [],
        srs_candidates: [],
      };
    }
    return {
      attempt_id: "la_1",
      mode: "exam",
      test_id: "lt_1",
      script_id: null,
      total_questions: 2,
      question_numbers: [1, 2],
      resume_state: { answers: {}, seconds_elapsed: 0, play_count: 0, current_part: 1 },
    };
  });
});

describe("TestRunner — exam mode", () => {
  it("states the one-play rule before the learner starts", async () => {
    renderRunner("exam");
    expect(await screen.findByText("Harbour tours")).toBeInTheDocument();
    expect(screen.getByText(/no pause, no rewind and no replay/)).toBeInTheDocument();
    expect(screen.getByText(/two minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/Spelling is marked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start the test" })).toBeEnabled();
  });

  it("mounts no seek control once the test is running", async () => {
    renderRunner("exam");
    await userEvent.click(await screen.findByRole("button", { name: "Start the test" }));

    expect(await screen.findByText("Plays once")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back 5 seconds/ })).not.toBeInTheDocument();
  });

  it("goes to the check step and submits into the review screen", async () => {
    renderRunner("exam");
    await userEvent.click(await screen.findByRole("button", { name: "Start the test" }));
    await screen.findByText("Plays once");

    await userEvent.type(screen.getByLabelText("Answer for question 1"), "bramley");
    await userEvent.click(screen.getByRole("button", { name: "Go to the check step" }));

    expect(await screen.findByText("Transfer and check")).toBeInTheDocument();
    expect(screen.getByText("1 unanswered")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    await waitFor(() => expect(screen.getByText("review screen")).toBeInTheDocument());
  });
});

describe("TestRunner — practice mode", () => {
  it("offers replay, seeking and speed, and gates the transcript on answering", async () => {
    renderRunner("practice");
    await userEvent.click(await screen.findByRole("button", { name: "Start practising" }));

    expect(await screen.findByRole("slider")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Replay from the start/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Playback speed")).toBeInTheDocument();

    const reveal = screen.getByRole("button", { name: /Reveal transcript for part 1/ });
    expect(reveal).toBeDisabled();
    expect(screen.getByText(/Answer every question in this part first/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Answer for question 1"), "bramley");
    await userEvent.type(screen.getByLabelText("Answer for question 2"), "9.30");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Reveal transcript for part 1/ })).toBeEnabled(),
    );
  });
});

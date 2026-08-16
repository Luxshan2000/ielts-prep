/**
 * The wiring, end to end: three ledgers fetched, folded and drawn as one searchable list.
 *
 * The mapping itself is pinned in `adapt.test.ts`. What is checked here is what the earlier
 * eight-row strip at the foot of the hub could not do — show a mock, an attempt and a drill
 * in the same list, and let a learner narrow it down.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { ...actual.api, get: (path: string) => get(path) } };
});

const { ListeningHistory } = await import("../ListeningHistory");
const { useListeningStore } = await import("../../store");

const TESTS = {
  items: [
    {
      id: "lt_test_1",
      title: "Practice Test 1",
      source: null,
      created_at: null,
      script_ids: [],
      parts: [],
      audio_ready: true,
      audio_ready_parts: 4,
      total_questions: 40,
    },
  ],
  next_cursor: null,
};

const SCRIPTS = {
  items: [
    {
      id: "ls_t1_p1",
      part: 1,
      title: "Booking a village hall",
      accent_set: "uk",
      target_band: null,
      source: null,
      questions: 10,
      audio: { ready: true },
    },
  ],
  next_cursor: null,
};

const ATTEMPTS = {
  items: [
    {
      attempt_id: "la_scored",
      test_id: "lt_test_1",
      script_id: null,
      mode: "exam",
      status: "submitted",
      raw_score: 31,
      total_questions: 40,
      band: 7,
      duration_s: 1800,
      started_at: "2026-07-26T09:00:00.000Z",
      submitted_at: "2026-07-26T09:30:00.000Z",
    },
    {
      attempt_id: "la_walked",
      test_id: null,
      script_id: "ls_t1_p1",
      mode: "practice",
      status: "abandoned",
      raw_score: null,
      total_questions: null,
      band: null,
      duration_s: 120,
      started_at: "2026-07-25T09:00:00.000Z",
      submitted_at: null,
    },
  ],
  next_cursor: null,
};

const MOCKS = {
  items: [
    {
      mock_id: "lm_one",
      attempt_id: "lm_one",
      status: "complete",
      title: "Mock paper — four parts",
      test_id: "lt_test_1",
      created_at: "2026-08-01T09:00:00.000Z",
      started_at: "2026-08-01T09:00:00.000Z",
      finished_at: "2026-08-01T09:34:00.000Z",
      raw_score: 24,
      total_questions: 40,
      band: 6,
    },
  ],
};

const DRILLS = {
  items: [
    {
      session_id: "dr_one",
      kind: "dictation",
      drill_kind: "dictation",
      script_id: "ls_t1_p1",
      part: 1,
      accent_set: "uk",
      mode: null,
      n_items: 8,
      n_correct: 5,
      started_at: "2026-08-02T11:00:00.000Z",
      ended_at: "2026-08-02T11:06:00.000Z",
      duration_s: 360,
    },
  ],
};

function route(path: string): unknown {
  if (path.startsWith("/api/v1/listening/tests")) return TESTS;
  if (path.startsWith("/api/v1/listening/scripts")) return SCRIPTS;
  if (path.startsWith("/api/v1/listening/attempts")) return ATTEMPTS;
  if (path.startsWith("/api/v1/listening/mock/sessions")) return MOCKS;
  if (path.startsWith("/api/v1/listening/practice/sessions")) return DRILLS;
  throw new Error(`unexpected request: ${path}`);
}

beforeEach(() => {
  useListeningStore.setState({ tests: null, scripts: null });
  get.mockImplementation(async (path: string) => route(path));
});

function open() {
  render(
    <MemoryRouter>
      <ListeningHistory />
    </MemoryRouter>,
  );
}

describe("/listening/history", () => {
  it("shows attempts, mock sittings and drills together, each named and scored", async () => {
    open();

    expect(await screen.findByText("Mock paper — four parts")).toBeInTheDocument();
    expect(screen.getByText("Practice Test 1")).toBeInTheDocument();
    expect(screen.getByText("Part 1: Booking a village hall")).toBeInTheDocument();
    expect(screen.getByText("Dictation · Part 1: Booking a village hall")).toBeInTheDocument();

    // Raw scores, not bands: this is an objective paper.
    expect(screen.getByText("31 of 40")).toBeInTheDocument();
    expect(screen.getByText("24 of 40")).toBeInTheDocument();
    expect(screen.getByText("5 of 8")).toBeInTheDocument();
    expect(screen.queryByText(/Band 7/)).not.toBeInTheDocument();

    expect(screen.getByText("4 attempts")).toBeInTheDocument();
  });

  it("filters by what produced the row", async () => {
    open();
    await screen.findByText("Mock paper — four parts");

    await userEvent.click(screen.getByRole("button", { name: /^Drill/ }));
    expect(screen.getByText("Dictation · Part 1: Booking a village hall")).toBeInTheDocument();
    expect(screen.queryByText("Practice Test 1")).not.toBeInTheDocument();
  });

  it("searches across titles", async () => {
    open();
    await screen.findByText("Mock paper — four parts");

    await userEvent.type(screen.getByLabelText("Search your history"), "village");
    await waitFor(() => expect(screen.queryByText("Practice Test 1")).not.toBeInTheDocument());
    expect(screen.getByText("Part 1: Booking a village hall")).toBeInTheDocument();
  });

  it("keeps the list when one ledger fails, and names the ledger that is missing", async () => {
    get.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/listening/practice/sessions")) throw new Error("nope");
      return route(path);
    });
    open();

    expect(await screen.findByText("Practice Test 1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("your drills could not be read");
    expect(screen.queryByText(/Dictation/)).not.toBeInTheDocument();
  });

  it("shows an error, not an empty history, when nothing can be read", async () => {
    get.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/listening/tests") || path.startsWith("/api/v1/listening/scripts")) {
        return route(path);
      }
      throw new Error("sidecar is down");
    });
    open();

    expect(await screen.findByText("Your history could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
  });
});

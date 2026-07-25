import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ConfirmProvider } from "@/components/ui";
import type { CriteriaDoc, HeatmapDoc, ReadinessDoc, SummaryDoc, TrajectoryDoc } from "../types";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: (path: string) => get(path),
      post: (path: string, data?: unknown) => post(path, data),
      put: (path: string, data?: unknown) => put(path, data),
    },
  };
});

const { ProgressPage } = await import("../page");
const { useProgressFeatureStore } = await import("../store");

const summary: SummaryDoc = {
  profile: {
    target_band: 7,
    exam_date: "2026-09-01",
    exam_in_days: 38,
    exam_format: "academic",
    daily_minutes: 60,
    study_days: ["mon", "tue", "wed"],
  },
  disclaimer: "Estimated band — not a guarantee",
  tooltip: "Based on your scored practice attempts.",
  estimates: {
    overall: {
      skill: "overall",
      band: 6.5,
      range_low: 6,
      range_high: 7,
      confidence: "medium",
      n_eff: 5,
      attempts_used: 7,
      newest_attempt_at: null,
      criteria: null,
      method: "estimator",
      stale: false,
      display: "6.5 (likely 6.0–7.0)",
    },
    reading: {
      skill: "reading",
      band: 6.5,
      range_low: 6,
      range_high: 7,
      confidence: "medium",
      n_eff: 4,
      attempts_used: 4,
      newest_attempt_at: null,
      criteria: null,
      method: "estimator",
      stale: false,
      display: "6.5 (likely 6.0–7.0)",
    },
  },
  stale_skills: [],
  needs_placement: false,
  plan_id: "pln_1",
};

function trajectory(skill: string): TrajectoryDoc {
  return {
    skill: skill as TrajectoryDoc["skill"],
    weeks: 12,
    target_band: 7,
    disclaimer: "Estimated band — not a guarantee",
    points: [
      {
        week: "2026-W28",
        at: "2026-07-12T00:00:00Z",
        band: 6,
        range_low: 5.5,
        range_high: 6.5,
        confidence: "medium",
        model_id: null,
      },
      {
        week: "2026-W29",
        at: "2026-07-19T00:00:00Z",
        band: null,
        range_low: null,
        range_high: null,
        confidence: "insufficient",
        model_id: null,
      },
      {
        week: "2026-W30",
        at: "2026-07-26T00:00:00Z",
        band: 6.5,
        range_low: 6,
        range_high: 7,
        confidence: "medium",
        model_id: null,
      },
    ],
  };
}

const writingCriteria: CriteriaDoc = {
  skill: "writing",
  kind: "criteria_radar",
  criteria: { TA: 6, CC: 5, LR: 5.5, GRA: 5.5 },
  band: null,
  disclaimer: "Estimated band — not a guarantee",
};

const heatmap: HeatmapDoc = {
  weeks: 16,
  start: "2026-04-06",
  end: "2026-07-26",
  daily_goal_min: 60,
  cells: [
    { date: "2026-07-20", minutes: 45, level: 2, goal_met: false, is_rest_day: false, future: false },
    { date: "2026-07-21", minutes: 70, level: 3, goal_met: true, is_rest_day: false, future: false },
  ],
};

const readiness: ReadinessDoc = {
  unlocked: true,
  exam_date: "2026-09-01",
  days_out: 38,
  verdict: "nearly",
  auto_done: 5,
  auto_total: 6,
  items: [
    { id: "auto-two-mocks", kind: "auto", label: "At least 2 full mocks completed", checked: true },
    {
      id: "manual-exam-booked",
      kind: "manual",
      label: "Exam booked and documents valid",
      checked: false,
      checked_at: null,
    },
  ],
  disclaimer: "Estimated band — not a guarantee",
  reality_check: false,
};

function mockGet(path: string): Promise<unknown> {
  if (path.startsWith("/api/v1/progress/summary")) return Promise.resolve(summary);
  if (path.startsWith("/api/v1/progress/heatmap")) return Promise.resolve(heatmap);
  if (path.startsWith("/api/v1/readiness")) return Promise.resolve(readiness);
  if (path.startsWith("/api/v1/progress/trajectory")) {
    const skill = new URL(`http://x${path}`).searchParams.get("skill") ?? "overall";
    return Promise.resolve(trajectory(skill));
  }
  if (path.startsWith("/api/v1/progress/criteria")) return Promise.resolve(writingCriteria);
  if (path.startsWith("/api/v1/listening/attempts")) {
    return Promise.resolve({
      items: [
        {
          attempt_id: "la_1",
          test_id: "lt_1",
          script_id: null,
          mode: "mock",
          status: "submitted",
          raw_score: 32,
          total_questions: 40,
          band: 7,
          duration_s: 1800,
          submitted_at: "2026-07-18T10:00:00Z",
        },
      ],
    });
  }
  if (path.startsWith("/api/v1/writing/attempts")) {
    return Promise.resolve({
      items: [
        {
          attempt_id: "ws_1",
          mode: "mock",
          status: "scored",
          overall_band: 6,
          word_count: 268,
          submitted_at: "2026-07-18T12:00:00Z",
        },
      ],
    });
  }
  if (path.startsWith("/api/v1/speaking/sessions")) return Promise.resolve({ items: [] });
  return Promise.resolve({});
}

function renderProgress() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <ProgressPage />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useProgressFeatureStore.setState({
    summary: null,
    trajectories: {},
    criteria: {},
    heatmap: null,
    readiness: null,
    mocks: [],
    initialized: false,
    loading: false,
    weeks: 12,
    errors: {},
    recomputing: false,
    savingItem: null,
    mocksSupported: true,
  });
  get.mockReset();
  post.mockReset();
  put.mockReset();
  get.mockImplementation(mockGet);
});

describe("progress screen", () => {
  it("shows the overall estimate with its range and the target badge", async () => {
    renderProgress();
    expect(await screen.findByText("6.5 (likely 6.0–7.0)")).toBeInTheDocument();
    expect(screen.getByText("Target 7.0")).toBeInTheDocument();
    expect(screen.getAllByText("Estimated band — not a guarantee").length).toBeGreaterThan(0);
  });

  it("offers the trajectory numbers as a table, with insufficient weeks blank", async () => {
    renderProgress();
    const toggle = await screen.findByRole("button", { name: /Show the numbers/ });
    await userEvent.click(toggle);

    const table = screen.getByRole("table", {
      name: /Weekly IELTS band estimate per skill/,
    });
    expect(within(table).getByText("2026-W29")).toBeInTheDocument();
    // Gap weeks render as an em dash rather than an interpolated band.
    expect(within(table).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("stitches a mock history table from the per-module attempt lists", async () => {
    renderProgress();
    const table = await screen.findByRole("table", {
      name: /Completed mock sittings/,
    });
    expect(within(table).getByText("32 / 40 correct")).toBeInTheDocument();
    expect(within(table).getByText("268 words")).toBeInTheDocument();
  });

  it("ticks a manual readiness item through the sidecar", async () => {
    put.mockResolvedValue({ id: "manual-exam-booked", checked: true });
    renderProgress();
    const checkbox = await screen.findByLabelText("Exam booked and documents valid");
    await userEvent.click(checkbox);
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/readiness/manual-exam-booked", {
        checked: true,
      }),
    );
  });

  it("keeps one dead panel from blanking the page", async () => {
    const { ApiError } = await import("@/lib/api");
    get.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/readiness")) {
        return Promise.reject(new ApiError(500, "internal", "readiness exploded"));
      }
      return mockGet(path);
    });
    renderProgress();
    expect(await screen.findByText("The checklist could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("readiness exploded")).toBeInTheDocument();
    // The rest of the page is still there.
    expect(screen.getByText("Band trajectory")).toBeInTheDocument();
  });
});

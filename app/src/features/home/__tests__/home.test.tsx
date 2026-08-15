import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConfirmProvider } from "@/components/ui";
import type { PlanResponse, ProgressSummary } from "../types";

const get = vi.fn();
const post = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: (path: string) => get(path),
      post: (path: string, data?: unknown) => post(path, data),
    },
  };
});

const { HomePage } = await import("../page");
const { useHomeStore } = await import("../store");

function summaryFixture(overrides: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    profile: {
      target_band: 7,
      exam_date: "2026-09-01",
      exam_in_days: 38,
      exam_format: "academic",
      daily_minutes: 60,
      study_days: ["mon", "tue", "wed", "thu", "fri", "sat"],
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
        newest_attempt_at: "2026-07-20T10:00:00Z",
        criteria: null,
        method: "estimator",
        stale: false,
        display: "6.5 (likely 6.0–7.0)",
      },
      writing: {
        skill: "writing",
        band: 5.5,
        range_low: 5,
        range_high: 6,
        confidence: "medium",
        n_eff: 4,
        attempts_used: 4,
        newest_attempt_at: "2026-07-19T10:00:00Z",
        criteria: { TA: 6, CC: 5, LR: 5.5, GRA: 5.5 },
        method: "estimator",
        stale: false,
        display: "5.5 (likely 5.0–6.0)",
      },
    },
    weakest_criteria: [{ skill: "writing", criterion: "CC", band: 5 }],
    callouts: [
      {
        id: "ae_1",
        rule_id: "gra-low-streak",
        description: "3 consecutive low GRA scores → inject grammar micro-lessons",
        fired_at: "2026-07-24T10:00:00Z",
        evidence: { criterion: "GRA", value: 5.5, consecutive: 3 },
        action: { type: "inject_micro_drills", count: 3, activity_tag: "grammar" },
        dismissed_at: null,
      },
    ],
    streak: {
      current: 5,
      longest: 12,
      repaired_dates: [],
      total_minutes_400d: 900,
      today_minutes: 30,
      today_goal_met: false,
      daily_goal_min: 60,
      next_milestone: 7,
    },
    heatmap: { weeks: 16, start: "2026-04-06", end: "2026-07-26", daily_goal_min: 60, cells: [] },
    vocab: { cards: 120, due_today: 14, reviews_7d: 60, retention_7d: 0.91 },
    today: {
      session_id: "ses_1",
      date: new Date().toISOString().slice(0, 10),
      phase: "build",
      duration_min: 60,
      blocks: [
        { kind: "warmup_srs", minutes: 10, params: { max_cards: 20 } },
        { kind: "main", minutes: 40, module: "writing", activity: "task2_essay", params: {} },
        {
          kind: "micro_drill",
          minutes: 10,
          module: "writing",
          activity: "gra_complex_sentences",
          params: { criterion_focus: "GRA" },
        },
      ],
      status: "scheduled",
      minutes_logged: 0,
      current_block: null,
    },
    plan_id: "pln_1",
    milestones_earned: [],
    stale_skills: ["listening"],
    needs_placement: false,
    ...overrides,
  };
}

const planFixture: PlanResponse = { plan: null, today: null, next: null };

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ConfirmProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/onboarding" element={<p>onboarding screen</p>} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useHomeStore.setState({
    summary: null,
    plan: null,
    vocabDue: null,
    loading: false,
    initialized: false,
    error: null,
    dismissing: [],
    generating: false,
    actionError: null,
    busySession: null,
  });
  get.mockReset();
  post.mockReset();
});

describe("dashboard", () => {
  it("renders today's blocks, band estimates with their range, streak and vocab", async () => {
    get.mockImplementation((path: string) =>
      path.startsWith("/api/v1/progress/summary")
        ? Promise.resolve(summaryFixture())
        : Promise.resolve(planFixture),
    );
    renderHome();

    expect(await screen.findByText("Today's session")).toBeInTheDocument();
    expect(screen.getByText("Warm-up — vocabulary review")).toBeInTheDocument();
    expect(screen.getByText("Writing — Task 2 essay")).toBeInTheDocument();
    expect(screen.getByText("Micro-drill — Complex sentences")).toBeInTheDocument();
    // The planner's criterion code is a database key, never a learner-facing word.
    expect(screen.getByText("Works on grammar range and accuracy")).toBeInTheDocument();
    expect(screen.queryByText(/Focus: GRA/)).toBeNull();

    // 10 §6.4: never a band without its range, and never without the disclaimer.
    expect(screen.getByText("Estimated band — not a guarantee")).toBeInTheDocument();
    expect(screen.getByText("6.5 (likely 6.0–7.0)")).toBeInTheDocument();
    expect(screen.getByText("likely 5.0–6.0")).toBeInTheDocument();

    // A skill with no evidence shows an em dash, never a made-up number.
    expect(screen.getAllByText("No estimate yet").length).toBeGreaterThan(0);

    expect(screen.getByText("14")).toBeInTheDocument(); // vocab due today
    expect(screen.getByText("38 days to your test")).toBeInTheDocument();
  });

  it("redirects a profile with no plan to onboarding", async () => {
    get.mockImplementation((path: string) =>
      path.startsWith("/api/v1/progress/summary")
        ? Promise.resolve(summaryFixture({ plan_id: null, today: null }))
        : Promise.resolve(planFixture),
    );
    renderHome();
    expect(await screen.findByText("onboarding screen")).toBeInTheDocument();
  });

  it("does not redirect once onboarding was deferred", async () => {
    window.localStorage.setItem("br-onboarding-skipped", "1");
    get.mockImplementation((path: string) =>
      path.startsWith("/api/v1/progress/summary")
        ? Promise.resolve(summaryFixture({ plan_id: null, today: null }))
        : Promise.resolve(planFixture),
    );
    renderHome();
    expect(await screen.findByText("No study plan yet")).toBeInTheDocument();
  });

  it("dismisses an adaptive callout through the sidecar", async () => {
    get.mockImplementation((path: string) =>
      path.startsWith("/api/v1/progress/summary")
        ? Promise.resolve(summaryFixture())
        : Promise.resolve(planFixture),
    );
    post.mockResolvedValue({ id: "ae_1", dismissed: true });
    renderHome();

    const button = await screen.findByRole("button", { name: /Dismiss callout/ });
    await userEvent.click(button);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/progress/callouts/ae_1/dismiss", undefined),
    );
    expect(screen.queryByRole("button", { name: /Dismiss callout/ })).toBeNull();
  });

  it("shows an honest, retryable error when the local service is unreachable", async () => {
    const { ApiError } = await import("@/lib/api");
    get.mockRejectedValue(new ApiError(0, "sidecar_unreachable", "connection refused"));
    renderHome();
    // "Sidecar" is the process's name in the codebase, not a word a learner has
    // ever seen; the shared ErrorState owns the wording for all ten screens.
    expect(
      await screen.findByText("BandReady's local service isn't responding"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("promises the number of cards the review room will actually serve", async () => {
    // `progress/summary` counts every overdue card and ignores the daily new-card
    // cap; `/vocab/stats` is what the room and the sidebar badge both read.
    get.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/progress/summary")) {
        return Promise.resolve(
          summaryFixture({ vocab: { cards: 151, due_today: 151, reviews_7d: 0, retention_7d: null } }),
        );
      }
      if (path.startsWith("/api/v1/vocab/stats")) return Promise.resolve({ due_today: 20 });
      return Promise.resolve(planFixture);
    });
    renderHome();

    expect(await screen.findByRole("button", { name: "Review 20 cards" })).toBeInTheDocument();
    expect(screen.queryByText("151")).not.toBeNull(); // the deck size is still 151
    expect(screen.queryByRole("button", { name: /Review 151/ })).toBeNull();
  });

  it("explains an unstarted streak instead of drawing three zeroes", async () => {
    get.mockImplementation((path: string) =>
      path.startsWith("/api/v1/progress/summary")
        ? Promise.resolve(
            summaryFixture({
              streak: {
                current: 0,
                longest: 0,
                repaired_dates: [],
                total_minutes_400d: 0,
                today_minutes: 0,
                today_goal_met: false,
                daily_goal_min: 60,
                next_milestone: 7,
              },
            }),
          )
        : Promise.resolve(planFixture),
    );
    renderHome();

    expect(
      await screen.findByText("Your streak starts with your first session"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Longest")).toBeNull();
  });
});

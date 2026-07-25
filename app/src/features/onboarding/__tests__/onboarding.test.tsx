import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ConfirmProvider } from "@/components/ui";
import { DEFAULT_DRAFT, type PlacementStartResponse } from "../types";

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
      mediaUrl: () => Promise.resolve("blob:audio"),
    },
  };
});

const { OnboardingPage } = await import("../page");
const { useOnboardingStore } = await import("../store");

const readingStart: PlacementStartResponse = {
  placement_id: "pl_1",
  profile: {},
  estimated_minutes: 30,
  progress: {
    placement_id: "pl_1",
    step_index: 0,
    step_count: 5,
    done: false,
    sections: ["reading", "listening", "writing", "speaking"],
    skipped: [],
  },
  next: {
    step: "reading_1",
    skill: "reading",
    minutes: 4,
    half: 1,
    skippable: true,
    unavailable: false,
    content: {
      passage_id: "rp_1",
      title: "Urban beekeeping",
      band_target: 6,
      passage: {
        title: "Urban beekeeping",
        texts: [{ id: "t1", paragraphs: [{ id: "p1", text: "Bees have moved to the city." }] }],
        question_groups: [
          {
            id: "g1",
            type: "true_false_notgiven",
            questions: [
              { number: 1, prompt: "City bees produce more honey than rural bees." },
              { number: 2, prompt: "Rooftop hives are illegal in most cities." },
            ],
          },
        ],
      },
      questions: [
        { id: "rq_rp_1_1", number: 1, qtype: "true_false_notgiven", word_limit: null },
        { id: "rq_rp_1_2", number: 2, qtype: "true_false_notgiven", word_limit: null },
      ],
    },
  },
};

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <ConfirmProvider>
        <OnboardingPage />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useOnboardingStore.setState({
    phase: "wizard",
    stepIndex: 0,
    draft: { ...DEFAULT_DRAFT },
    error: null,
    busy: false,
    detect: null,
    detecting: false,
    detectError: null,
    recommended: null,
    artifacts: [],
    downloads: {},
    modelsError: null,
    loadingModels: false,
    placementId: null,
    progress: null,
    step: null,
    estimatedMinutes: null,
    submitting: false,
    result: null,
  });
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({ platform: {}, engines: [] });
});

describe("onboarding wizard", () => {
  it("walks the canonical seven steps and collects the profile", async () => {
    renderWizard();
    expect(screen.getByText("Welcome to BandReady")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Which test, and what are you aiming for?")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/General Training/));

    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Your starting point and your week")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Upper intermediate/));
    await userEvent.click(screen.getByLabelText(/^30 minutes/));

    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("What's already on this machine")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Voice and speech weights")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Microphone check")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Take the placement test?")).toBeInTheDocument();

    const draft = useOnboardingStore.getState().draft;
    expect(draft.exam_format).toBe("general_training");
    expect(draft.self_level).toBe("upper");
    expect(draft.daily_minutes).toBe(30);
  });

  it("blocks Continue until at least three study days are selected", async () => {
    useOnboardingStore.setState({ stepIndex: 2, draft: { ...DEFAULT_DRAFT, study_days: ["mon"] } });
    renderWizard();
    expect(screen.getByText("Select at least three study days.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  it("offers a 'Set up later' escape hatch from step 4 onwards", async () => {
    useOnboardingStore.setState({ stepIndex: 3 });
    renderWizard();
    expect(screen.getByRole("button", { name: "Set up later" })).toBeInTheDocument();
  });

  it("skips placement entirely, writing the profile first then seeding self-rated bands", async () => {
    useOnboardingStore.setState({ stepIndex: 6 });
    post.mockImplementation((path: string) => {
      if (path === "/api/v1/placement/start") return Promise.resolve(readingStart);
      return Promise.resolve({
        estimates: {
          listening: { band: 5.5, skipped: true },
          reading: { band: 5.5, skipped: true },
          writing: { band: 5.5, skipped: true },
          speaking: { band: 5.5, skipped: true },
        },
        confidence: "low",
        plan: {
          plan_id: "pln_1",
          horizon_weeks: 8,
          goal_band: 6.5,
          exam_date: null,
          sessions: [],
          weights_by_week: [],
        },
        nag: "Take the placement test to firm these up.",
      });
    });
    renderWizard();

    await userEvent.click(screen.getByRole("button", { name: /Skip — start from my self-rating/ }));
    await waitFor(() => expect(screen.getByText("You're set up")).toBeInTheDocument());
    expect(post.mock.calls[0][0]).toBe("/api/v1/placement/start");
    expect(post.mock.calls[1][0]).toBe("/api/v1/placement/skip");
    expect(screen.getByText(/Take the placement test to firm these up/)).toBeInTheDocument();
  });

  it("renders the reading sampler and can skip one section on its own", async () => {
    useOnboardingStore.setState({ stepIndex: 6 });
    post.mockImplementation((path: string) => {
      if (path === "/api/v1/placement/start") return Promise.resolve(readingStart);
      if (path === "/api/v1/placement/answer") {
        return Promise.resolve({
          progress: { ...readingStart.progress, step_index: 2, skipped: ["reading"] },
          recorded: "reading_1",
          skipped: true,
          next: null,
        });
      }
      return Promise.resolve({
        estimates: {},
        confidence: "low",
        plan: null,
        disclaimer: "Estimated band — not a guarantee",
      });
    });
    renderWizard();

    await userEvent.click(screen.getByRole("button", { name: /Take the placement test/ }));
    expect(await screen.findByText(/Placement · Reading/)).toBeInTheDocument();
    expect(screen.getByText("Bees have moved to the city.")).toBeInTheDocument();
    expect(screen.getByText("City bees produce more honey than rural bees.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Skip Reading/ }));
    await waitFor(() => expect(screen.getByText("You're set up")).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith(
      "/api/v1/placement/answer",
      expect.objectContaining({ step: "reading_1", skip: true }),
    );
  });

  it("surfaces a placement failure instead of a blank screen", async () => {
    const { ApiError } = await import("@/lib/api");
    useOnboardingStore.setState({ stepIndex: 6 });
    post.mockRejectedValue(new ApiError(409, "conflict", "no placement content installed"));
    renderWizard();
    await userEvent.click(screen.getByRole("button", { name: /Take the placement test/ }));
    expect(await screen.findByText("no placement content installed")).toBeInTheDocument();
  });
});

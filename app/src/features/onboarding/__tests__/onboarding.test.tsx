import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ConfirmProvider } from "@/components/ui";
import { DEFAULT_DRAFT, type PlacementStartResponse } from "../types";

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: (path: string) => get(path),
      post: (path: string, data?: unknown) => post(path, data),
      patch: (path: string, data?: unknown) => patch(path, data),
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
    presets: [],
    scoring: null,
    scoringChecking: false,
    scoringError: null,
    scoringChoice: "later",
    savingScoring: false,
    setupJobs: {},
    manualSetup: {},
    answered: [],
    scoringAtStart: null,
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
  patch.mockReset();
  get.mockResolvedValue({ platform: {}, engines: [] });
  patch.mockResolvedValue({});
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
    expect(screen.getByText("Marking your writing and speaking")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Speaking practice files")).toBeInTheDocument();

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

  // The wording matters as much as the presence: step 1's hatch writes nothing,
  // this one commits the profile and generates a plan. They used to read alike.
  it("offers a 'finish without the placement test' escape hatch from step 2 onwards", async () => {
    useOnboardingStore.setState({ stepIndex: 1 });
    renderWizard();
    expect(
      screen.getByRole("button", { name: "Finish now, skip the placement test" }),
    ).toBeInTheDocument();
  });

  it("offers a distinct, non-committal 'not now' on step 1 only", async () => {
    renderWizard();
    expect(screen.getByRole("button", { name: "Not now — take me to the app" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /placement test/ })).toBeNull();
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
    // The step also verifies the marking provider on mount, so assert on the
    // placement calls rather than on absolute positions.
    const placement = post.mock.calls
      .map((call) => call[0] as string)
      .filter((path) => path.startsWith("/api/v1/placement/"));
    expect(placement).toEqual(["/api/v1/placement/start", "/api/v1/placement/skip"]);
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

  it("gives step 4 a way to act instead of four dead 'not found' rows", async () => {
    useOnboardingStore.setState({
      stepIndex: 3,
      detect: {
        platform: { os: "darwin", arch: "arm64", apple_silicon: true, ram_gb: 16, tier: "16gb" },
        engines: [{ id: "ollama", state: "absent" }],
        setup: {
          ollama: {
            runnable: false,
            kind: "manual",
            url: "https://ollama.com/download",
            instructions: "Install Ollama, then come back — we re-detect automatically.",
          },
        },
      },
      presets: [
        {
          id: "openrouter",
          label: "OpenRouter",
          kind: "cloud",
          modalities: ["llm"],
          needs_key: true,
          base_url: "https://api.deepseek.com/v1",
          suggested_models: ["deepseek-chat"],
        },
      ],
    });
    post.mockResolvedValue({
      ok: false,
      state: "unreachable",
      detail: "could not connect to http://127.0.0.1:11434/v1 — is the server running?",
    });
    renderWizard();

    // Never the sidecar's URL-and-port string; always something to do about it.
    expect(
      await screen.findByText("The model you chose isn't answering — it may not be started yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not connect to http/)).toBeNull();

    await userEvent.click(screen.getByLabelText(/Run a model on this machine/));
    expect(
      screen.getByText("Install Ollama, then come back — we re-detect automatically."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open the download page/ })).toBeInTheDocument();
  });

  it("writes the marking provider the learner picks, then re-verifies it", async () => {
    useOnboardingStore.setState({
      stepIndex: 3,
      scoring: { ok: false, state: "unconfigured" },
      scoringChoice: "cloud",
      presets: [
        {
          id: "openrouter",
          label: "OpenRouter",
          kind: "cloud",
          modalities: ["llm"],
          needs_key: true,
          base_url: "https://api.deepseek.com/v1",
          suggested_models: ["deepseek-chat"],
        },
      ],
    });
    post
      .mockResolvedValueOnce({ ok: false, state: "unconfigured" })
      .mockResolvedValue({ ok: true, state: "ok", models: ["deepseek-chat"] });
    renderWizard();

    await userEvent.type(await screen.findByLabelText(/API key/), "sk-test");
    await userEvent.click(screen.getByRole("button", { name: "Save and check" }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/settings", {
        llm: {
          preset: "openrouter",
          model: "deepseek-chat",
          base_url: "https://api.deepseek.com/v1",
          api_key: "sk-test",
        },
      }),
    );
    await waitFor(() => expect(screen.getByText("Marking is ready.")).toBeInTheDocument());
  });

  it("keeps the profile answers across a reload of the wizard", async () => {
    renderWizard();
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await userEvent.click(screen.getByLabelText(/General Training/));

    // A reload rebuilds the store from localStorage, not from DEFAULT_DRAFT.
    const { draft, step_index } = JSON.parse(
      window.localStorage.getItem("br-onboarding-draft") as string,
    );
    expect(draft.exam_format).toBe("general_training");
    expect(step_index).toBe(1);
  });

  it("does not call a section the learner answered a self-rating", async () => {
    useOnboardingStore.setState({
      phase: "result",
      answered: ["writing"],
      scoringAtStart: false,
      result: {
        estimates: {
          reading: { band: 6, skipped: false },
          writing: { band: 5.5, skipped: true },
          speaking: { band: 5.5, skipped: true },
        },
        confidence: "low",
        plan: null,
      },
    });
    renderWizard();

    expect(
      screen.getByText(
        "You answered this — it could not be marked, so your self-rating stands",
      ),
    ).toBeInTheDocument();
    // Speaking really was skipped, so it keeps the honest self-rating label.
    expect(screen.getByText("From your self-rating")).toBeInTheDocument();
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

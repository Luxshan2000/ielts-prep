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
      // The qtypes and the group rubric are exactly what `content/core-en` ships — the
      // fixture used to say "true_false_notgiven", which matches no pack in the repo.
      passage: {
        title: "Urban beekeeping",
        texts: [{ id: "t1", paragraphs: [{ id: "p1", text: "Bees have moved to the city." }] }],
        question_groups: [
          {
            id: "g1",
            type: "true_false_not_given",
            instructions_extra:
              "Do the following statements agree with the information given in the passage?",
            questions: [
              { number: 1, prompt: "City bees produce more honey than rural bees." },
              { number: 2, prompt: "Rooftop hives are illegal in most cities." },
            ],
          },
          {
            id: "g2",
            type: "sentence_completion",
            questions: [{ number: 3, prompt: "A rooftop hive needs {{gap}} to survive winter." }],
          },
        ],
      },
      questions: [
        { id: "rq_rp_1_1", number: 1, qtype: "true_false_not_given", word_limit: null },
        { id: "rq_rp_1_2", number: 2, qtype: "true_false_not_given", word_limit: null },
        { id: "rq_rp_1_3", number: 3, qtype: "sentence_completion", word_limit: 2 },
      ],
    },
  },
};

const speakingStart: PlacementStartResponse = {
  ...readingStart,
  next: {
    step: "speaking",
    skill: "speaking",
    minutes: 6,
    half: null,
    skippable: true,
    unavailable: false,
    content: {
      card_id: "card_1",
      title: "your work or studies",
      questions: ["Are you working at the moment, or are you still studying?"],
      skippable: true,
    },
  },
};

/** Drive the placement to a given first step and wait for the runner. */
async function startPlacementWith(start: PlacementStartResponse) {
  useOnboardingStore.setState({ stepIndex: 6 });
  post.mockImplementation((path: string) => {
    if (path === "/api/v1/placement/start") return Promise.resolve(start);
    if (path === "/api/v1/placement/answer") {
      return Promise.resolve({ progress: start.progress, next: null });
    }
    return Promise.resolve({ estimates: {}, confidence: "low", plan: null });
  });
  renderWizard();
  await userEvent.click(screen.getByRole("button", { name: /Take the placement test/ }));
}

/** The sitting `GET /placement/next` hands back to an app that was closed mid-placement. */
const resumeStep = {
  progress: { ...readingStart.progress, step_index: 2, skipped: ["reading"] },
  next: {
    step: "writing",
    skill: "writing" as const,
    minutes: 10,
    half: null,
    skippable: true,
    unavailable: false,
    content: { prompt_id: "wp_1", task_type: "ac_task1", prompt_text: "Describe the chart." },
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
    resuming: false,
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
    expect(screen.getByRole("button", { name: "Not now, take me to the app" })).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: /Skip, start from my self-rating/ }));
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
      await screen.findByText("The model you chose isn't answering. It may not be started yet."),
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
        "You answered this, but it could not be marked, so your self-rating stands",
      ),
    ).toBeInTheDocument();
    // Speaking really was skipped, so it keeps the honest self-rating label.
    expect(screen.getByText("From your self-rating")).toBeInTheDocument();
  });

  // A True/False/Not Given item has exactly three answers, and typing anything else scores
  // zero. Four of them open every placement in this build, and they used to be four empty
  // text boxes reading "Type your answer".
  it("gives True / False / Not Given its three answers and says what they mean", async () => {
    useOnboardingStore.setState({ stepIndex: 6 });
    post.mockImplementation((path: string) => {
      if (path === "/api/v1/placement/start") return Promise.resolve(readingStart);
      if (path === "/api/v1/placement/answer") {
        return Promise.resolve({ progress: readingStart.progress, next: null });
      }
      return Promise.resolve({ estimates: {}, confidence: "low", plan: null });
    });
    renderWizard();
    await userEvent.click(screen.getByRole("button", { name: /Take the placement test/ }));
    await screen.findByText(/Placement · Reading/);

    const group = screen.getByRole("radiogroup", { name: "Answer for question 1" });
    expect(group).toBeInTheDocument();
    for (const verdict of ["TRUE", "FALSE", "NOT GIVEN"]) {
      expect(screen.getAllByRole("radio", { name: verdict }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/NOT GIVEN means the passage does not say either way/)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("radio", { name: "TRUE" })[0]);
    await userEvent.click(screen.getByRole("button", { name: /Submit and continue/ }));
    expect(post).toHaveBeenCalledWith(
      "/api/v1/placement/answer",
      expect.objectContaining({ answers: expect.objectContaining({ rq_rp_1_1: "TRUE" }) }),
    );
  });

  it("shows a gap as a blank and the word limit as an instruction, never as pack markup", async () => {
    useOnboardingStore.setState({ stepIndex: 6 });
    post.mockResolvedValue(readingStart);
    renderWizard();
    await userEvent.click(screen.getByRole("button", { name: /Take the placement test/ }));
    await screen.findByText(/Placement · Reading/);

    expect(screen.queryByText(/\{\{gap\}\}/)).toBeNull();
    expect(screen.getByText(/A rooftop hive needs/)).toBeInTheDocument();
    expect(
      screen.getByText("Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer."),
    ).toBeInTheDocument();
  });

  // Closing the app mid-placement used to lose the whole sitting: only the wizard draft was
  // remembered, so reopening restarted at step 1 and abandoned the half-finished sitting the
  // sidecar was still holding.
  it("reopens the placement sitting the app was closed in the middle of", async () => {
    window.localStorage.setItem(
      "br-onboarding-draft",
      JSON.stringify({
        draft: { ...DEFAULT_DRAFT },
        step_index: 6,
        phase: "placement",
        placement_id: "pl_1",
        answered: ["reading"],
        scoring_at_start: true,
        estimated_minutes: 30,
      }),
    );
    // The store reads localStorage at module load, so re-import it under a fresh registry.
    vi.resetModules();
    const page = await import("../page");
    const store = await import("../store");
    get.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/placement/next")) return Promise.resolve(resumeStep);
      return Promise.resolve({ platform: {}, engines: [] });
    });

    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <ConfirmProvider>
          <page.OnboardingPage />
        </ConfirmProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Placement · Writing/)).toBeInTheDocument();
    expect(screen.getByText("Describe the chart.")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/placement/next?placement_id=pl_1");
    // The sections already answered survive too, or the result screen would credit a
    // finished essay to the learner's self-rating.
    expect(store.useOnboardingStore.getState().answered).toEqual(["reading"]);
  });

  it("puts the learner back on the offer when the saved sitting is gone", async () => {
    window.localStorage.setItem(
      "br-onboarding-draft",
      JSON.stringify({ draft: { ...DEFAULT_DRAFT }, step_index: 6, phase: "placement", placement_id: "pl_gone" }),
    );
    vi.resetModules();
    const page = await import("../page");
    const { ApiError } = await import("@/lib/api");
    get.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/placement/next")) {
        return Promise.reject(new ApiError(404, "not_found", "no placement sitting pl_gone"));
      }
      return Promise.resolve({ platform: {}, engines: [] });
    });

    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <ConfirmProvider>
          <page.OnboardingPage />
        </ConfirmProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Take the placement test?")).toBeInTheDocument();
    expect(screen.getByText(/could not be reopened/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Take the placement test/ })).toBeEnabled();
  });

  // Placement runs before the voice models are downloaded, so the typed route is the one
  // most learners take. It has to be whole, not a consolation prize.
  it("keeps the Speaking sampler fully answerable when speech is unavailable", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/speech/capabilities") {
        return Promise.resolve({ transcription: false, fallback: "typing" });
      }
      return Promise.resolve({ platform: {}, engines: [] });
    });
    await startPlacementWith(speakingStart);
    await screen.findByText(/Placement · Speaking/);

    expect(
      await screen.findByText("Type your answers here. Speech is not set up yet"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Answer out loud/ })).toBeNull();

    const box = screen.getByLabelText("Your answer to question 1");
    expect(screen.getByRole("button", { name: /Submit and continue/ })).toBeDisabled();
    await userEvent.type(box, "I am studying engineering at the moment.");
    await userEvent.click(screen.getByRole("button", { name: /Submit and continue/ }));

    expect(post).toHaveBeenCalledWith(
      "/api/v1/placement/answer",
      expect.objectContaining({
        step: "speaking",
        transcript: expect.stringContaining("I am studying engineering at the moment."),
      }),
    );
  });

  it("offers the microphone when speech works, without taking the text box away", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/speech/capabilities") {
        return Promise.resolve({ transcription: true, fallback: "typing" });
      }
      return Promise.resolve({ platform: {}, engines: [] });
    });
    await startPlacementWith(speakingStart);
    await screen.findByText(/Placement · Speaking/);

    expect(await screen.findByRole("button", { name: /Answer out loud/ })).toBeInTheDocument();
    expect(screen.getByText("Say your answers out loud, or type them")).toBeInTheDocument();
    // The typed route stays whole: same box, same submit, no "spoken answers only" wall.
    const box = screen.getByLabelText("Your answer to question 1");
    await userEvent.type(box, "Yes, I work full time.");
    await userEvent.click(screen.getByRole("button", { name: /Submit and continue/ }));
    expect(post).toHaveBeenCalledWith(
      "/api/v1/placement/answer",
      expect.objectContaining({ transcript: expect.stringContaining("Yes, I work full time.") }),
    );
  });

  // The marking model is the one thing BandReady cannot supply itself, so it going down
  // between the last answer and the score is an ordinary Tuesday. It used to leave the
  // learner on "Scoring your placement…" for ever, with no button anywhere on the screen.
  it("offers another go when the final scoring call fails, instead of a stuck spinner", async () => {
    const { ApiError } = await import("@/lib/api");
    useOnboardingStore.setState({ stepIndex: 6 });
    let completes = 0;
    post.mockImplementation((path: string) => {
      if (path === "/api/v1/placement/start") return Promise.resolve(readingStart);
      if (path === "/api/v1/placement/answer") {
        return Promise.resolve({ progress: readingStart.progress, next: null });
      }
      if (path === "/api/v1/placement/complete") {
        completes += 1;
        if (completes === 1) {
          return Promise.reject(new ApiError(503, "provider_error", "the marking model is asleep"));
        }
        return Promise.resolve({ estimates: {}, confidence: "low", plan: null });
      }
      return Promise.resolve({ ok: false, state: "unconfigured" });
    });
    renderWizard();
    await userEvent.click(screen.getByRole("button", { name: /Take the placement test/ }));
    await screen.findByText(/Placement · Reading/);
    await userEvent.click(screen.getByRole("button", { name: /Skip Reading/ }));

    expect(
      await screen.findByText("Your answers could not be scored just yet"),
    ).toBeInTheDocument();
    expect(screen.getByText(/the marking model is asleep/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("You're set up")).toBeInTheDocument());
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

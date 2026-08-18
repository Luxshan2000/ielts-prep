/**
 * Settings, from the point of view of somebody preparing for IELTS.
 *
 * What is pinned here is what had already gone wrong: each job's check has to say something
 * usable for every state the sidecar's Verify actually returns, the three jobs have to be
 * settable independently of each other, a catalogue that cannot be listed must not leave a
 * job unusable, the You tab has to round-trip without firing a request per drag frame or
 * dropping the last one, and the key card has to keep a stored key it is never shown.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConfirmProvider } from "@/components/ui";

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
    },
  };
});

const { ProvidersTab } = await import("../components/ProvidersTab");
const { YouTab } = await import("../components/YouTab");
const { OpenRouterKeyCard } = await import("../components/OpenRouterKeyCard");
const { useSettingsFeatureStore, SECRET_MASK } = await import("../store");
const { useSettingsStore } = await import("@/stores");
type Preset = import("../store").Preset;

const OPENROUTER: Preset = {
  id: "openrouter",
  label: "OpenRouter",
  // Mirrors sidecar/bandready/providers/presets.py: the examiner and speech-to-text, never
  // the voice. A fixture that claims more than the real preset hides exactly the bug these
  // tests exist to catch.
  modalities: ["llm", "stt"],
  kind: "cloud",
  base_url: "https://openrouter.ai/api/v1",
  base_url_locked: true,
  needs_key: true,
  suggested_models: ["anthropic/claude-sonnet-4.5"],
  config_spec: [],
};

const OLLAMA: Preset = {
  id: "ollama",
  label: "Ollama",
  modalities: ["llm"],
  kind: "local-server",
  base_url: "http://127.0.0.1:11434/v1",
  suggested_models: ["qwen3:14b"],
  config_spec: [],
};

const KOKORO: Preset = {
  id: "kokoro",
  label: "Kokoro (local TTS)",
  modalities: ["tts"],
  kind: "local-inproc",
  base_url: "",
  engine: "kokoro_onnx",
  config_spec: [
    {
      key: "voice",
      label: "Voice",
      type: "select",
      group: "connection",
      default: "af_heart",
      options: ["af_heart", "bf_emma"],
    },
  ],
};

const WHISPER: Preset = {
  id: "faster_whisper",
  label: "Local Whisper",
  modalities: ["stt"],
  kind: "local-inproc",
  base_url: "",
  engine: "faster_whisper",
  config_spec: [
    {
      key: "model",
      label: "Model size",
      type: "select",
      group: "connection",
      default: "base",
      options: ["base", "small"],
    },
  ],
};

/** What `GET /api/v1/providers/openrouter/models` answers, per job. */
const CATALOGUE: Record<string, unknown> = {
  llm: {
    modality: "llm",
    recommended: "anthropic/claude-sonnet-4.5",
    models: [
      { id: "anthropic/claude-sonnet-4.5", name: "Anthropic: Claude Sonnet 4.5", voices: [] },
      { id: "google/gemini-2.5-flash", name: "Google: Gemini 2.5 Flash", voices: [] },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Meta: Llama 3.3 70B", voices: [] },
    ],
  },
  tts: {
    modality: "tts",
    recommended: "deepgram/aura-2",
    models: [
      { id: "deepgram/aura-2", name: "Deepgram: Aura-2", voices: ["asteria", "luna", "orion"] },
      { id: "openai/gpt-audio", name: "OpenAI: GPT Audio", voices: ["alloy"] },
    ],
  },
  stt: {
    modality: "stt",
    recommended: "deepgram/nova-3",
    models: [{ id: "deepgram/nova-3", name: "Deepgram: Nova-3", voices: [] }],
  },
};

function catalogueFor(path: string): unknown {
  const modality = new URL(path, "http://x").searchParams.get("modality") ?? "llm";
  return CATALOGUE[modality];
}

function resetStores() {
  useSettingsStore.setState({ doc: null, loading: false, offline: false, error: null });
  useSettingsFeatureStore.setState({
    drafts: { llm: {}, stt: {}, tts: {}, vad: { confidence: 0.5, start_secs: 0.2, stop_secs: 0.6, min_volume: 0 } },
    baseline: { llm: {}, stt: {}, tts: {}, vad: { confidence: 0.5, start_secs: 0.2, stop_secs: 0.6, min_volume: 0 } },
    secretTouched: { llm: false, stt: false, tts: false },
    presets: [OPENROUTER, OLLAMA, KOKORO, WHISPER],
    presetsError: null,
    verify: {},
    verifyError: {},
    verifying: null,
    catalogue: {},
    artifacts: [],
    detectReport: null,
  });
  get.mockReset();
  get.mockImplementation((path: string) => {
    if (path.startsWith("/api/v1/providers/openrouter/models")) {
      return Promise.resolve(catalogueFor(path));
    }
    return Promise.resolve({});
  });
}

beforeEach(resetStores);

/** The section for one job, which is also the thing a screen reader announces. */
function section(title: string): HTMLElement {
  return screen.getByRole("group", { name: title });
}

// -------------------------------------------------------------- each job's own check row

describe("the check card", () => {
  /**
   * The `state` strings are the ones `sidecar/bandready/providers/verify.py` returns —
   * `needs_download` is what a fresh install gets for both audio jobs, because the
   * weights are never bundled.
   */
  const CASES: [string, RegExp][] = [
    ["needs_download", /needs its files downloaded first/i],
    ["unreachable", /start it first/i],
    ["timeout", /took too long/i],
    ["unauthorized", /key was rejected/i],
    ["no_key", /no usable key/i],
    ["unconfigured", /nothing is set up for this yet/i],
    ["error", /answered, but with an error/i],
  ];

  it.each(CASES)("says something to do when the voice check comes back %s", async (state, copy) => {
    useSettingsFeatureStore.setState({
      verify: { tts: { ok: false, state, detail: "raw provider words" } },
    });
    render(<ProvidersTab />);

    const row = section("The voice");
    expect(within(row).getByText(copy)).toBeInTheDocument();
    // and never only the provider's own words
    expect(within(row).getByText(/Reported: raw provider words/)).toBeInTheDocument();
  });

  it("keeps each job's answer inside that job's section", () => {
    useSettingsFeatureStore.setState({
      verify: { tts: { ok: false, state: "no_key" }, llm: { ok: true } },
    });
    render(<ProvidersTab />);
    expect(within(section("The voice")).getByText(/no usable key/i)).toBeInTheDocument();
    expect(within(section("The examiner")).queryByText(/no usable key/i)).not.toBeInTheDocument();
    expect(within(section("The examiner")).getByText("Working")).toBeInTheDocument();
  });

  it("falls back to a sentence when the check request itself threw", () => {
    useSettingsFeatureStore.setState({
      verifyError: { llm: "Verification is not available in this sidecar build." },
    });
    render(<ProvidersTab />);
    expect(
      within(section("The examiner")).getByText(
        "Verification is not available in this sidecar build.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing at all before a check has been run", () => {
    render(<ProvidersTab />);
    expect(screen.queryByText(/could not be reached/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Check" })).toHaveLength(3);
  });
});

// ------------------------------------------------------------------ three jobs, three choices

describe("the three provider sections", () => {
  const openRouterButton = (title: string) =>
    within(section(title)).getByRole("button", { name: /Through OpenRouter/ });
  const localButton = (title: string) =>
    within(section(title)).getByRole("button", { name: /On this computer/ });

  it("sets each job independently, so marking can be remote while the voice stays local", async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    await user.click(openRouterButton("The examiner"));
    await user.click(localButton("The voice"));
    await user.click(localButton("Hearing you"));

    const drafts = useSettingsFeatureStore.getState().drafts;
    expect(drafts.llm.preset).toBe("openrouter");
    expect(drafts.tts.preset).toBe("kokoro");
    expect(drafts.stt.preset).toBe("faster_whisper");
    // and the choice is readable without opening anything
    expect(within(section("The voice")).getByText(/Kokoro/)).toBeInTheDocument();
  });

  it("preselects the model the sidecar recommends", async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    await user.click(openRouterButton("Hearing you"));
    await waitFor(() =>
      expect(useSettingsFeatureStore.getState().drafts.stt.model).toBe("deepgram/nova-3"),
    );
    // Named in plain words where it can be read without opening anything, and marked as
    // the recommendation rather than left as one id among nineteen.
    expect(within(section("Hearing you")).getAllByText(/Deepgram: Nova-3/).length).toBeGreaterThan(
      0,
    );
    expect(within(section("Hearing you")).getByText("Recommended")).toBeInTheDocument();
  });

  /*
   * Removed: "fills the voice list from the model the learner picked".
   *
   * It covered choosing a cloud voice and picking from that model's `supported_voices`, which
   * this release no longer offers — the voice is Kokoro, locally, because listening audio is
   * exam content rather than a per-user preference. The behaviour is gone by decision, so the
   * test goes with it rather than being weakened into passing. If a remote voice returns, this
   * test should return with it, along with an `engine` on the preset.
   * See "the voice" below for what replaced it.
   */

  it("stays usable when the catalogue cannot be listed", async () => {
    const user = userEvent.setup();
    get.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/providers/openrouter/models")) {
        // What the route really answers when OpenRouter is unreachable: no list, an
        // explanation, and still the recommendation.
        return Promise.resolve({
          modality: "stt",
          models: [],
          recommended: "deepgram/nova-3",
          error: "The model list could not be fetched from OpenRouter.",
        });
      }
      return Promise.resolve({});
    });
    render(<ProvidersTab />);

    await user.click(openRouterButton("Hearing you"));
    const row = section("Hearing you");
    expect(
      await within(row).findByText(/The model list could not be fetched from OpenRouter\./),
    ).toBeInTheDocument();
    // The job is still set up and still checkable: the recommendation does not need the list.
    await waitFor(() =>
      expect(useSettingsFeatureStore.getState().drafts.stt.model).toBe("deepgram/nova-3"),
    );
    expect(within(row).getByRole("button", { name: "Try the list again" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Check" })).toBeInTheDocument();
  });

  it("keeps the owner's two marking choices in front of the four-hundred-model list", async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    await user.click(openRouterButton("The examiner"));
    const row = section("The examiner");
    expect(await within(row).findByText("How carefully should it mark?")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: /Quick and cheap/ }));
    expect(useSettingsFeatureStore.getState().drafts.llm.model).toBe("google/gemini-2.5-flash");

    // The full list is there for anybody who wants it, one disclosure away.
    await user.click(within(row).getByRole("button", { name: /Choose a specific model/ }));
    await user.click(within(row).getByRole("button", { name: /Meta: Llama 3\.3 70B/ }));
    expect(useSettingsFeatureStore.getState().drafts.llm.model).toBe(
      "meta-llama/llama-3.3-70b-instruct",
    );
  });

  it("names a provider it can no longer run rather than showing nothing", () => {
    useSettingsFeatureStore.setState({
      drafts: {
        ...useSettingsFeatureStore.getState().drafts,
        stt: { preset: "mlx_whisper", model: "mlx-community/whisper-large-v3-turbo" },
      },
    });
    render(<ProvidersTab />);
    expect(within(section("Hearing you")).getByText(/mlx_whisper/)).toBeInTheDocument();
    expect(
      within(section("Hearing you")).getByText(/no longer runs\. Pick one of the two above\./),
    ).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------------------ You tab

describe("Settings > You", () => {
  beforeEach(() => {
    patch.mockResolvedValue({
      study: { exam_format: "academic", target_band: 7, daily_minutes: 60, study_days: ["mon", "tue", "wed"], srs_new_per_day: 10, show_timer: true },
    });
    useSettingsStore.setState({
      doc: {
        study: {
          exam_format: "general_training",
          target_band: 6.5,
          daily_minutes: 90,
          study_days: ["mon", "wed", "fri"],
          srs_new_per_day: 12,
          show_timer: false,
        },
      },
    });
  });

  it("shows what is actually stored, not the factory defaults", () => {
    render(<YouTab />);
    expect(screen.getByRole("button", { name: /General Training/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "6.5" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /90 minutes/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Wednesday" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tuesday" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("checkbox", { name: /Show the timer/ })).not.toBeChecked();
  });

  it("only offers the session lengths the plan can actually build", () => {
    render(<YouTab />);
    expect(screen.getByRole("button", { name: /30 minutes/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /60 minutes/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /90 minutes/ })).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: /minutes a day/i })).not.toBeInTheDocument();
  });

  it.each([
    [/Academic/, { exam_format: "academic" }],
    ["8.0", { target_band: 8 }],
    [/30 minutes/, { daily_minutes: 30 }],
  ])("round-trips %s to the sidecar", async (name, expected) => {
    const user = userEvent.setup();
    render(<YouTab />);
    await user.click(screen.getByRole("button", { name }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/settings", { study: expected }));
  });

  it("keeps the week in order when a day is added back", async () => {
    const user = userEvent.setup();
    render(<YouTab />);
    await user.click(screen.getByRole("button", { name: "Tuesday" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/settings", {
        study: { study_days: ["mon", "tue", "wed", "fri"] },
      }),
    );
  });

  it("refuses to save a week the planner would silently overrule", async () => {
    const user = userEvent.setup();
    render(<YouTab />);
    await user.click(screen.getByRole("button", { name: "Monday" }));
    expect(await screen.findByText(/Keep at least 3 study days/)).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("the You tab's slider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    patch.mockResolvedValue({ study: {} });
    useSettingsStore.setState({ doc: { study: { srs_new_per_day: 10, study_days: ["mon", "tue", "wed"] } } });
  });
  afterEach(() => vi.useRealTimers());

  it("sends one PATCH for a drag, not one per frame", async () => {
    const { container } = render(<YouTab />);
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    for (const value of ["11", "12", "13", "14", "15"]) {
      act(() => {
        fireEvent.change(slider, { target: { value } });
      });
    }
    expect(patch).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("/api/v1/settings", { study: { srs_new_per_day: 15 } });
  });

  it("does not drop the last change when the tab is left straight away", async () => {
    const { container, unmount } = render(<YouTab />);
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    act(() => {
      fireEvent.change(slider, { target: { value: "22" } });
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(patch).toHaveBeenCalledWith("/api/v1/settings", { study: { srs_new_per_day: 22 } });
  });
});

// ----------------------------------------------------------------- the voice is local

describe("the voice", () => {
  /**
   * Kokoro only, deliberately, and the deliberateness needs pinning.
   *
   * OpenRouter does serve /audio/speech and this preset offered it for a while. Choosing it
   * did nothing: the preset declares no `engine`, the settings PATCH is a deep merge, and an
   * absent key preserves the stored one, so the voice stayed local while the screen said
   * otherwise. Beyond that it is a product decision — listening audio is exam content that
   * should sound the same for every learner, with the accents the papers were written for.
   *
   * The button was looked up by preset id, which finds OpenRouter whatever job is asking. It
   * is looked up among the presets that serve THIS job now, and this test is what stops the
   * by-id version coming back.
   */
  it("offers no cloud provider for the voice, while still offering one for the examiner", () => {
    render(<ProvidersTab />);
    const voice = section("The voice");
    expect(within(voice).getByRole("button", { name: /on this computer/i })).toBeInTheDocument();
    expect(
      within(voice).queryByRole("button", { name: /through openrouter/i }),
    ).not.toBeInTheDocument();

    const examiner = section("The examiner");
    expect(
      within(examiner).getByRole("button", { name: /through openrouter/i }),
    ).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------------ the cloud key

describe("the OpenRouter key card", () => {
  const slots = (llm: Record<string, unknown>, tts: Record<string, unknown> = {}) => {
    const state = useSettingsFeatureStore.getState();
    useSettingsFeatureStore.setState({
      drafts: { ...state.drafts, llm, tts },
      baseline: { ...state.baseline, llm, tts },
    });
  };

  it("shows a stored key as stored, and never echoes the mask into a save", async () => {
    const user = userEvent.setup();
    slots({ preset: "openrouter", api_key: SECRET_MASK });
    render(<OpenRouterKeyCard />);

    expect(screen.getByText("A key is saved")).toBeInTheDocument();
    expect(screen.queryByLabelText("OpenRouter key")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Replace" }));
    const input = screen.getByLabelText("OpenRouter key");
    expect(input).toHaveValue("");

    await user.type(input, "sk-or-new");
    expect(useSettingsFeatureStore.getState().drafts.llm.api_key).toBe("sk-or-new");
    expect(useSettingsFeatureStore.getState().secretTouched.llm).toBe(true);
  });

  it("names a ${VAR} key rather than showing a row of dots for it", () => {
    slots({ preset: "openrouter", api_key: "${OPENROUTER_API_KEY}" });
    render(<OpenRouterKeyCard />);
    expect(screen.getByText("${OPENROUTER_API_KEY}")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paste a key instead" })).toBeInTheDocument();
  });

  it("tells the learner the step that actually keeps the key", () => {
    slots({ preset: "openrouter" });
    render(<OpenRouterKeyCard />);
    expect(screen.getByText(/Save settings/)).toBeInTheDocument();
  });

  it("asks once and gives the key to every job that uses OpenRouter", async () => {
    const user = userEvent.setup();
    slots({ preset: "openrouter" }, { preset: "openrouter" });
    render(<OpenRouterKeyCard />);

    expect(screen.getByText(/the examiner and the voice/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("OpenRouter key"), "sk-or-shared");

    const drafts = useSettingsFeatureStore.getState().drafts;
    expect(drafts.llm.api_key).toBe("sk-or-shared");
    expect(drafts.tts.api_key).toBe("sk-or-shared");
    expect(drafts.stt.api_key).toBeUndefined();
  });

  it("says so when a saved key cannot be copied to a job added later", () => {
    // The renderer only ever sees the mask, and a mask is stripped from every save. Saying
    // "a key is saved" over a job that has none is how somebody gets a rejected key on a
    // screen that told them they were set up.
    slots({ preset: "openrouter", api_key: SECRET_MASK }, { preset: "openrouter", api_key: "" });
    render(<OpenRouterKeyCard />);

    expect(screen.getByLabelText("OpenRouter key")).toBeInTheDocument();
    expect(
      screen.getByText(/A key is saved for the examiner.*so the voice can use it too/s),
    ).toBeInTheDocument();
  });

  it("is not there at all when nothing uses OpenRouter", () => {
    slots({ preset: "ollama", model: "qwen3:14b" }, { preset: "kokoro", voice: "af_heart" });
    const { container } = render(<OpenRouterKeyCard />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ------------------------------------------------------------------- the settings dialog

/**
 * Settings is a dialog mounted by the /settings route, so the things worth pinning are the
 * ones that relationship pays for: a `?tab=` link still lands on the section it names,
 * closing goes back to the screen the learner came from, and the theme is inside here now
 * that the sidebar no longer carries a toggle.
 */
describe("the settings dialog", () => {
  async function renderDialog(entry = "/settings") {
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/settings") return Promise.resolve({ study: { target_band: 7 } });
      if (path.startsWith("/api/v1/providers/presets")) return Promise.resolve({ presets: [] });
      if (path.startsWith("/api/v1/providers/detect"))
        return Promise.resolve({ platform: {}, engines: [] });
      return Promise.resolve({});
    });
    const { SettingsDialog } = await import("../dialog");
    return render(
      <ConfirmProvider>
        {/* Two entries, sitting on the second: the same history a learner has when they
            open Settings from a screen they were already using. */}
        <MemoryRouter initialEntries={["/", entry]} initialIndex={1}>
          <Routes>
            <Route path="/" element={<p>Behind the dialog</p>} />
            <Route path="/settings" element={<SettingsDialog />} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>,
    );
  }

  it("opens on the section the URL asks for", async () => {
    await renderDialog("/settings?tab=you");
    expect(await screen.findByText("Which exam are you taking?")).toBeInTheDocument();
    const rail = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(rail).getByRole("link", { name: "You" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("switches section without leaving the dialog or growing the history", async () => {
    const user = userEvent.setup();
    await renderDialog("/settings?tab=you");
    await screen.findByText("Which exam are you taking?");

    const rail = screen.getByRole("navigation", { name: "Settings sections" });
    await user.click(within(rail).getByRole("link", { name: "About" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Which exam are you taking?")).not.toBeInTheDocument();

    // Back has to close the dialog, not walk back through the sections, so section links
    // replace the entry rather than pushing a new one.
    await user.keyboard("{Escape}");
    expect(await screen.findByText("Behind the dialog")).toBeInTheDocument();
  });

  it("closes on Escape, back onto the screen it was opened from", async () => {
    const user = userEvent.setup();
    await renderDialog();
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    expect(await screen.findByText("Behind the dialog")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes from the header control too", async () => {
    const user = userEvent.setup();
    await renderDialog();
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(await screen.findByText("Behind the dialog")).toBeInTheDocument();
  });

  it("keeps the keyboard inside the dialog", async () => {
    const user = userEvent.setup();
    await renderDialog("/settings?tab=about");
    const dialog = await screen.findByRole("dialog");

    expect(dialog.contains(document.activeElement)).toBe(true);
    // Far enough round to have fallen out of the panel if nothing were holding the focus.
    for (let i = 0; i < 12; i += 1) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("holds the theme control, which the sidebar no longer does", async () => {
    await renderDialog("/settings?tab=appearance");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Dark" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Light" })).toBeInTheDocument();

    // Appearance is first in the rail because the theme used to be one click away in the
    // sidebar and is now three: Settings, Appearance, then the theme itself.
    const rail = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(rail).getAllByRole("link")[0]).toHaveTextContent("Appearance");
  });

  it("asks before closing on unsaved provider edits", async () => {
    const user = userEvent.setup();
    useSettingsFeatureStore.setState({
      drafts: {
        ...useSettingsFeatureStore.getState().drafts,
        llm: { preset: "openrouter", model: "anthropic/claude-sonnet-4.5" },
      },
    });
    await renderDialog();
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    expect(await screen.findByText("Close settings without saving?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() =>
      expect(screen.queryByText("Close settings without saving?")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Behind the dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "Close settings" }));
    expect(await screen.findByText("Behind the dialog")).toBeInTheDocument();
    // Leaving is not discarding: the edits are still there to come back to.
    expect(useSettingsFeatureStore.getState().isDirty()).toBe(true);
  });
});

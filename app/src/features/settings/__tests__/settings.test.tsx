/**
 * Settings, from the point of view of somebody preparing for IELTS.
 *
 * Three things are checked here because all three had already gone wrong: the check card
 * has to say something usable for every state the sidecar's Verify actually returns, the
 * You tab has to round-trip to the sidecar without firing a request per drag frame or
 * dropping the last one, and the cloud key card has to keep a stored key it is not shown.
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

const { SimpleSetup } = await import("../components/SimpleSetup");
const { YouTab } = await import("../components/YouTab");
const { CloudKeyCard } = await import("../components/CloudKeyCard");
const { useSettingsFeatureStore, SECRET_MASK } = await import("../store");
const { useSettingsStore } = await import("@/stores");

const OPENROUTER = {
  id: "openrouter",
  label: "OpenRouter",
  modalities: ["llm" as const],
  kind: "cloud",
  base_url: "https://openrouter.ai/api/v1",
  needs_key: true,
  suggested_models: ["anthropic/claude-sonnet-4.5"],
  config_spec: [],
};

function resetStores() {
  useSettingsStore.setState({ doc: null, loading: false, offline: false, error: null });
  useSettingsFeatureStore.setState({
    drafts: { llm: {}, stt: {}, tts: {}, vad: { confidence: 0.5, start_secs: 0.2, stop_secs: 0.6, min_volume: 0 } },
    baseline: { llm: {}, stt: {}, tts: {}, vad: { confidence: 0.5, start_secs: 0.2, stop_secs: 0.6, min_volume: 0 } },
    secretTouched: { llm: false, stt: false, tts: false },
    presets: [OPENROUTER],
    verify: {},
    verifyError: {},
    verifying: null,
    recommended: [],
  });
}

beforeEach(resetStores);

// --------------------------------------------------------------- the three-job check card

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
    render(<SimpleSetup onAdvanced={() => {}} />);

    const row = screen.getByText("The voice").closest("div") as HTMLElement;
    expect(within(row).getByText(copy)).toBeInTheDocument();
    // and never only the provider's own words
    expect(within(row).getByText(/Reported: raw provider words/)).toBeInTheDocument();
  });

  it("falls back to a sentence when the check request itself threw", () => {
    useSettingsFeatureStore.setState({
      verifyError: { llm: "Verification is not available in this sidecar build." },
    });
    render(<SimpleSetup onAdvanced={() => {}} />);
    expect(
      screen.getByText("Verification is not available in this sidecar build."),
    ).toBeInTheDocument();
  });

  it("says nothing at all before a check has been run", () => {
    render(<SimpleSetup onAdvanced={() => {}} />);
    expect(screen.queryByText(/could not be reached/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Check" })).toHaveLength(3);
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

// ------------------------------------------------------------------------ the cloud key

describe("the cloud key card", () => {
  it("shows a stored key as stored, and never echoes the mask into a save", async () => {
    const user = userEvent.setup();
    useSettingsFeatureStore.setState({
      drafts: { ...useSettingsFeatureStore.getState().drafts, llm: { preset: "openrouter", api_key: SECRET_MASK } },
      baseline: { ...useSettingsFeatureStore.getState().baseline, llm: { preset: "openrouter", api_key: SECRET_MASK } },
    });
    render(<CloudKeyCard />);

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
    useSettingsFeatureStore.setState({
      drafts: { ...useSettingsFeatureStore.getState().drafts, llm: { preset: "openrouter", api_key: "${OPENROUTER_API_KEY}" } },
    });
    render(<CloudKeyCard />);
    expect(screen.getByText("${OPENROUTER_API_KEY}")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paste a key instead" })).toBeInTheDocument();
  });

  it("tells the learner the step that actually keeps the key", () => {
    render(<CloudKeyCard />);
    expect(screen.getByText(/Save settings/)).toBeInTheDocument();
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

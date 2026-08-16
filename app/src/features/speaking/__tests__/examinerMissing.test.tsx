/**
 * A band nobody can produce must not be promised.
 *
 * The examiner and the marker are the same language model. `voice_available` only
 * answers "is Pipecat importable", so with no model configured the hub used to show
 * "Counts toward your band", enable Start, connect a session that then sat in silence,
 * and leave the learner to work out afterwards that there was never going to be a
 * report. The mock pre-flight was worse: eleven minutes of a timed test first.
 *
 * `GET /api/v1/speaking/engine` now answers `examiner_available` / `examiner_reason`,
 * and these are the two screens that have to act on it.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { ...actual.api, get: (...args: unknown[]) => get(...args) },
  };
});

const { SpeakingHome } = await import("../page");
const { MockPreflight } = await import("../components/mock");

const REASON =
  "No language model has been chosen yet, so nothing can ask you questions or mark " +
  "your answers. Open Settings → Providers and pick one.";

function engineDoc(examinerAvailable: boolean | undefined) {
  return {
    voice_available: true,
    ...(examinerAvailable === undefined
      ? {}
      : {
          examiner_available: examinerAvailable,
          examiner_reason: examinerAvailable ? null : REASON,
        }),
    vad: {},
    live_session_id: null,
  };
}

/** The hub and the pre-flight both load the engine doc plus other collections. */
function route(url: string, examinerAvailable: boolean | undefined) {
  if (String(url).includes("/speaking/engine")) {
    return Promise.resolve(engineDoc(examinerAvailable));
  }
  return Promise.resolve({ items: [] });
}

function renderScreen(
  which: "hub" | "mock",
  examinerAvailable: boolean | undefined,
) {
  get.mockImplementation((url: string) => route(url, examinerAvailable));
  const path = which === "hub" ? "/speaking" : "/speaking/mock";
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/speaking" element={<SpeakingHome />} />
        <Route path="/speaking/mock" element={<MockPreflight />} />
        <Route path="/settings" element={<p>Settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe("Speaking hub with no marking model", () => {
  it("says so, and does not claim the session counts toward a band", async () => {
    renderScreen("hub", false);
    expect(await screen.findByText(REASON)).toBeInTheDocument();
    expect(screen.queryByText("Counts toward your band")).not.toBeInTheDocument();
    expect(screen.getByText("Not set up yet")).toBeInTheDocument();
  });

  it("disables the start button and points at the screen that fixes it", async () => {
    renderScreen("hub", false);
    await screen.findByText(REASON);
    expect(screen.getByRole("button", { name: /Set up the mock test|Start /i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Set up the examiner/i })).toBeEnabled();
  });

  it("keeps its promise when a model IS configured", async () => {
    renderScreen("hub", true);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Counts toward your band")).toBeInTheDocument(),
    );
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });

  it("does not block on an older sidecar that omits the field", async () => {
    renderScreen("hub", undefined);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Counts toward your band")).toBeInTheDocument(),
    );
  });
});

describe("Mock pre-flight with no marking model", () => {
  it("refuses to start eleven minutes of a test that cannot be scored", async () => {
    renderScreen("mock", false);
    expect(await screen.findByText(REASON)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start the mock test/i })).toBeDisabled();
    expect(screen.queryByText("Counts toward your band trend")).not.toBeInTheDocument();
  });

  it("still offers the mock when a model is configured", async () => {
    renderScreen("mock", true);
    await waitFor(() =>
      expect(screen.getByText("Counts toward your band trend")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Start the mock test/i })).toBeEnabled();
  });
});

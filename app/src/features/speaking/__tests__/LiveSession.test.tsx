import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConfirmProvider } from "@/components/ui";
import { ApiError } from "@/lib/api";

const get = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: (...args: unknown[]) => get(...args),
      contract: () => Promise.resolve({ baseUrl: "http://127.0.0.1:8710", token: "t" }),
    },
  };
});

// The WebRTC stack never loads in jsdom; these paths are exactly the ones that must
// work *without* it.
vi.mock("@pipecat-ai/small-webrtc-transport", () => ({
  SmallWebRTCTransport: class {},
}));
vi.mock("@pipecat-ai/client-js", () => ({
  PipecatClient: class {
    initDevices = () => Promise.resolve();
    connect = () => Promise.resolve();
    disconnect = () => Promise.resolve();
  },
  RTVIEvent: {},
}));
vi.mock("@pipecat-ai/client-react", () => ({
  PipecatClientAudio: () => null,
  PipecatClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRTVIClientEvent: () => undefined,
  usePipecatClient: () => undefined,
  usePipecatClientMediaTrack: () => null,
  usePipecatClientTransportState: () => "disconnected",
  usePipecatConversation: () => ({ messages: [] }),
}));

const { LiveSession } = await import("../LiveSession");

function renderAt(sessionId = "ss_1") {
  return render(
    <MemoryRouter initialEntries={[`/speaking/session/${sessionId}`]}>
      <ConfirmProvider>
        <Routes>
          <Route path="/speaking/session/:sessionId" element={<LiveSession />} />
          <Route path="/speaking" element={<p>Speaking hub</p>} />
          <Route path="/speaking/report/:reportId" element={<p>Report screen</p>} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe("LiveSession", () => {
  it("explains a finished session instead of spinning forever", async () => {
    get.mockResolvedValue({
      id: "ss_1",
      mode: "mock",
      activity: "full_mock",
      part: null,
      card_set_id: null,
      state: "ABORTED",
      status: "aborted",
      overall_band: null,
      started_at: null,
      ended_at: null,
      duration_s: null,
      live: false,
      report_id: null,
    });
    renderAt();

    expect(await screen.findByText("This session isn't live")).toBeInTheDocument();
    expect(screen.getByText(/already finished/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Speaking" })).toBeInTheDocument();
  });

  it("redirects a scored session straight to its report", async () => {
    get.mockResolvedValue({
      id: "ss_2",
      mode: "mock",
      activity: "full_mock",
      part: null,
      card_set_id: null,
      state: "FEEDBACK",
      status: "complete",
      overall_band: 6.5,
      started_at: null,
      ended_at: null,
      duration_s: 700,
      live: false,
      report_id: "sr_9",
    });
    renderAt("ss_2");

    expect(await screen.findByText("Report screen")).toBeInTheDocument();
  });

  it("surfaces a 404 with a way out", async () => {
    get.mockRejectedValue(new ApiError(404, "not_found", "no speaking session with that id"));
    renderAt("ss_missing");

    expect(await screen.findByText(/doesn't exist any more/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Speaking" })).toBeInTheDocument();
  });
});

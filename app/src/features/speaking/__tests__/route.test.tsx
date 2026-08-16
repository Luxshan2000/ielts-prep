import { describe, expect, it, vi } from "vitest";

// The route module pulls in the live-call component, which imports the WebRTC stack.
vi.mock("@pipecat-ai/small-webrtc-transport", () => ({
  SmallWebRTCTransport: class {},
  // PlainMicMediaManager extends this at module load, so the mock must export it even in
  // tests that never place a call.
  MediaManager: class {},
}));
vi.mock("@pipecat-ai/client-js", () => ({ PipecatClient: class {}, RTVIEvent: {} }));
vi.mock("@pipecat-ai/client-react", () => ({
  PipecatClientAudio: () => null,
  PipecatClientProvider: () => null,
  useRTVIClientEvent: () => undefined,
  usePipecatClient: () => undefined,
  usePipecatClientMediaTrack: () => null,
  usePipecatClientTransportState: () => "disconnected",
  usePipecatConversation: () => ({ messages: [] }),
}));

const route = (await import("../route")).default;

describe("speaking route contract", () => {
  it("registers itself in the sidebar at /speaking", () => {
    expect(route.path).toBe("/speaking");
    expect(route.label).toBe("Speaking");
    expect(route.icon).toBeTruthy();
    expect(route.order).toBe(50);
    expect(route.element).toBeTruthy();
  });

  it("exposes the child paths the hub and history screens navigate to", () => {
    const paths = (route.children ?? []).map((c) => (c.index ? "<index>" : c.path));
    expect(paths).toEqual([
      "<index>",
      "session/:sessionId",
      "session/:sessionId/transcript",
      "report/:reportId",
      "history",
      "coach",
      "coach/:cardSetId",
      "mock",
      "mock/sitting/:sessionId",
      "mock/report/:reportId",
      "mock/history",
    ]);
    for (const child of route.children ?? []) expect(child.element).toBeTruthy();
  });

  it("matches the transcript route rather than swallowing it into the live call", async () => {
    // `session/:sessionId` and `session/:sessionId/transcript` are siblings, so this
    // depends on the router ranking the longer, statically-ended path higher. If it ever
    // stops doing that, every history row for an unscored session opens a dead live call.
    const { matchRoutes } = await import("react-router-dom");
    // The feature's own child type is structurally a RouteObject plus the sidebar
    // metadata the router never sees.
    const tree = [
      { path: route.path, children: route.children },
    ] as unknown as Parameters<typeof matchRoutes>[0];
    const matched = matchRoutes(tree, "/speaking/session/ss_1/transcript");
    expect(matched?.at(-1)?.route.path).toBe("session/:sessionId/transcript");
    expect(matchRoutes(tree, "/speaking/session/ss_1")?.at(-1)?.route.path).toBe(
      "session/:sessionId",
    );
    expect(matchRoutes(tree, "/speaking/history")?.at(-1)?.route.path).toBe("history");
  });
});

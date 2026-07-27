import { describe, expect, it, vi } from "vitest";

// The route module pulls in the live-call component, which imports the WebRTC stack.
vi.mock("@pipecat-ai/small-webrtc-transport", () => ({ SmallWebRTCTransport: class {} }));
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
    expect(route.order).toBe(20);
    expect(route.element).toBeTruthy();
  });

  it("exposes the child paths the hub and history screens navigate to", () => {
    const paths = (route.children ?? []).map((c) => (c.index ? "<index>" : c.path));
    expect(paths).toEqual([
      "<index>",
      "session/:sessionId",
      "report/:reportId",
      "coach",
      "coach/:cardSetId",
      "mock",
      "mock/sitting/:sessionId",
      "mock/report/:reportId",
      "mock/history",
    ]);
    for (const child of route.children ?? []) expect(child.element).toBeTruthy();
  });
});

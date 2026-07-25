import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom ships neither matchMedia nor rAF-friendly defaults; the design system's
// reduced-motion checks and count-up animations rely on both.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// jsdom implements neither blob URL helper. Anything that plays audio from a Blob —
// the TTS preview, the pipecat WebRTC transport's WavStreamPlayer, listening playback —
// throws at *module scope* without them, which fails the whole suite rather than a test.
// Plain functions, not vi.fn(): `restoreMocks: true` would strip a mock implementation.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:bandready/test";
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => undefined;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

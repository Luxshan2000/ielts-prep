/**
 * Production-hardening regressions (G2).
 *
 * Each case here corresponds to a first-run or failure path that used to be silent:
 * a provider that is not configured, a sidecar that went away and came back, a timer
 * or a band score that a screen reader could not perceive.
 */

import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { failureKind, friendlyMessage, isProviderFailure } from "@/lib/errors";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { BandScore, CircularTimer, ErrorState, QuestionPalette } from "@/components/ui";
import { ProviderStatusBanner } from "@/components/shell/ProviderStatusBanner";
import { useSessionStore } from "@/stores";

describe("failure classification", () => {
  it("treats a thrown fetch as offline, not as a server error", () => {
    expect(failureKind(new ApiError(0, "sidecar_unreachable", "boom"))).toBe("offline");
  });

  it("treats 502/503 and the provider codes as a provider failure", () => {
    expect(isProviderFailure(new ApiError(502, "provider_error", "no model"))).toBe(true);
    expect(isProviderFailure(new ApiError(503, "internal", "engine missing"))).toBe(true);
    expect(isProviderFailure(new ApiError(404, "not_found", "gone"))).toBe(false);
    expect(isProviderFailure(new Error("plain"))).toBe(false);
  });

  it("keeps the sidecar's own words and adds the one clause that names the fix", () => {
    const msg = friendlyMessage(
      new ApiError(502, "provider_error", "could not reach the language model at 127.0.0.1:11434"),
      "fallback",
    );
    expect(msg).toContain("could not reach the language model");
    expect(msg).toContain("Settings");
  });

  it("does not repeat itself when the server already mentioned Settings", () => {
    const msg = friendlyMessage(
      new ApiError(503, "provider_error", "pick a TTS engine in Settings first"),
      "fallback",
    );
    expect(msg.match(/Settings/g)).toHaveLength(1);
  });

  it("replaces a raw transport message with something a learner can act on", () => {
    const msg = friendlyMessage(new ApiError(0, "sidecar_unreachable", "Failed to fetch"), "x");
    expect(msg).not.toContain("Failed to fetch");
    expect(msg).toContain("isn't responding");
  });

  it("uses the caller's fallback only when the error carries no detail", () => {
    expect(friendlyMessage({}, "the prompt bank could not be loaded")).toBe(
      "the prompt bank could not be loaded",
    );
  });
});

describe("ErrorState", () => {
  it("offers Settings for a provider failure and only a retry otherwise", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ErrorState error={new ApiError(502, "provider_error", "no model running")} onRetry={onRetry} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open settings/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<ErrorState error={new ApiError(500, "internal", "boom")} onRetry={onRetry} />);
    expect(screen.queryByRole("button", { name: /open settings/i })).toBeNull();
  });

  it("always shows the server's detail rather than a generic apology", () => {
    render(<ErrorState error={new ApiError(500, "internal", "alembic head mismatch")} />);
    expect(screen.getByText(/alembic head mismatch/)).toBeInTheDocument();
  });
});

describe("ProviderStatusBanner", () => {
  it("raises itself on any provider failure and can be dismissed", async () => {
    render(
      <MemoryRouter>
        <ProviderStatusBanner />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/couldn't reach a model provider/i)).toBeNull();

    // The banner subscribed to the transport on mount, so drive it the way the app
    // does: a real request, from an unrelated feature, that comes back 502.
    const { api } = await import("@/lib/api");
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ code: "provider_error", detail: "ollama is not running" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    await act(async () => {
      await api.get("/api/v1/writing/prompts").catch(() => undefined);
    });
    globalThis.fetch = original;

    expect(await screen.findByText(/couldn't reach a model provider/i)).toBeInTheDocument();
    expect(screen.getByText(/ollama is not running/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /dismiss the provider notice/i }));
    expect(screen.queryByText(/couldn't reach a model provider/i)).toBeNull();
  });
});

describe("useSidecarRecovery", () => {
  beforeEach(() => {
    useSessionStore.setState({ generation: 0 });
  });

  it("refetches once the sidecar comes back, and not on mount", () => {
    const reload = vi.fn();
    renderHook(() => useSidecarRecovery(reload));
    expect(reload).not.toHaveBeenCalled();

    act(() => {
      useSessionStore.setState({ generation: 1 });
    });
    expect(reload).toHaveBeenCalledOnce();

    act(() => {
      useSessionStore.setState({ generation: 2 });
    });
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not fire for a screen mounted after the recovery", () => {
    useSessionStore.setState({ generation: 7 });
    const reload = vi.fn();
    renderHook(() => useSidecarRecovery(reload));
    expect(reload).not.toHaveBeenCalled();
  });

  it("survives an inline callback that changes identity every render", () => {
    const reload = vi.fn();
    function Screen() {
      const [, force] = useState(0);
      useSidecarRecovery(() => reload());
      return <button onClick={() => force((n) => n + 1)}>rerender</button>;
    }
    render(<Screen />);
    act(() => {
      useSessionStore.setState({ generation: 1 });
    });
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe("accessibility of the exam primitives", () => {
  it("announces the timer at milestones, not once a second", () => {
    const { rerender, container } = render(
      <CircularTimer totalSec={1200} remainingSec={1200} label="Reading test" />,
    );
    const live = () =>
      container.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? "";

    // 20:00 of a 20-minute test: the 30-minute milestone must not fire.
    expect(live()).toBe("");

    rerender(<CircularTimer totalSec={1200} remainingSec={901} label="Reading test" />);
    expect(live()).toBe("");

    rerender(<CircularTimer totalSec={1200} remainingSec={900} label="Reading test" />);
    expect(live()).toBe("Reading test: 15:00 remaining");

    // Between milestones the region's text does not change, so nothing is re-read.
    rerender(<CircularTimer totalSec={1200} remainingSec={880} label="Reading test" />);
    expect(live()).toBe("Reading test: 15:00 remaining");

    rerender(<CircularTimer totalSec={1200} remainingSec={0} label="Reading test" />);
    expect(live()).toBe("Reading test: time is up");
  });

  it("gives the band badge a role so its label is actually exposed", () => {
    render(<BandScore band={7} label="Fluency" />);
    expect(screen.getByRole("img", { name: "Band 7.0, Fluency" })).toBeInTheDocument();
  });

  it("moves real focus with the palette's arrow keys, so the ring follows aria-current", async () => {
    function Palette() {
      const [current, setCurrent] = useState(1);
      return <QuestionPalette count={5} current={current} status={{}} onJump={setCurrent} />;
    }
    render(<Palette />);
    const q1 = screen.getByRole("button", { name: /^Question 1,/ });
    q1.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /^Question 2,/ })).toHaveFocus();

    await userEvent.keyboard("{End}");
    expect(screen.getByRole("button", { name: /^Question 5,/ })).toHaveFocus();

    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("button", { name: /^Question 1,/ })).toHaveFocus();
  });
});

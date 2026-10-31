/**
 * A paper that is still rendering must come back as itself, not as a running sitting.
 *
 * The render card used to hang off `preparingId`, local state set only by opening a
 * paper on this screen. Reload, step away, or restart the app while the four parts
 * rendered, and the card and its polling were gone: the paper came back through the
 * "you already have a paper open" banner, which says its clock has been running — the
 * opposite of a paper whose clock has not started. That banner is for `in_progress`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { ...actual.api, get: (path: string) => get(path) } };
});

const { MockPreflight, useMockStore } = await import("..");

function part(position: number, ready: boolean) {
  return {
    position,
    script_id: `ls_${position}`,
    title: `Part ${position}`,
    ready,
    duration_ms: ready ? 221_000 : 0,
    audio_hash: ready ? `h${position}` : null,
  };
}

/** The `GET /sessions/{id}` fields the pre-flight reads, for a paper half rendered. */
function preparingSession(status: "preparing" | "in_progress") {
  return {
    mock_id: "lm_1",
    status,
    resume_state: { answers: {} },
    report: null,
    audio: {
      ready: false,
      ready_parts: 2,
      total_parts: 4,
      pct: 50,
      parts: [part(1, true), part(2, true), part(3, false), part(4, false)],
      job_id: "job_1",
      job_state: "running",
      job_progress_pct: 50,
      job_detail: "rendering part 1 of 2",
      job_error: null,
      note: "",
    },
  };
}

function serve(status: "preparing" | "in_progress") {
  get.mockImplementation((path: string) => {
    // The plan stays loading; it is not what this test is about.
    if (path.includes("/mock/plan")) return new Promise(() => {});
    if (path.includes("/mock/sessions?")) {
      return Promise.resolve({ items: [{ mock_id: "lm_1", status }], trajectory: [] });
    }
    if (path.includes("/mock/sessions/lm_1")) return Promise.resolve(preparingSession(status));
    return Promise.resolve({});
  });
}

beforeEach(() => {
  get.mockReset();
  useMockStore.setState({ session: null, history: null, plan: null });
});

describe("the listening mock pre-flight", () => {
  it("picks a still-rendering paper back up with its progress, and says the clock has not started", async () => {
    serve("preparing");
    render(
      <MemoryRouter>
        <MockPreflight />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "2 of 4 parts rendered",
    );
    expect(screen.getByText("Synthesizing the recordings")).toBeInTheDocument();
    expect(screen.queryByText(/clock has\s+been running/)).not.toBeInTheDocument();
  });

  it("still warns about a sitting whose clock really is running", async () => {
    serve("in_progress");
    render(
      <MemoryRouter>
        <MockPreflight />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/You already have a paper open/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

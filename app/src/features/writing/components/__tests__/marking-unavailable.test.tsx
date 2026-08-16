/**
 * The state most people are actually in: BandReady installed, no marking model.
 *
 * The shipped default `llm` slot points at a local Ollama on 127.0.0.1:11434 that
 * nobody has installed, so `POST /providers/verify` comes back `unreachable`. Before
 * these tests the writing desk found that out only at Submit — after forty minutes of
 * essay, or an hour of mock paper — and the mock report then blamed the fifty-word
 * minimum for it.
 *
 * What is asserted here is the promise, not the wording: the screens that ask for the
 * time say up front that nothing can mark it, they point at Settings, and they never
 * produce a band.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const post = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  const fail = () => Promise.reject(new actual.ApiError(0, "sidecar_unreachable", "offline"));
  return {
    ...actual,
    api: {
      ...actual.api,
      get: fail,
      patch: fail,
      put: fail,
      del: fail,
      post: (...args: unknown[]) => post(...args),
    },
  };
});

import { MarkingNotice } from "../MarkingNotice";
import { StartAttemptModal } from "../StartAttemptModal";
import { describeVerify, useMarkingStatus } from "../../markingStatus";
import { unmarkedReason } from "../mock/analysis";
import type { WritingAttempt, WritingPrompt } from "../../store";

const UNREACHABLE = {
  ok: false,
  state: "unreachable",
  detail: "could not connect to http://127.0.0.1:11434/v1 — is the server running?",
  models: [],
  warnings: [],
};

const prompt: WritingPrompt = {
  id: "wp_1",
  task_type: "task2",
  task_label: "Writing Task 2 (essay)",
  genre: "opinion",
  difficulty: 2,
  topic_id: null,
  topic_tags: [],
  prompt_text: "Some people believe university should be free. Discuss.",
  chart_spec: null,
  letter_bullets: [],
  min_words: 250,
  time_limit_s: 2400,
  source: "pack",
  license: null,
  retired: false,
  created_at: null,
};

function resetStatus() {
  useMarkingStatus.setState({ state: "unknown", reason: null, checkedAt: 0 });
}

beforeEach(() => {
  resetStatus();
  post.mockReset();
});

afterEach(() => {
  resetStatus();
});

// --------------------------------------------------------------- classification ---

describe("describeVerify", () => {
  it("calls an unreachable provider unavailable, and says so without a URL in it", () => {
    const { state, reason } = describeVerify(UNREACHABLE);
    expect(state).toBe("unavailable");
    expect(reason).toBeTruthy();
    expect(reason).not.toMatch(/127\.0\.0\.1|http|:11434/);
  });

  it("does not call a provider ready when the selected model is not installed on it", () => {
    // The commonest half-configured install: Ollama running, qwen3:14b never pulled.
    // `verify` reports ok:true for it, which is exactly the answer that must not
    // become "marking is ready".
    const { state, reason } = describeVerify({
      ok: true,
      state: "ready",
      models: ["llama3:8b"],
      warnings: ["Selected model 'qwen3:14b' not in server list"],
    });
    expect(state).toBe("unavailable");
    expect(reason).toMatch(/not installed/i);
  });

  it("calls a working provider ready", () => {
    expect(describeVerify({ ok: true, state: "ready", models: ["m"], warnings: [] })).toEqual({
      state: "ready",
      reason: null,
    });
  });
});

// -------------------------------------------------------------------- the notice ---

describe("MarkingNotice", () => {
  it("warns, names the cost, and offers Settings when nothing can mark", async () => {
    post.mockResolvedValue(UNREACHABLE);
    render(
      <MemoryRouter>
        <MarkingNotice cost="the hour" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith("/api/v1/providers/verify", { modality: "llm" });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/cannot be marked/i);
    expect(alert).toHaveTextContent(/the hour/);
    expect(alert).toHaveTextContent(/saved/i);
    expect(screen.getByRole("button", { name: /set up marking/i })).toBeInTheDocument();
  });

  it("renders nothing at all when marking works", async () => {
    post.mockResolvedValue({ ok: true, state: "ready", models: ["m"], warnings: [] });
    const { container } = render(
      <MemoryRouter>
        <MarkingNotice cost="the hour" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(useMarkingStatus.getState().state).toBe("ready"));
    expect(container).toBeEmptyDOMElement();
  });

  it("stays silent when the sidecar itself is down — that has its own banner", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    post.mockRejectedValue(new ApiError(0, "sidecar_unreachable", "offline"));
    const { container } = render(
      <MemoryRouter>
        <MarkingNotice cost="the hour" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(useMarkingStatus.getState().state).toBe("unknown"));
    expect(container).toBeEmptyDOMElement();
  });
});

// ------------------------------------------------------------- the start screens ---

describe("StartAttemptModal", () => {
  it("says marking is unavailable before the learner commits to writing", async () => {
    post.mockResolvedValue(UNREACHABLE);
    render(
      <MemoryRouter>
        <StartAttemptModal
          prompt={prompt}
          starting={false}
          onClose={() => undefined}
          onStart={() => undefined}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/cannot be marked/i));
    // The notice names what is about to be spent — 40 minutes for a Task 2.
    expect(screen.getByRole("alert")).toHaveTextContent(/40 minutes/);
    // …and the feature is not hidden or disabled by it.
    expect(screen.getByRole("button", { name: /^start practice$/i })).toBeEnabled();
  });
});

describe("MockPreflight", () => {
  it("warns before the hour is committed, and still lets it be sat", async () => {
    post.mockResolvedValue(UNREACHABLE);
    const { MockPreflight } = await import("../mock/MockPreflight");
    render(
      <MemoryRouter>
        <MockPreflight />
      </MemoryRouter>,
    );

    const notice = await screen.findByText(/cannot be marked/i);
    expect(notice).toBeInTheDocument();
    // The cost is named as the hour, because that is what is being asked for.
    expect(screen.getByRole("alert")).toHaveTextContent(/the hour/);
    expect(screen.getByRole("button", { name: /set up marking/i })).toBeInTheDocument();
    // Warned, not blocked — practice without a band is still practice.
    expect(screen.getByRole("button", { name: /start the hour/i })).toBeEnabled();
  });
});

// -------------------------------------------------- why one answer has no band ---

function attempt(overrides: Partial<WritingAttempt>): WritingAttempt {
  return {
    id: "wa_1",
    prompt_id: "wp_1",
    parent_attempt_id: null,
    mode: "exam",
    status: "failed",
    word_count: 412,
    seconds_elapsed: 2400,
    overtime_seconds: 0,
    paste_events: 0,
    integrity_flag: null,
    submitted_at: null,
    overall_band: null,
    started_at: null,
    essay_text: "",
    outline_text: "",
    prompt: null,
    min_words: 250,
    time_limit_s: 2400,
    evaluation: null,
    evaluations: [],
    children: [],
    parent: null,
    ...overrides,
  } as WritingAttempt;
}

describe("unmarkedReason", () => {
  it("does not blame the word floor when a 412-word answer failed on the model", () => {
    const reason = unmarkedReason(attempt({ status: "failed", word_count: 412 }));
    expect(reason.setup).toBe(true);
    expect(reason.detail).not.toMatch(/50 words|too short/i);
    expect(reason.detail).toMatch(/marking model/i);
    expect(reason.detail).toMatch(/saved/i);
  });

  it("does blame the word floor when the answer really is under it", () => {
    const reason = unmarkedReason(attempt({ status: "draft", word_count: 12 }));
    expect(reason.setup).toBe(false);
    expect(reason.headline).toMatch(/12 words/);
    expect(reason.detail).toMatch(/50 words/);
  });

  it("distinguishes an answer still being marked from one never submitted", () => {
    expect(unmarkedReason(attempt({ status: "submitted" })).headline).toMatch(/still being marked/i);
    expect(unmarkedReason(attempt({ status: "draft" })).headline).toMatch(/never submitted/i);
  });
});

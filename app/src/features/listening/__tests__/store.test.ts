import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useListeningStore } from "../store";

const emptyPage = { items: [], next_cursor: null };

function resetStore(): void {
  useListeningStore.setState({
    tests: null,
    scripts: null,
    prepare: {},
    detail: null,
    attempt: null,
    result: null,
    submitError: null,
    saveError: null,
    startError: null,
  });
}

describe("prepare audio", () => {
  beforeEach(resetStore);

  it("treats a 200 cache hit as instantly ready", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ test_id: "t1", cached: true, parts: [] });
    vi.spyOn(api, "get").mockResolvedValue(emptyPage);
    const poll = vi.spyOn(api, "pollJob");

    const ok = await useListeningStore.getState().prepareTest("t1");

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith("/api/v1/listening/tests/t1/render", {});
    expect(poll).not.toHaveBeenCalled();
    expect(useListeningStore.getState().prepare.t1).toMatchObject({
      running: false,
      done: true,
      pct: 100,
    });
  });

  it("polls the render job and surfaces its real progress", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      job_id: "job-1",
      test_id: "t1",
      cached_parts: [],
      pending_parts: ["ls_1"],
    });
    vi.spyOn(api, "get").mockResolvedValue(emptyPage);
    vi.spyOn(api, "pollJob").mockImplementation(async (_id, onProgress) => {
      onProgress?.({
        id: "job-1",
        kind: "listening_render",
        state: "running",
        progress_pct: 42,
        detail: "rendering part 2 of 4",
        result: null,
        error: null,
        created_at: "",
        updated_at: "",
      });
      return { test_id: "t1", parts: [] };
    });

    const ok = await useListeningStore.getState().prepareTest("t1");

    expect(ok).toBe(true);
    expect(useListeningStore.getState().prepare.t1?.done).toBe(true);
  });

  it("keeps the failure visible instead of swallowing it", async () => {
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(502, "provider_error", "the TTS provider returned no audio"),
    );

    const ok = await useListeningStore.getState().prepareTest("t1");

    expect(ok).toBe(false);
    expect(useListeningStore.getState().prepare.t1).toMatchObject({
      running: false,
      // The sidecar's own words are kept verbatim; a provider failure additionally
      // names the fix, because a first-run learner has no idea where it lives.
      error: expect.stringContaining("the TTS provider returned no audio") as unknown as string,
    });
    expect(useListeningStore.getState().prepare.t1?.error).toContain("Settings");
  });
});

describe("attempt lifecycle", () => {
  beforeEach(resetStore);

  const detail = {
    id: "lt_1",
    title: "Test 1",
    source: "pack",
    created_at: null,
    total_questions: 2,
    audio_ready: true,
    parts: [],
  };

  it("creates an attempt, autosaves answers and submits them", async () => {
    vi.useFakeTimers();
    vi.spyOn(api, "get").mockResolvedValue(detail);
    const patch = vi.spyOn(api, "patch").mockResolvedValue({});
    const post = vi.spyOn(api, "post").mockImplementation(async (path: string) => {
      if (path.endsWith("/submit")) {
        return { attempt_id: "la_1", raw_score: 1, total_questions: 2, band: null };
      }
      return {
        attempt_id: "la_1",
        mode: "exam",
        test_id: "lt_1",
        script_id: null,
        total_questions: 2,
        question_numbers: [1, 2],
        resume_state: { answers: {}, seconds_elapsed: 0, play_count: 0, current_part: 1 },
      };
    });

    const id = await useListeningStore.getState().startAttempt({ testId: "lt_1", mode: "exam" });
    expect(id).toBe("la_1");

    useListeningStore.getState().setAnswer(1, "bramley");
    expect(patch).not.toHaveBeenCalled(); // debounced, not per keystroke

    await vi.advanceTimersByTimeAsync(1500);
    expect(patch).toHaveBeenCalledWith("/api/v1/listening/attempts/la_1", {
      answers: { "1": "bramley" },
      seconds_elapsed: 0,
      current_part: 1,
    });

    const result = await useListeningStore.getState().submit();
    expect(result?.attempt_id).toBe("la_1");
    expect(post).toHaveBeenLastCalledWith("/api/v1/listening/attempts/la_1/submit", {
      answers: { "1": "bramley" },
      seconds_elapsed: 0,
    });
    expect(useListeningStore.getState().attempt?.submitted).toBe(true);
    vi.useRealTimers();
  });

  it("keeps unsaved answers on screen when autosave fails", async () => {
    vi.useFakeTimers();
    vi.spyOn(api, "get").mockResolvedValue(detail);
    vi.spyOn(api, "post").mockResolvedValue({
      attempt_id: "la_2",
      mode: "practice",
      test_id: "lt_1",
      script_id: null,
      total_questions: 2,
      question_numbers: [1, 2],
      resume_state: { answers: {}, seconds_elapsed: 0, play_count: 0, current_part: 1 },
    });
    vi.spyOn(api, "patch").mockRejectedValue(new ApiError(0, "sidecar_unreachable", "no sidecar"));

    await useListeningStore.getState().startAttempt({ testId: "lt_1", mode: "practice" });
    useListeningStore.getState().setAnswer(1, "bramley");
    await vi.advanceTimersByTimeAsync(1500);

    // A transport failure is reported as "the local service isn't responding", not
    // as whatever fetch happened to throw — the learner can act on the former.
    expect(useListeningStore.getState().saveError).toContain("isn't responding");
    expect(useListeningStore.getState().attempt?.answers).toEqual({ "1": "bramley" });
    vi.useRealTimers();
  });
});

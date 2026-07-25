/**
 * The pre-check and submit both await `save()` to mean "the server now holds what I
 * typed". An earlier version returned early whenever the ten-second autosave tick was
 * still in flight, so the pre-check GET raced the PATCH and could read a draft that
 * was empty — the learner saw "you wrote 0 words" over a finished essay.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const patch = vi.fn();
const get = vi.fn();
const post = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    patch: (...args: unknown[]) => patch(...args),
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    pollJob: vi.fn(),
    del: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));

const { useWritingStore } = await import("../store");

const draft = {
  id: "wa_test",
  status: "draft" as const,
  word_count: 0,
  overtime_seconds: 0,
  integrity_flag: null,
  paste_events: 0,
  essay_text: "",
  outline_text: "",
};

const seed = (essay: string) => {
  useWritingStore.setState({
    attempt: { ...draft } as never,
    essay,
    outline: "",
    secondsElapsed: 5,
    pasteEvents: 0,
    pendingPasteWords: 0,
    dirty: true,
    saving: false,
    savedAt: null,
    saveError: null,
  } as never);
};

const wordsSentIn = (call: unknown[]): number => {
  const body = call[1] as { essay_text?: string };
  return (body.essay_text ?? "").trim().split(/\s+/).filter(Boolean).length;
};

describe("writing autosave", () => {
  beforeEach(() => {
    patch.mockReset();
    get.mockReset();
  });

  it("waits for an in-flight autosave instead of silently skipping the flush", async () => {
    let releaseFirst: () => void = () => {};
    const firstLanded = new Promise<void>((r) => { releaseFirst = r; });
    patch.mockImplementationOnce(async () => { await firstLanded; return { word_count: 3 }; });
    patch.mockImplementationOnce(async () => ({ word_count: 320 }));

    seed("three little words");
    const autosave = useWritingStore.getState().save(); // tick starts, stays in flight

    // The learner keeps typing, then hits Submit before the tick resolves.
    useWritingStore.getState().setEssay("a much longer essay ".repeat(60));
    const flush = useWritingStore.getState().save();

    releaseFirst();
    await Promise.all([autosave, flush]);

    expect(patch).toHaveBeenCalledTimes(2);
    // The second PATCH must carry the newer text, not be skipped.
    expect(wordsSentIn(patch.mock.calls[1])).toBeGreaterThan(100);
    expect(useWritingStore.getState().dirty).toBe(false);
  });

  it("does not issue a redundant PATCH when nothing changed during the in-flight save", async () => {
    let release: () => void = () => {};
    const landed = new Promise<void>((r) => { release = r; });
    patch.mockImplementationOnce(async () => { await landed; return { word_count: 9 }; });

    seed("a stable essay body");
    const autosave = useWritingStore.getState().save();
    const flush = useWritingStore.getState().save(); // nothing typed in between

    release();
    await Promise.all([autosave, flush]);

    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("leaves the draft dirty when the PATCH fails so the text is never lost", async () => {
    patch.mockRejectedValueOnce(new Error("network down"));

    seed("work in progress");
    await useWritingStore.getState().save();

    expect(useWritingStore.getState().dirty).toBe(true);
    expect(useWritingStore.getState().saveError).toBeTruthy();
    expect(useWritingStore.getState().essay).toBe("work in progress");
  });
});

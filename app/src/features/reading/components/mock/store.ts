/**
 * Feature-local store for the 60-minute reading mock.
 *
 * **What lives on the server and what lives here.** The sitting itself is an
 * ordinary reading attempt in `mode: "full"` with `exam_conditions: true` — created,
 * autosaved, auto-submitted and marked by the endpoints that already exist, and
 * scored by the same deterministic marker as any other attempt. What the sidecar has
 * no concept of is the *sitting*: that this attempt was taken as a mock paper, when
 * its hour started in wall-clock time, and whether it was abandoned. That is kept in
 * `localStorage` until a server-side mock record exists, which is why a sitting
 * survives a reload but not a different machine.
 *
 * **The clock is wall-clock, on purpose.** The attempt's own timer is checkpointed
 * to the sidecar every fifteen seconds and only advances while the player is
 * mounted; a mock cannot compromise on the hour continuing when you walk away from
 * it, so the sitting reconciles the attempt timer against `startedAt` on every open.
 */

import { create } from "zustand";
import { api } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import type { Paged, ReadingFormat, StartAttemptResponse, TestSummary } from "../../types";
import { MOCK_SECONDS } from "./script";

const RD = "/api/v1/reading";
const STORAGE_KEY = "bandready.reading.mocks.v1";
const MAX_RECORDS = 25;

export type MockStatus = "sitting" | "submitted" | "abandoned";

export interface MockRecord {
  /** The reading attempt id — the sitting has no separate identity. */
  attemptId: string;
  testId: string;
  testTitle: string;
  format: ReadingFormat;
  /** Epoch ms. The hour counts from here and does not pause. */
  startedAt: number;
  endedAt: number | null;
  status: MockStatus;
  totalQuestions: number;
}

// ------------------------------------------------------------------ storage ---

function readRecords(): MockRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything malformed is dropped rather than repaired: a half-parsed sitting
    // would show a clock that means nothing.
    return parsed.filter(
      (row): row is MockRecord =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as MockRecord).attemptId === "string" &&
        typeof (row as MockRecord).startedAt === "number",
    );
  } catch {
    return [];
  }
}

function writeRecords(records: MockRecord[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    // A full or disabled localStorage must never take the sitting down with it.
  }
}

// ------------------------------------------------------------------ helpers ---

/** Seconds since the hour started. Never negative, never paused. */
export function elapsedOf(record: MockRecord): number {
  const end = record.endedAt ?? Date.now();
  return Math.max(0, Math.round((end - record.startedAt) / 1000));
}

export function remainingOf(record: MockRecord): number {
  return MOCK_SECONDS - elapsedOf(record);
}

/** The sitting currently open, if any — the coach shuts itself while one exists. */
export function activeSitting(records: MockRecord[]): MockRecord | null {
  return records.find((record) => record.status === "sitting") ?? null;
}

// -------------------------------------------------------------------- store ---

interface MockState {
  records: MockRecord[];
  loadRecords: () => void;

  format: ReadingFormat;
  setFormat: (format: ReadingFormat) => void;

  tests: TestSummary[];
  testsStatus: "idle" | "loading" | "ready" | "error";
  testsError: string | null;
  loadTests: (force?: boolean) => Promise<void>;

  starting: boolean;
  startError: string | null;
  /** Open a 60-minute exam-conditions attempt on one test. Returns its id. */
  start: (testId?: string) => Promise<string | null>;

  finish: (attemptId: string, status: Exclude<MockStatus, "sitting">) => void;
  recordFor: (attemptId: string) => MockRecord | null;
}

function persist(records: MockRecord[], record: MockRecord): MockRecord[] {
  const next = [record, ...records.filter((row) => row.attemptId !== record.attemptId)];
  writeRecords(next);
  return next;
}

export const useMockStore = create<MockState>((set, get) => ({
  records: [],
  loadRecords: () => set({ records: readRecords() }),

  format: "academic",
  setFormat: (format) => set({ format, startError: null }),

  tests: [],
  testsStatus: "idle",
  testsError: null,

  async loadTests(force = false) {
    if (!force && get().testsStatus === "ready") return;
    set({ testsStatus: "loading", testsError: null });
    try {
      const page = await api.get<Paged<TestSummary>>(`${RD}/tests?limit=200`);
      set({ tests: page.items ?? [], testsStatus: "ready", testsError: null });
    } catch (err) {
      set({
        testsStatus: "error",
        testsError: friendlyMessage(err, "The reading tests could not be listed."),
      });
    }
  },

  starting: false,
  startError: null,

  async start(testId) {
    const { format, records, tests } = get();
    set({ starting: true, startError: null });
    try {
      const pool = tests.filter((test) => test.format === format);
      if (pool.length === 0) {
        set({
          starting: false,
          startError:
            format === "general_training"
              ? "No General Training test is installed. Install or import a content pack that carries one, or sit the Academic paper instead."
              : "No Academic test is installed. Install or import a content pack from Settings → Data.",
        });
        return null;
      }
      // Least-recently-sat rather than random with replacement: sitting the same
      // paper twice in a fortnight makes the second score meaningless.
      const recent = new Set(records.slice(0, 6).map((record) => record.testId));
      const fresh = pool.filter((test) => !recent.has(test.id));
      const chosen =
        (testId ? pool.find((test) => test.id === testId) : undefined) ??
        (fresh.length > 0 ? fresh : pool)[Math.floor(Math.random() * (fresh.length > 0 ? fresh : pool).length)];
      if (!chosen) {
        set({ starting: false, startError: "That test is not in the installed pack." });
        return null;
      }

      const res = await api.post<StartAttemptResponse>(`${RD}/attempts`, {
        test_id: chosen.id,
        mode: "full",
        exam_conditions: true,
        timer_s: MOCK_SECONDS,
      });

      const record: MockRecord = {
        attemptId: res.attempt_id,
        testId: chosen.id,
        testTitle: chosen.title,
        format,
        startedAt: Date.now(),
        endedAt: null,
        status: "sitting",
        totalQuestions: res.total_questions ?? chosen.total_questions ?? 40,
      };
      set((s) => ({ starting: false, records: persist(s.records, record) }));
      return record.attemptId;
    } catch (err) {
      set({
        starting: false,
        startError: friendlyMessage(err, "A mock sitting could not be opened."),
      });
      return null;
    }
  },

  finish(attemptId, status) {
    const records = get().records.length > 0 ? get().records : readRecords();
    const record = records.find((row) => row.attemptId === attemptId);
    if (!record || record.status !== "sitting") {
      if (record) set({ records });
      return;
    }
    set({ records: persist(records, { ...record, status, endedAt: Date.now() }) });
  },

  recordFor(attemptId) {
    const records = get().records.length > 0 ? get().records : readRecords();
    return records.find((row) => row.attemptId === attemptId) ?? null;
  },
}));

/** Read the ledger without mounting the store — used by the coach's exam guard. */
export function readMockRecords(): MockRecord[] {
  return readRecords();
}

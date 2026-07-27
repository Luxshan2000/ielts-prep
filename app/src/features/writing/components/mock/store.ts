/**
 * Feature-local store for the 60-minute writing mock.
 *
 * Deliberately separate from `../../store.ts`, which holds exactly one draft, one
 * timer and one autosave loop. A mock holds **two** drafts under **one** clock and
 * the learner moves between them freely, so it cannot borrow that machinery without
 * one task's text overwriting the other's on every switch.
 *
 * **What lives on the server and what lives here.** Each task is an ordinary
 * writing attempt in `mode: "exam"` — created, autosaved, pre-checked, submitted
 * and marked by the endpoints that already exist. What the sidecar has no concept
 * of is the *pairing*: that these two attempts were one sitting under one hour.
 * That link is kept in `localStorage` until a server-side mock record exists, which
 * is why a sitting survives a reload but not a different machine.
 *
 * **The clock is wall-clock, on purpose.** Elapsed time is measured from
 * `startedAt`, not accumulated while the window has focus, because the one
 * condition a mock cannot compromise on is that the hour keeps running when you
 * walk away from it.
 */

import { create } from "zustand";
import { api } from "@/lib/api";
import {
  countEssayWords,
  message,
  type AttemptSummary,
  type TaskType,
  type WritingAttempt,
  type WritingPrompt,
} from "../../store";

const ATTEMPTS = "/api/v1/writing/attempts";
const PROMPTS = "/api/v1/writing/prompts";
const enc = encodeURIComponent;

/** The whole paper. Not configurable — a shorter mock is a different exercise. */
export const MOCK_SECONDS = 60 * 60;

/** The nominal split. Never enforced; the report measures against it. */
export const TARGET_SECONDS: Record<MockTaskKey, number> = {
  task1: 20 * 60,
  task2: 40 * 60,
};

const STORAGE_KEY = "bandready.writing.mocks.v1";
const MAX_RECORDS = 25;

export type MockTaskKey = "task1" | "task2";
export type MockModule = "academic" | "general";
export type MockStatus = "sitting" | "submitted" | "abandoned";

export interface MockTaskRef {
  attemptId: string;
  promptId: string;
}

export interface MockRecord {
  id: string;
  module: MockModule;
  /** Epoch ms. The clock counts from here and does not pause. */
  startedAt: number;
  endedAt: number | null;
  status: MockStatus;
  task1: MockTaskRef;
  task2: MockTaskRef;
  /** Tracked silently during the sitting; the report leads with it. */
  perTaskSeconds: Record<MockTaskKey, number>;
  /** Seconds written after the hour ran out. */
  overtimeSeconds: number;
}

export const TASK_ORDER: MockTaskKey[] = ["task1", "task2"];

// ------------------------------------------------------------------ persistence ---

function readRecords(): MockRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything malformed is dropped rather than repaired: a half-parsed sitting
    // would show a clock that means nothing.
    return parsed.filter(
      (row): row is MockRecord =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as MockRecord).id === "string" &&
        typeof (row as MockRecord).startedAt === "number" &&
        Boolean((row as MockRecord).task1?.attemptId) &&
        Boolean((row as MockRecord).task2?.attemptId),
    );
  } catch {
    return [];
  }
}

function writeRecords(records: MockRecord[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    // A full or disabled localStorage must never take the sitting down with it.
  }
}

function newId(): string {
  const rand = globalThis.crypto?.randomUUID?.();
  return rand ?? `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------- helpers ---

/** Seconds since the clock started. Never negative, never paused. */
export function elapsedOf(record: MockRecord): number {
  const end = record.endedAt ?? Date.now();
  return Math.max(0, Math.round((end - record.startedAt) / 1000));
}

export function remainingOf(record: MockRecord): number {
  return MOCK_SECONDS - elapsedOf(record);
}

/** The Task 1 type this module sits: Academic reads a visual, General writes a letter. */
export function task1TypeFor(module: MockModule): TaskType {
  return module === "academic" ? "ac_task1" : "gt_task1";
}

/** IELTS half-band rounding, the same rule the sidecar uses on a criterion mean. */
export function roundHalfBand(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * The paper estimate. Task 2 is worth twice Task 1, which is why a band 6 on Task 1
 * with 7.5 on Task 2 lands at 7.0 while the reverse lands at 6.5 — and why minutes
 * spent perfecting Task 1 are the worst trade available in the hour.
 */
export function estimatedPaperBand(task1: number | null, task2: number | null): number | null {
  if (task1 === null || task2 === null) return null;
  return roundHalfBand((task1 + 2 * task2) / 3);
}

// ------------------------------------------------------------------------ store ---

interface TaskState {
  prompt: WritingPrompt | null;
  attempt: AttemptSummary | null;
  essay: string;
  outline: string;
  dirty: boolean;
  pasteEvents: number;
  pendingPasteWords: number;
  /** Set when this task's own submission was refused (too short, mostly). */
  submitError: string | null;
}

const emptyTask = (): TaskState => ({
  prompt: null,
  attempt: null,
  essay: "",
  outline: "",
  dirty: false,
  pasteEvents: 0,
  pendingPasteWords: 0,
  submitError: null,
});

interface MockState {
  // ---- history -----------------------------------------------------------
  records: MockRecord[];
  loadRecords: () => void;

  // ---- pre-flight --------------------------------------------------------
  module: MockModule;
  setModule: (module: MockModule) => void;
  starting: boolean;
  startError: string | null;
  /** Assemble two prompts, open two exam attempts, start the clock. */
  start: () => Promise<string | null>;

  // ---- the sitting -------------------------------------------------------
  active: MockRecord | null;
  opening: boolean;
  openError: string | null;
  open: (mockId: string) => Promise<void>;
  activeTask: MockTaskKey;
  switchTask: (task: MockTaskKey) => void;
  tasks: Record<MockTaskKey, TaskState>;
  setEssay: (task: MockTaskKey, text: string) => void;
  setOutline: (task: MockTaskKey, text: string) => void;
  recordPaste: (task: MockTaskKey, words: number) => void;
  /** One second of the clock, credited to whichever task is on screen. */
  tick: () => void;

  saving: boolean;
  savedAt: number | null;
  saveError: string | null;
  save: (task?: MockTaskKey) => Promise<void>;

  submitting: boolean;
  submitDetail: string | null;
  submitError: string | null;
  submit: () => Promise<boolean>;
  abandon: () => Promise<void>;
  leave: () => void;

  // ---- the report --------------------------------------------------------
  reportLoading: boolean;
  reportError: string | null;
  report: Record<MockTaskKey, WritingAttempt | null>;
  loadReport: (mockId: string) => Promise<void>;
}

function persist(records: MockRecord[], record: MockRecord): MockRecord[] {
  const next = [record, ...records.filter((r) => r.id !== record.id)];
  writeRecords(next);
  return next;
}

export const useMockStore = create<MockState>((set, get) => ({
  records: [],
  loadRecords: () => set({ records: readRecords() }),

  module: "academic",
  setModule: (module) => set({ module, startError: null }),

  starting: false,
  startError: null,

  start: async () => {
    set({ starting: true, startError: null });
    const module = get().module;
    try {
      const [t1, t2] = await Promise.all([
        pickPrompt(task1TypeFor(module), get().records, "task1"),
        pickPrompt("task2", get().records, "task2"),
      ]);
      if (!t1 || !t2) {
        set({
          starting: false,
          startError:
            "The prompt bank does not have both a Task 1 and a Task 2 prompt available for this module.",
        });
        return null;
      }
      // Exam mode from the first keystroke: it is what turns off spellcheck, records
      // overtime and marks the attempts as sat rather than practised.
      const [a1, a2] = await Promise.all([
        api.post<WritingAttempt & { attempt_id: string }>(ATTEMPTS, {
          prompt_id: t1.id,
          mode: "exam",
        }),
        api.post<WritingAttempt & { attempt_id: string }>(ATTEMPTS, {
          prompt_id: t2.id,
          mode: "exam",
        }),
      ]);
      const record: MockRecord = {
        id: newId(),
        module,
        startedAt: Date.now(),
        endedAt: null,
        status: "sitting",
        task1: { attemptId: a1.attempt_id ?? a1.id, promptId: t1.id },
        task2: { attemptId: a2.attempt_id ?? a2.id, promptId: t2.id },
        perTaskSeconds: { task1: 0, task2: 0 },
        overtimeSeconds: 0,
      };
      set((s) => ({
        starting: false,
        records: persist(s.records, record),
        active: record,
        activeTask: "task1",
        tasks: {
          task1: { ...emptyTask(), prompt: t1 },
          task2: { ...emptyTask(), prompt: t2 },
        },
        saveError: null,
        savedAt: null,
        submitError: null,
      }));
      return record.id;
    } catch (err) {
      set({ starting: false, startError: message(err, "Couldn't open a mock sitting.") });
      return null;
    }
  },

  active: null,
  opening: false,
  openError: null,

  open: async (mockId) => {
    const records = get().records.length > 0 ? get().records : readRecords();
    const record = records.find((r) => r.id === mockId) ?? null;
    if (!record) {
      set({ records, active: null, opening: false, openError: "That sitting is not on this machine." });
      return;
    }
    if (get().active?.id === mockId && get().tasks.task1.prompt) {
      set({ records, active: record });
      return;
    }
    set({ records, active: record, opening: true, openError: null });
    try {
      const [a1, a2] = await Promise.all([
        api.get<WritingAttempt>(`${ATTEMPTS}/${enc(record.task1.attemptId)}`),
        api.get<WritingAttempt>(`${ATTEMPTS}/${enc(record.task2.attemptId)}`),
      ]);
      set({
        opening: false,
        activeTask: "task1",
        tasks: {
          task1: {
            ...emptyTask(),
            prompt: a1.prompt,
            attempt: a1,
            essay: a1.essay_text ?? "",
            outline: a1.outline_text ?? "",
            pasteEvents: a1.paste_events ?? 0,
          },
          task2: {
            ...emptyTask(),
            prompt: a2.prompt,
            attempt: a2,
            essay: a2.essay_text ?? "",
            outline: a2.outline_text ?? "",
            pasteEvents: a2.paste_events ?? 0,
          },
        },
      });
    } catch (err) {
      set({ opening: false, openError: message(err, "That sitting could not be reopened.") });
    }
  },

  activeTask: "task1",
  switchTask: (task) => {
    if (get().activeTask === task) return;
    // Flush before the swap so the task being left is on the server, not in memory.
    void get().save(get().activeTask);
    set({ activeTask: task });
  },

  tasks: { task1: emptyTask(), task2: emptyTask() },

  setEssay: (task, text) =>
    set((s) => ({ tasks: { ...s.tasks, [task]: { ...s.tasks[task], essay: text, dirty: true } } })),

  setOutline: (task, text) =>
    set((s) => ({
      tasks: { ...s.tasks, [task]: { ...s.tasks[task], outline: text, dirty: true } },
    })),

  recordPaste: (task, words) =>
    set((s) => ({
      tasks: {
        ...s.tasks,
        [task]: {
          ...s.tasks[task],
          pasteEvents: s.tasks[task].pasteEvents + 1,
          pendingPasteWords: Math.max(s.tasks[task].pendingPasteWords, Math.max(0, Math.round(words))),
          dirty: true,
        },
      },
    })),

  tick: () => {
    const { active, activeTask, records } = get();
    if (!active || active.status !== "sitting") return;
    const elapsed = elapsedOf(active);
    const next: MockRecord = {
      ...active,
      perTaskSeconds: {
        ...active.perTaskSeconds,
        [activeTask]: active.perTaskSeconds[activeTask] + 1,
      },
      overtimeSeconds: Math.max(0, elapsed - MOCK_SECONDS),
    };
    // Held in memory each second; written to disk on every autosave and on exit,
    // which is often enough that a crash costs at most ten seconds of attribution.
    set({ active: next, records: records.map((r) => (r.id === next.id ? next : r)) });
  },

  saving: false,
  savedAt: null,
  saveError: null,

  save: async (task) => {
    const { active, tasks } = get();
    if (!active) return;
    const keys: MockTaskKey[] = task ? [task] : TASK_ORDER;
    const pending = keys.filter((key) => tasks[key].dirty);
    if (pending.length === 0) {
      writeRecords(get().records);
      return;
    }
    set({ saving: true, saveError: null });
    // Clear the flags before the request: a keystroke during the PATCH must mark the
    // draft dirty again rather than be swallowed by the response handler.
    set((s) => ({
      tasks: pending.reduce(
        (acc, key) => ({ ...acc, [key]: { ...s.tasks[key], dirty: false } }),
        s.tasks,
      ),
    }));
    try {
      await Promise.all(
        pending.map((key) => {
          const state = get().tasks[key];
          const ref = active[key];
          return api.patch<AttemptSummary>(`${ATTEMPTS}/${enc(ref.attemptId)}`, {
            essay_text: state.essay,
            outline_text: state.outline,
            seconds_elapsed: Math.round(active.perTaskSeconds[key]),
            paste_events: state.pasteEvents,
            ...(state.pendingPasteWords > 0 ? { last_paste_words: state.pendingPasteWords } : {}),
          });
        }),
      );
      set((s) => ({
        saving: false,
        savedAt: Date.now(),
        tasks: pending.reduce(
          (acc, key) => ({ ...acc, [key]: { ...s.tasks[key], pendingPasteWords: 0 } }),
          s.tasks,
        ),
      }));
      writeRecords(get().records);
    } catch (err) {
      // Stay dirty so the next tick retries. The text is never lost.
      set((s) => ({
        saving: false,
        saveError: message(err, "Autosave failed."),
        tasks: pending.reduce(
          (acc, key) => ({ ...acc, [key]: { ...s.tasks[key], dirty: true } }),
          s.tasks,
        ),
      }));
    }
  },

  submitting: false,
  submitDetail: null,
  submitError: null,

  submit: async () => {
    const active = get().active;
    if (!active) return false;
    set({ submitting: true, submitDetail: "saving both answers", submitError: null });
    try {
      await get().save();
    } catch {
      // A failed final save is reported by `save` itself; submitting the last
      // persisted text is still better than refusing to submit at all.
    }

    // Each task is submitted and marked independently: one answer under the hard
    // minimum must not stop the other from being scored.
    const failures: string[] = [];
    for (const key of TASK_ORDER) {
      const ref = active[key];
      set({ submitDetail: `marking ${key === "task1" ? "Task 1" : "Task 2"}` });
      try {
        const started = await api.post<{ job_id: string }>(
          `${ATTEMPTS}/${enc(ref.attemptId)}/submit`,
          { acknowledge_warnings: true },
        );
        await api.pollJob(started.job_id, (job) =>
          set({ submitDetail: job.detail ?? `marking ${key === "task1" ? "Task 1" : "Task 2"}` }),
        );
        set((s) => ({ tasks: { ...s.tasks, [key]: { ...s.tasks[key], submitError: null } } }));
      } catch (err) {
        const detail = message(err, "That answer could not be marked.");
        failures.push(`${key === "task1" ? "Task 1" : "Task 2"}: ${detail}`);
        set((s) => ({ tasks: { ...s.tasks, [key]: { ...s.tasks[key], submitError: detail } } }));
      }
    }

    const current = get().active ?? active;
    const ended: MockRecord = {
      ...current,
      endedAt: Date.now(),
      status: "submitted",
      overtimeSeconds: Math.max(0, elapsedOf(current) - MOCK_SECONDS),
    };
    set((s) => ({
      submitting: false,
      submitDetail: null,
      submitError: failures.length > 0 ? failures.join(" · ") : null,
      active: ended,
      records: persist(s.records, ended),
    }));
    return failures.length < TASK_ORDER.length;
  },

  abandon: async () => {
    const active = get().active;
    if (!active) return;
    await get().save();
    const ended: MockRecord = { ...active, endedAt: Date.now(), status: "abandoned" };
    set((s) => ({ active: ended, records: persist(s.records, ended) }));
  },

  leave: () => {
    writeRecords(get().records);
    set({ active: null, tasks: { task1: emptyTask(), task2: emptyTask() }, activeTask: "task1" });
  },

  reportLoading: false,
  reportError: null,
  report: { task1: null, task2: null },

  loadReport: async (mockId) => {
    const records = get().records.length > 0 ? get().records : readRecords();
    const record = records.find((r) => r.id === mockId) ?? null;
    if (!record) {
      set({ records, reportError: "That sitting is not on this machine.", reportLoading: false });
      return;
    }
    set({ records, active: record, reportLoading: true, reportError: null });
    try {
      const [t1, t2] = await Promise.all([
        api.get<WritingAttempt>(`${ATTEMPTS}/${enc(record.task1.attemptId)}`),
        api.get<WritingAttempt>(`${ATTEMPTS}/${enc(record.task2.attemptId)}`),
      ]);
      set({ reportLoading: false, report: { task1: t1, task2: t2 } });
    } catch (err) {
      set({
        reportLoading: false,
        reportError: message(err, "This sitting's answers could not be loaded."),
      });
    }
  },
}));

// ---------------------------------------------------------------------- picking ---

/**
 * One prompt of a kind, avoiding anything sat in a recent mock.
 *
 * Least-recently-served rather than random-with-replacement: sitting the same chart
 * twice in a fortnight makes the second band meaningless, and the bank is large
 * enough that avoidance costs nothing.
 */
async function pickPrompt(
  taskType: TaskType,
  records: MockRecord[],
  slot: MockTaskKey,
): Promise<WritingPrompt | null> {
  const res = await api.get<{ items: WritingPrompt[] }>(
    `${PROMPTS}?task_type=${enc(taskType)}&limit=100`,
  );
  const items = (res.items ?? []).filter((p) => !p.retired);
  if (items.length === 0) return null;
  const recent = new Set(records.slice(0, 8).map((r) => r[slot].promptId));
  const fresh = items.filter((p) => !recent.has(p.id));
  const pool = fresh.length > 0 ? fresh : items;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

/** Words in one task's draft, counted exactly as the server counts them. */
export function taskWords(text: string): number {
  return countEssayWords(text);
}

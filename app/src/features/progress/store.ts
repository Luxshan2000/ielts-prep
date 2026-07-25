/**
 * Progress feature store (per-feature ephemeral store — 01 §7.1).
 *
 * Trajectory series are cached per skill so flipping the skill toggles does not
 * refetch, and every request keeps its own failure so one dead panel never
 * blanks the page.
 */

import { create } from "zustand";
import { api } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import type {
  CriteriaDoc,
  HeatmapDoc,
  ListeningAttemptRow,
  MockSitting,
  ReadinessDoc,
  SkillKey,
  SpeakingSessionRow,
  SummaryDoc,
  TrajectoryDoc,
  WritingAttemptRow,
} from "./types";
import { SKILL_KEYS } from "./types";

export type SeriesKey = SkillKey | "overall";

const SERIES_KEYS: readonly SeriesKey[] = [...SKILL_KEYS, "overall"] as const;

function detailOf(err: unknown): string {
  return friendlyMessage(
    err,
    "the request failed",
    "The BandReady sidecar isn't responding, so nothing can be loaded right now.",
  );
}

interface ProgressFeatureState {
  summary: SummaryDoc | null;
  trajectories: Partial<Record<SeriesKey, TrajectoryDoc>>;
  criteria: Partial<Record<SkillKey, CriteriaDoc>>;
  heatmap: HeatmapDoc | null;
  readiness: ReadinessDoc | null;
  mocks: MockSitting[];
  /** True while nothing has been loaded yet. */
  initialized: boolean;
  loading: boolean;
  weeks: number;
  errors: Partial<Record<"summary" | "trajectory" | "criteria" | "heatmap" | "readiness" | "mocks", string>>;
  recomputing: boolean;
  savingItem: string | null;
  mocksSupported: boolean;

  load: (weeks?: number) => Promise<void>;
  loadTrajectory: (skill: SeriesKey, weeks?: number) => Promise<void>;
  loadCriteria: (skill: SkillKey) => Promise<void>;
  setWeeks: (weeks: number) => Promise<void>;
  recompute: () => Promise<void>;
  setReadinessItem: (itemId: string, checked: boolean) => Promise<void>;
}

async function fetchMocks(): Promise<{ items: MockSitting[]; supported: boolean }> {
  const [listening, writing, speaking] = await Promise.allSettled([
    api.get<{ items: ListeningAttemptRow[] }>("/api/v1/listening/attempts?limit=100"),
    api.get<{ items: WritingAttemptRow[] }>("/api/v1/writing/attempts?mode=mock&limit=100"),
    api.get<{ items: SpeakingSessionRow[] }>("/api/v1/speaking/sessions?limit=100"),
  ]);
  if (
    listening.status === "rejected" &&
    writing.status === "rejected" &&
    speaking.status === "rejected"
  ) {
    return { items: [], supported: false };
  }

  const byDate = new Map<string, MockSitting>();
  const row = (iso: string | null | undefined): MockSitting | null => {
    if (!iso) return null;
    const date = iso.slice(0, 10);
    if (!date) return null;
    const existing = byDate.get(date);
    if (existing) return existing;
    const created: MockSitting = { date, bands: {}, detail: {} };
    byDate.set(date, created);
    return created;
  };

  if (listening.status === "fulfilled") {
    for (const item of listening.value.items ?? []) {
      if (item.mode !== "mock" || item.band === null) continue;
      const sitting = row(item.submitted_at);
      if (!sitting) continue;
      sitting.bands.listening = item.band;
      if (item.raw_score !== null && item.total_questions) {
        sitting.detail.listening = `${item.raw_score} / ${item.total_questions} correct`;
      }
    }
  }
  if (writing.status === "fulfilled") {
    for (const item of writing.value.items ?? []) {
      const band = item.overall_band ?? item.band ?? null;
      if (band === null) continue;
      const sitting = row(item.submitted_at ?? item.started_at);
      if (!sitting) continue;
      // A mock has two writing tasks; keep the lower band, which is the honest one.
      const current = sitting.bands.writing;
      sitting.bands.writing = current === undefined ? band : Math.min(current, band);
      sitting.detail.writing = item.word_count ? `${item.word_count} words` : undefined;
    }
  }
  if (speaking.status === "fulfilled") {
    for (const item of speaking.value.items ?? []) {
      if (item.mode !== "mock" || item.overall_band === null) continue;
      const sitting = row(item.ended_at ?? item.started_at);
      if (!sitting) continue;
      sitting.bands.speaking = item.overall_band;
      sitting.detail.speaking = item.activity ? item.activity.replace(/_/g, " ") : undefined;
    }
  }

  const items = [...byDate.values()]
    .filter((s) => Object.keys(s.bands).length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  return { items, supported: true };
}

export const useProgressFeatureStore = create<ProgressFeatureState>((set, get) => ({
  summary: null,
  trajectories: {},
  criteria: {},
  heatmap: null,
  readiness: null,
  mocks: [],
  initialized: false,
  loading: false,
  weeks: 12,
  errors: {},
  recomputing: false,
  savingItem: null,
  mocksSupported: true,

  load: async (weeks) => {
    const span = weeks ?? get().weeks;
    set({ loading: true, weeks: span });

    const [summary, heatmap, readiness, mocks] = await Promise.allSettled([
      api.get<SummaryDoc>("/api/v1/progress/summary"),
      api.get<HeatmapDoc>("/api/v1/progress/heatmap?weeks=16"),
      api.get<ReadinessDoc>("/api/v1/readiness"),
      fetchMocks(),
    ]);

    const errors: ProgressFeatureState["errors"] = {};
    if (summary.status === "rejected") errors.summary = detailOf(summary.reason);
    if (heatmap.status === "rejected") errors.heatmap = detailOf(heatmap.reason);
    if (readiness.status === "rejected") errors.readiness = detailOf(readiness.reason);
    if (mocks.status === "rejected") errors.mocks = detailOf(mocks.reason);

    set({
      summary: summary.status === "fulfilled" ? summary.value : null,
      heatmap: heatmap.status === "fulfilled" ? heatmap.value : null,
      readiness: readiness.status === "fulfilled" ? readiness.value : null,
      mocks: mocks.status === "fulfilled" ? mocks.value.items : [],
      mocksSupported: mocks.status === "fulfilled" ? mocks.value.supported : false,
      errors,
      loading: false,
      initialized: true,
    });

    // Trajectories load in parallel behind the first paint.
    await Promise.all(SERIES_KEYS.map((key) => get().loadTrajectory(key, span)));
    const productive = get().summary ? (["writing", "speaking"] as SkillKey[]) : [];
    await Promise.all(productive.map((skill) => get().loadCriteria(skill)));
  },

  loadTrajectory: async (skill, weeks) => {
    const span = weeks ?? get().weeks;
    try {
      const doc = await api.get<TrajectoryDoc>(
        `/api/v1/progress/trajectory?skill=${encodeURIComponent(skill)}&weeks=${span}`,
      );
      set((s) => ({
        trajectories: { ...s.trajectories, [skill]: doc },
        errors: { ...s.errors, trajectory: undefined },
      }));
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, trajectory: detailOf(err) } }));
    }
  },

  loadCriteria: async (skill) => {
    if (get().criteria[skill]) return;
    try {
      const doc = await api.get<CriteriaDoc>(
        `/api/v1/progress/criteria?skill=${encodeURIComponent(skill)}`,
      );
      set((s) => ({
        criteria: { ...s.criteria, [skill]: doc },
        errors: { ...s.errors, criteria: undefined },
      }));
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, criteria: detailOf(err) } }));
    }
  },

  setWeeks: async (weeks) => {
    set({ weeks });
    await Promise.all(SERIES_KEYS.map((key) => get().loadTrajectory(key, weeks)));
  },

  recompute: async () => {
    set({ recomputing: true });
    try {
      await api.post("/api/v1/progress/estimates/recompute", {});
      await get().load();
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, summary: detailOf(err) } }));
    } finally {
      set({ recomputing: false });
    }
  },

  setReadinessItem: async (itemId, checked) => {
    const previous = get().readiness;
    if (!previous) return;
    set({
      savingItem: itemId,
      readiness: {
        ...previous,
        items: previous.items.map((item) =>
          item.id === itemId ? { ...item, checked } : item,
        ),
      },
    });
    try {
      await api.put(`/api/v1/readiness/${encodeURIComponent(itemId)}`, { checked });
      const fresh = await api.get<ReadinessDoc>("/api/v1/readiness");
      set({ readiness: fresh, errors: { ...get().errors, readiness: undefined } });
    } catch (err) {
      set((s) => ({
        readiness: previous,
        errors: { ...s.errors, readiness: detailOf(err) },
      }));
    } finally {
      set({ savingItem: null });
    }
  },
}));

/**
 * Vocabulary feature store (feature-local, ephemeral — R2-23).
 *
 * Owns the browse filters, the suggestion inbox, the seed-deck list, the stats
 * payload and the in-flight review session. The only *global* state it touches is
 * the sidebar's due badge on `useSrsStore`, which it refreshes from the queue
 * counters the sidecar returns with every review — so the badge is correct the
 * moment a card is rated or a suggestion is accepted.
 */

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import { useSrsStore } from "@/stores";
import type {
  DeckOptInResult,
  EntriesResponse,
  EntrySort,
  ExerciseKind,
  LookupResponse,
  QueueCounts,
  QueueItem,
  ReviewResponse,
  SeedDeck,
  SessionResponse,
  SrsStats,
  SuggestionsResponse,
  VocabEntry,
  VocabStatus,
} from "./types";

// --------------------------------------------------------------------- utils

function message(err: unknown, fallback: string): string {
  return friendlyMessage(err, fallback);
}

function isOffline(err: unknown): boolean {
  return err instanceof ApiError && err.isOffline;
}

/**
 * Push the queue counters into the global SRS store so the sidebar badge and any
 * other consumer see the same numbers this screen does.
 */
export function syncSrsBadge(counts: Pick<QueueCounts, "due_today" | "suggested">): void {
  useSrsStore.setState({
    dueCount: Math.max(0, Number(counts.due_today ?? 0)),
    suggestedCount: Math.max(0, Number(counts.suggested ?? 0)),
  });
}

function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// --------------------------------------------------------------------- types

export interface BrowseFilters {
  query: string;
  status: VocabStatus | "all";
  pos: string;
  topic: string;
  sort: EntrySort;
}

export const DEFAULT_FILTERS: BrowseFilters = {
  query: "",
  status: "all",
  pos: "",
  topic: "",
  sort: "recent",
};

/** One graded card, kept for the end-of-session summary. */
export interface ReviewOutcome {
  entryId: string;
  headword: string;
  exercise: ExerciseKind;
  rating: number;
  /** `null` for the self-rated types (flip, speaking drill). */
  correct: boolean | null;
  elapsedMs: number;
  /** The interval label the chosen rating scheduled ("10m", "4d"). */
  nextLabel: string;
}

export interface AddEntryInput {
  term: string;
  pos?: string;
  definition?: string;
  ipa?: string;
  cefr_level?: string;
  sentence_context?: string;
  topic_tags?: string[];
  example_sentences?: string[];
  collocations?: string[];
}

interface VocabState {
  // ------------------------------------------------------------ review session
  session: {
    items: QueueItem[];
    index: number;
    loading: boolean;
    submitting: boolean;
    /** Failure while BUILDING the session. */
    error: string | null;
    /** Failure while SAVING the last rating — the card stays on screen. */
    submitError: string | null;
    offline: boolean;
    counts: QueueCounts | null;
    streak: number;
    remainingAfter: number;
    outcomes: ReviewOutcome[];
    finished: boolean;
    startedAt: number | null;
  };
  startSession: (count?: number) => Promise<void>;
  submitRating: (
    rating: number,
    meta: { correct: boolean | null; elapsedMs: number },
  ) => Promise<boolean>;
  finishSession: () => void;
  resetSession: () => void;

  // -------------------------------------------------------------------- browse
  filters: BrowseFilters;
  entries: VocabEntry[];
  entriesCursor: string | null;
  entriesLoading: boolean;
  entriesLoadingMore: boolean;
  entriesError: string | null;
  entriesOffline: boolean;
  selection: string[];
  setFilters: (patch: Partial<BrowseFilters>) => void;
  loadEntries: () => Promise<void>;
  loadMoreEntries: () => Promise<void>;
  toggleSelected: (id: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  bulkSetStatus: (status: VocabStatus) => Promise<number>;
  bulkDelete: () => Promise<number>;
  patchEntry: (id: string, patch: Partial<VocabEntry>) => Promise<boolean>;
  addEntry: (input: AddEntryInput) => Promise<VocabEntry | null>;
  lookupWord: (word: string, sentence?: string) => Promise<LookupResponse>;

  // -------------------------------------------------------------------- detail
  detail: VocabEntry | null;
  detailLoading: boolean;
  detailError: string | null;
  openDetail: (id: string) => Promise<void>;
  closeDetail: () => void;

  // --------------------------------------------------------------- suggestions
  suggestions: VocabEntry[];
  suggestionsTotal: number;
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  suggestionsOffline: boolean;
  suggestionBusy: string[];
  loadSuggestions: () => Promise<void>;
  acceptSuggestion: (id: string) => Promise<boolean>;
  dismissSuggestion: (id: string) => Promise<boolean>;
  acceptAllSuggestions: () => Promise<number>;

  // --------------------------------------------------------------------- decks
  decks: SeedDeck[];
  decksLoading: boolean;
  decksError: string | null;
  deckBusy: string | null;
  loadDecks: () => Promise<void>;
  optInDeck: (deckId: string) => Promise<DeckOptInResult | null>;

  // --------------------------------------------------------------------- stats
  stats: SrsStats | null;
  statsLoading: boolean;
  statsError: string | null;
  statsOffline: boolean;
  loadStats: () => Promise<void>;

  /** Refresh whatever counters are cheap — used after a session ends. */
  refreshCounters: () => Promise<void>;
}

const EMPTY_SESSION: VocabState["session"] = {
  items: [],
  index: 0,
  loading: false,
  submitting: false,
  error: null,
  submitError: null,
  offline: false,
  counts: null,
  streak: 0,
  remainingAfter: 0,
  outcomes: [],
  finished: false,
  startedAt: null,
};

// --------------------------------------------------------------------- store

export const useVocabStore = create<VocabState>((set, get) => ({
  // ------------------------------------------------------------ review session
  session: { ...EMPTY_SESSION },

  startSession: async (count = 20) => {
    set({ session: { ...EMPTY_SESSION, loading: true } });
    try {
      const res = await api.get<SessionResponse>(`/api/v1/srs/session${query({ count })}`);
      syncSrsBadge(res.counts);
      set({
        session: {
          ...EMPTY_SESSION,
          items: res.items ?? [],
          counts: res.counts,
          streak: res.streak ?? 0,
          remainingAfter: res.remaining_after ?? 0,
          startedAt: Date.now(),
        },
      });
    } catch (err) {
      set({
        session: {
          ...EMPTY_SESSION,
          error: message(err, "could not build a review session"),
          offline: isOffline(err),
          finished: false,
        },
      });
    }
  },

  submitRating: async (rating, meta) => {
    const { session } = get();
    const item = session.items[session.index];
    if (!item || session.submitting) return false;

    set({ session: { ...session, submitting: true, submitError: null } });
    try {
      const res = await api.post<ReviewResponse>("/api/v1/srs/review", {
        card_id: item.card_id,
        entry_id: item.entry_id,
        rating,
        exercise_type: item.exercise_type,
        elapsed_ms: Math.max(0, Math.min(3_600_000, Math.round(meta.elapsedMs))),
      });
      syncSrsBadge(res.counts);

      const ratingKey = (["again", "hard", "good", "easy"] as const)[rating - 1] ?? "good";
      const outcome: ReviewOutcome = {
        entryId: item.entry_id,
        headword: item.entry.headword,
        exercise: item.exercise_type,
        rating,
        correct: meta.correct,
        elapsedMs: meta.elapsedMs,
        nextLabel: item.intervals?.[ratingKey]?.label ?? "—",
      };
      const next = get().session;
      const index = next.index + 1;
      set({
        session: {
          ...next,
          submitting: false,
          index,
          outcomes: [...next.outcomes, outcome],
          counts: res.counts,
          finished: index >= next.items.length,
        },
      });
      return true;
    } catch (err) {
      const current = get().session;
      set({
        session: {
          ...current,
          submitting: false,
          submitError: message(err, "could not save that review"),
          offline: isOffline(err),
        },
      });
      return false;
    }
  },

  finishSession: () => {
    const { session } = get();
    set({ session: { ...session, finished: true } });
  },

  resetSession: () => set({ session: { ...EMPTY_SESSION } }),

  // -------------------------------------------------------------------- browse
  filters: { ...DEFAULT_FILTERS },
  entries: [],
  entriesCursor: null,
  entriesLoading: false,
  entriesLoadingMore: false,
  entriesError: null,
  entriesOffline: false,
  selection: [],

  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),

  loadEntries: async () => {
    const { filters } = get();
    set({ entriesLoading: true, entriesError: null });
    try {
      const res = await api.get<EntriesResponse>(
        `/api/v1/vocab/entries${query({
          query: filters.query.trim() || undefined,
          status: filters.status === "all" ? undefined : filters.status,
          pos: filters.pos || undefined,
          topic: filters.topic || undefined,
          sort: filters.sort,
          limit: 50,
        })}`,
      );
      const items = res.items ?? [];
      const alive = new Set(items.map((e) => e.id));
      set({
        entries: items,
        entriesCursor: res.next_cursor ?? null,
        entriesLoading: false,
        entriesOffline: false,
        selection: get().selection.filter((id) => alive.has(id)),
      });
    } catch (err) {
      set({
        entries: [],
        entriesCursor: null,
        entriesLoading: false,
        entriesOffline: isOffline(err),
        entriesError: message(err, "could not load your vocabulary bank"),
      });
    }
  },

  loadMoreEntries: async () => {
    const { filters, entriesCursor, entriesLoadingMore } = get();
    if (!entriesCursor || entriesLoadingMore) return;
    set({ entriesLoadingMore: true, entriesError: null });
    try {
      const res = await api.get<EntriesResponse>(
        `/api/v1/vocab/entries${query({
          query: filters.query.trim() || undefined,
          status: filters.status === "all" ? undefined : filters.status,
          pos: filters.pos || undefined,
          topic: filters.topic || undefined,
          sort: filters.sort,
          limit: 50,
          cursor: entriesCursor,
        })}`,
      );
      set({
        entries: [...get().entries, ...(res.items ?? [])],
        entriesCursor: res.next_cursor ?? null,
        entriesLoadingMore: false,
      });
    } catch (err) {
      set({
        entriesLoadingMore: false,
        entriesError: message(err, "could not load more entries"),
      });
    }
  },

  toggleSelected: (id) => {
    const selection = get().selection;
    set({
      selection: selection.includes(id)
        ? selection.filter((s) => s !== id)
        : [...selection, id],
    });
  },

  setSelection: (ids) => set({ selection: ids }),
  clearSelection: () => set({ selection: [] }),

  bulkSetStatus: async (status) => {
    const ids = get().selection;
    if (ids.length === 0) return 0;
    let done = 0;
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await api.patch<VocabEntry>(`/api/v1/vocab/entries/${id}`, { status });
        done += 1;
      } catch (err) {
        failures.push(message(err, "update failed"));
      }
    }
    set({ selection: [] });
    await get().loadEntries();
    if (failures.length) {
      set({
        entriesError: `${failures.length} of ${ids.length} did not update: ${failures[0]}`,
      });
    }
    await get().refreshCounters();
    return done;
  },

  bulkDelete: async () => {
    const ids = get().selection;
    if (ids.length === 0) return 0;
    let done = 0;
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await api.del(`/api/v1/vocab/entries/${id}`);
        done += 1;
      } catch (err) {
        failures.push(message(err, "delete failed"));
      }
    }
    set({ selection: [] });
    await get().loadEntries();
    if (failures.length) {
      set({
        entriesError: `${failures.length} of ${ids.length} could not be deleted: ${failures[0]}`,
      });
    }
    await get().refreshCounters();
    return done;
  },

  patchEntry: async (id, patch) => {
    try {
      const entry = await api.patch<VocabEntry>(`/api/v1/vocab/entries/${id}`, patch);
      set({
        entries: get().entries.map((e) => (e.id === id ? entry : e)),
        detail: get().detail?.id === id ? entry : get().detail,
      });
      await get().refreshCounters();
      return true;
    } catch (err) {
      set({ entriesError: message(err, "could not update that entry") });
      return false;
    }
  },

  addEntry: async (input) => {
    try {
      const res = await api.post<{ entry: VocabEntry }>("/api/v1/vocab/entries", {
        ...input,
        source: { kind: "manual", detail: "added from the vocabulary bank" },
      });
      set({ entries: [res.entry, ...get().entries.filter((e) => e.id !== res.entry.id)] });
      await get().refreshCounters();
      return res.entry;
    } catch (err) {
      set({ entriesError: message(err, "could not add that word") });
      return null;
    }
  },

  lookupWord: (word, sentence) =>
    api.post<LookupResponse>("/api/v1/vocab/lookup", { word, sentence: sentence || null }),

  // -------------------------------------------------------------------- detail
  detail: null,
  detailLoading: false,
  detailError: null,

  openDetail: async (id) => {
    const cached = get().entries.find((e) => e.id === id) ?? null;
    set({ detail: cached, detailLoading: true, detailError: null });
    try {
      const entry = await api.get<VocabEntry>(`/api/v1/vocab/entries/${id}`);
      set({ detail: entry, detailLoading: false });
    } catch (err) {
      set({
        detailLoading: false,
        detailError: message(err, "could not load that entry"),
      });
    }
  },

  closeDetail: () => set({ detail: null, detailError: null, detailLoading: false }),

  // --------------------------------------------------------------- suggestions
  suggestions: [],
  suggestionsTotal: 0,
  suggestionsLoading: false,
  suggestionsError: null,
  suggestionsOffline: false,
  suggestionBusy: [],

  loadSuggestions: async () => {
    set({ suggestionsLoading: true, suggestionsError: null });
    try {
      const res = await api.get<SuggestionsResponse>("/api/v1/vocab/suggestions?limit=100");
      set({
        suggestions: res.items ?? [],
        suggestionsTotal: res.total ?? (res.items ?? []).length,
        suggestionsLoading: false,
        suggestionsOffline: false,
      });
      useSrsStore.setState({ suggestedCount: res.total ?? (res.items ?? []).length });
    } catch (err) {
      set({
        suggestions: [],
        suggestionsTotal: 0,
        suggestionsLoading: false,
        suggestionsOffline: isOffline(err),
        suggestionsError: message(err, "could not load your suggestion inbox"),
      });
    }
  },

  acceptSuggestion: async (id) => {
    set({ suggestionBusy: [...get().suggestionBusy, id], suggestionsError: null });
    try {
      await api.post(`/api/v1/vocab/suggestions/${id}/accept`);
      set({
        suggestions: get().suggestions.filter((s) => s.id !== id),
        suggestionsTotal: Math.max(0, get().suggestionsTotal - 1),
      });
      await get().refreshCounters();
      return true;
    } catch (err) {
      set({ suggestionsError: message(err, "could not accept that word") });
      return false;
    } finally {
      set({ suggestionBusy: get().suggestionBusy.filter((b) => b !== id) });
    }
  },

  dismissSuggestion: async (id) => {
    set({ suggestionBusy: [...get().suggestionBusy, id], suggestionsError: null });
    try {
      await api.post(`/api/v1/vocab/suggestions/${id}/dismiss`);
      set({
        suggestions: get().suggestions.filter((s) => s.id !== id),
        suggestionsTotal: Math.max(0, get().suggestionsTotal - 1),
      });
      await get().refreshCounters();
      return true;
    } catch (err) {
      set({ suggestionsError: message(err, "could not dismiss that word") });
      return false;
    } finally {
      set({ suggestionBusy: get().suggestionBusy.filter((b) => b !== id) });
    }
  },

  acceptAllSuggestions: async () => {
    const ids = get().suggestions.map((s) => s.id);
    if (ids.length === 0) return 0;
    set({ suggestionBusy: ids, suggestionsError: null });
    try {
      const res = await api.post<{ accepted: number; ids: string[] }>(
        "/api/v1/vocab/suggestions/accept-all",
        { ids },
      );
      set({ suggestions: [], suggestionsTotal: 0 });
      await get().refreshCounters();
      return res.accepted ?? ids.length;
    } catch (err) {
      set({ suggestionsError: message(err, "could not accept the inbox") });
      return 0;
    } finally {
      set({ suggestionBusy: [] });
    }
  },

  // --------------------------------------------------------------------- decks
  decks: [],
  decksLoading: false,
  decksError: null,
  deckBusy: null,

  loadDecks: async () => {
    set({ decksLoading: true, decksError: null });
    try {
      const res = await api.get<{ items: SeedDeck[] }>("/api/v1/vocab/decks");
      set({ decks: res.items ?? [], decksLoading: false });
    } catch (err) {
      set({
        decks: [],
        decksLoading: false,
        decksError: message(err, "could not load the study decks"),
      });
    }
  },

  optInDeck: async (deckId) => {
    set({ deckBusy: deckId, decksError: null });
    try {
      const res = await api.post<DeckOptInResult>(
        `/api/v1/vocab/decks/${encodeURIComponent(deckId)}/opt-in`,
      );
      await get().loadDecks();
      await get().refreshCounters();
      return res;
    } catch (err) {
      set({ decksError: message(err, "could not add that deck") });
      return null;
    } finally {
      set({ deckBusy: null });
    }
  },

  // --------------------------------------------------------------------- stats
  stats: null,
  statsLoading: false,
  statsError: null,
  statsOffline: false,

  loadStats: async () => {
    set({ statsLoading: true, statsError: null });
    try {
      const stats = await api.get<SrsStats>("/api/v1/vocab/stats");
      set({ stats, statsLoading: false, statsOffline: false });
      syncSrsBadge({ due_today: stats.due_today, suggested: stats.counts.suggested });
    } catch (err) {
      set({
        statsLoading: false,
        statsOffline: isOffline(err),
        statsError: message(err, "could not load your vocabulary statistics"),
      });
    }
  },

  refreshCounters: async () => {
    try {
      const stats = await api.get<SrsStats>("/api/v1/vocab/stats");
      set({ stats, statsOffline: false });
      syncSrsBadge({ due_today: stats.due_today, suggested: stats.counts.suggested });
    } catch {
      /* counters are advisory — the screen already shows the real error */
    }
  },
}));

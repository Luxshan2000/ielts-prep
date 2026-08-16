/**
 * Fetches the three listening ledgers and folds them into one list of `HistoryRow`.
 *
 * Shared by the history screen and by the header button that counts it, so the number on
 * the button is the number of rows behind it rather than a second, differently-computed
 * guess.
 *
 * The three requests are settled independently. Losing the drill ledger must not blank a
 * screen that can still show forty attempts, so a partial failure degrades to a named
 * warning and only a total failure becomes an error state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HistoryRow } from "@/components/practice/history";
import { api } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { useListeningStore } from "../store";
import type { Page } from "../types";
import {
  listeningHistoryRows,
  type AttemptListRow,
  type DrillListRow,
  type MockListRow,
} from "./adapt";

interface Ledgers {
  attempts: AttemptListRow[];
  mocks: MockListRow[];
  drills: DrillListRow[];
}

const EMPTY: Ledgers = { attempts: [], mocks: [], drills: [] };

export interface ListeningHistoryState {
  rows: HistoryRow[];
  loading: boolean;
  /** Set only when nothing at all could be read. */
  error: string | null;
  /** Set when some ledgers answered and others did not — the list is short, not wrong. */
  partial: string | null;
  reload: () => void;
}

export function useListeningHistory(): ListeningHistoryState {
  const tests = useListeningStore((s) => s.tests);
  const scripts = useListeningStore((s) => s.scripts);
  const loadLibrary = useListeningStore((s) => s.loadLibrary);

  const [ledgers, setLedgers] = useState<Ledgers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [attempts, mocks, drills] = await Promise.allSettled([
      api.get<Page<AttemptListRow>>("/api/v1/listening/attempts?limit=200"),
      api.get<{ items: MockListRow[] }>("/api/v1/listening/mock/sessions?limit=100"),
      api.get<{ items: DrillListRow[] }>("/api/v1/listening/practice/sessions?limit=200"),
    ]);

    const missing: string[] = [];
    if (attempts.status === "rejected") missing.push("your tests and single parts");
    if (mocks.status === "rejected") missing.push("your mock papers");
    if (drills.status === "rejected") missing.push("your drills");

    if (attempts.status === "rejected" && mocks.status === "rejected" && drills.status === "rejected") {
      setError(friendlyMessage(attempts.reason, "your listening history could not be read"));
      setPartial(null);
      setLedgers(null);
    } else {
      setError(null);
      setPartial(
        missing.length > 0
          ? `${missing.join(" and ")} could not be read, so this list is incomplete.`
          : null,
      );
      setLedgers({
        attempts: attempts.status === "fulfilled" ? attempts.value.items : [],
        mocks: mocks.status === "fulfilled" ? mocks.value.items : [],
        drills: drills.status === "fulfilled" ? drills.value.items : [],
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // Titles come from the library, so a history opened directly by URL has to have it.
    void loadLibrary();
  }, [load, loadLibrary]);

  useSidecarRecovery(() => void load());

  const rows = useMemo(
    () => listeningHistoryRows({ ...(ledgers ?? EMPTY), library: { tests, scripts } }),
    [ledgers, tests, scripts],
  );

  return { rows, loading, error, partial, reload: () => void load() };
}

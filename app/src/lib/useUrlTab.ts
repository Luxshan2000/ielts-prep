/**
 * Keeps a tab strip and the `?tab=` query parameter in sync.
 *
 * Three rules, and the third is the reason this is shared:
 *
 * 1. The tab comes from `?tab=`, so a screen survives a reload and a link into a
 *    specific view works.
 * 2. A missing or unrecognised value falls back to the first tab rather than
 *    rendering nothing — a hand-typed or stale URL should land somewhere real.
 * 3. **When the tab is the default, the parameter is deleted rather than set.**
 *    The canonical URL for a room carries no query string, so the address bar and
 *    anything the learner copies out of it stay clean.
 *
 * That third clause is a product rule about what a shareable URL looks like, not
 * an implementation detail, and it was restated by hand in `/grammar`, `/vocab`
 * and `/pron`. Three copies of a rule is three chances for one of them to start
 * emitting `?tab=review` on the default view.
 *
 * Navigation is always `replace`, because flipping between tabs is not a place you
 * should have to press Back through.
 */

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useUrlTab<T extends string>(
  values: readonly T[],
  fallback: T,
): [T, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: T = values.includes(raw as T) ? (raw as T) : fallback;

  const setTab = useCallback(
    (next: string) => {
      const search = new URLSearchParams(params);
      if (next === fallback) search.delete("tab");
      else search.set("tab", next);
      setParams(search, { replace: true });
    },
    [params, setParams, fallback],
  );

  return [tab, setTab];
}

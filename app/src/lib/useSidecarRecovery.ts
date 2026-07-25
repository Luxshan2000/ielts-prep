import { useEffect, useRef } from "react";
import { useSessionStore } from "@/stores";

/**
 * Re-run a screen's loader when the sidecar comes back.
 *
 * `useSessionStore` already detects the round trip — any request that cannot reach
 * the process flips `offline`, a backoff poll watches `/health`, and a successful
 * reconnect bumps `generation` (the port and bearer token both rotate across a
 * restart, so the contract is re-resolved first). Nothing consumed that counter,
 * which meant a screen that failed during the outage sat on its error card until
 * the learner pressed "Try again" by hand — while the banner above it claimed the
 * app had reconnected. Mounting this hook closes the loop.
 *
 * The callback is held in a ref, so passing an inline arrow is safe: the effect
 * fires on a real reconnection and never on a re-render.
 */
export function useSidecarRecovery(onReconnect: () => void): void {
  const generation = useSessionStore((s) => s.generation);
  const callback = useRef(onReconnect);
  callback.current = onReconnect;

  // Seeded with the generation at mount, so a screen opened AFTER a recovery does
  // not immediately reload the data it has only just fetched.
  const seen = useRef(generation);

  useEffect(() => {
    if (generation === seen.current) return;
    seen.current = generation;
    callback.current();
  }, [generation]);
}

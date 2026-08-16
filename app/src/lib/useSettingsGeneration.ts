import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores";

/**
 * Re-run a screen's loader when the selected providers change.
 *
 * The sibling of `useSidecarRecovery`, and it exists for the same reason: a global
 * store already knows the world moved, and nothing was listening. `useSettingsStore`
 * bumps `generation` whenever a `providers` PATCH lands, because at that moment every
 * artefact an engine produced belongs to the *previous* provider — a rendered listening
 * part is no longer the audio this app would generate for that script.
 *
 * A screen that is open across the change would otherwise keep the readiness snapshot it
 * took on entry: "Audio ready", no Prepare button, and a signed URL for a WAV the
 * sidecar no longer considers current. Mounting this hook closes that loop.
 *
 * The callback is held in a ref, so an inline arrow is safe: the effect fires on a real
 * provider change and never on a re-render.
 *
 * Seeded with the generation at mount, so a screen opened *after* the change does not
 * immediately reload data it has only just fetched — that case is handled at the source
 * instead: `loadLibrary` records the generation it fetched under and refuses to serve a
 * snapshot from an older one.
 */
export function useSettingsGeneration(onChange: () => void): void {
  const generation = useSettingsStore((s) => s.generation);
  const callback = useRef(onChange);
  callback.current = onChange;

  const seen = useRef(generation);

  useEffect(() => {
    if (generation === seen.current) return;
    seen.current = generation;
    callback.current();
  }, [generation]);
}

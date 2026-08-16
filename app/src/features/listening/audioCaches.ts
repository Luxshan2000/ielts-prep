import { api } from "@/lib/api";
import { useCoachStore } from "./components/coach/store";
import { useListeningStore } from "./store";

/**
 * Forget everything the app believes about generated audio, then re-ask.
 *
 * Called from exactly two places, both of which mean "what is on disk is no longer what
 * this app would produce": a provider change (`useSettingsGeneration`) and the
 * generated-audio purge in Settings → Data.
 *
 * Four caches have to go, and leaving any one of them is enough to keep serving the old
 * engine's output:
 *
 *   1. the ticket cache — a `media-read` ticket is minted for one exact path and stays
 *      valid for its TTL, so the player would keep a working URL for a deleted file;
 *   2. `detail` — the loaded test carries each part's `audio_ready` flag and media path;
 *   3. the coach's `slots` and `replays` — replay windows are offsets into a specific
 *      render, and they are meaningless against a different one;
 *   4. the library listing, force-reloaded so the readiness flags come from the sidecar
 *      rather than from the snapshot taken on first visit.
 *
 * The prepare state is deliberately kept: it is per-key progress UI, and a finished
 * render that has just been invalidated shows as done until the reload replaces it.
 */
export async function dropGeneratedAudioCaches(): Promise<void> {
  api.clearTicketCache();
  useListeningStore.setState({ detail: null, detailError: null });
  useCoachStore.setState({ slots: {}, replays: {} });
  await useListeningStore.getState().loadLibrary(true);
}

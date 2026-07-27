/**
 * Client for the speaking-drill routes.
 *
 * Two things here are not obvious from the route list:
 *
 * 1. `POST /drills/attempts` is **multipart**, not JSON — it carries a WAV. The shared
 *    `api.post` helper JSON-encodes its body, so the upload goes through `fetch`
 *    directly with the same base URL and bearer token.
 * 2. Drills are refused with 409 while a mock sitting is open, on purpose. That is not
 *    an error to retry — it is the exam-conditions rule, and the UI says so.
 */

import { ApiError, api } from "@/lib/api";
import type { CardDrills, DrillKindInfo, DrillResult } from "./types";

const BASE = "/api/v1/speaking/drills";

/** Thrown when a mock sitting is open. Carries the server's explanation verbatim. */
export class MockInProgressError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "MockInProgressError";
  }
}

function rethrow(err: unknown): never {
  if (err instanceof ApiError && err.status === 409) {
    throw new MockInProgressError(err.detail || "A mock exam is in progress.");
  }
  throw err;
}

/** The four kinds and how each is graded — static, safe to fetch once. */
export async function fetchKinds(): Promise<DrillKindInfo[]> {
  const doc = await api.get<{ kinds?: DrillKindInfo[] }>(`${BASE}/kinds`);
  return doc.kinds ?? [];
}

/** Every drill one card can offer, plus the recommended two-minute order. */
export async function fetchCardDrills(cardId: string, attempted: boolean): Promise<CardDrills> {
  try {
    return await api.get<CardDrills>(
      `${BASE}/cards/${encodeURIComponent(cardId)}?attempted=${attempted ? "true" : "false"}`,
    );
  } catch (err) {
    rethrow(err);
  }
}

/**
 * Synthesize an item's spoken reference and return a playable URL.
 *
 * The server renders into the media cache the ticket-authed route already serves, so
 * the returned path still has to go through `api.mediaUrl` to pick up a ticket.
 */
export async function fetchItemAudio(
  cardId: string,
  itemId: string,
  attempted: boolean,
  voice?: string,
): Promise<string | null> {
  try {
    const doc = await api.post<{ url?: string; path?: string; audio_url?: string }>(
      `${BASE}/audio`,
      { card_id: cardId, item_id: itemId, attempted, ...(voice ? { voice } : {}) },
    );
    const path = doc.url ?? doc.path ?? doc.audio_url;
    if (!path) return null;
    return path.startsWith("http") ? path : await api.mediaUrl(path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) rethrow(err);
    // A missing TTS engine should silence the play button, not break the drill.
    return null;
  }
}

/** Grade one attempt. Send `wav` for spoken kinds, `choice` for perception kinds. */
export async function submitAttempt(input: {
  cardId: string;
  itemId: string;
  attempted: boolean;
  wav?: Blob;
  choice?: string;
  transcript?: string;
}): Promise<DrillResult> {
  const form = new FormData();
  form.set("card_id", input.cardId);
  form.set("item_id", input.itemId);
  form.set("attempted", String(input.attempted));
  if (input.wav) form.set("wav", input.wav, "attempt.webm");
  if (input.choice != null) form.set("choice", input.choice);
  if (input.transcript != null) form.set("transcript", input.transcript);

  const { baseUrl, token } = await api.contract();
  const res = await fetch(`${baseUrl}${BASE}/attempts`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (!res.ok) {
    let detail = `Drill grading failed (${res.status}).`;
    let code = "error";
    try {
      const body = (await res.json()) as { detail?: string; code?: string };
      detail = body.detail ?? detail;
      code = body.code ?? code;
    } catch {
      /* a non-JSON error body is still an error; keep the status message */
    }
    if (res.status === 409) throw new MockInProgressError(detail);
    throw new ApiError(res.status, code, detail);
  }
  return (await res.json()) as DrillResult;
}

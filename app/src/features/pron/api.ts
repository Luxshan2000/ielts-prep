import { api } from "@/lib/api";

/**
 * The pronunciation routes, reached from the UI for the first time.
 *
 * Ten of these have existed since the module was written and nothing has ever called them.
 * That is not a small detail: a backend nobody exercises grows defects that only surface when
 * a screen finally arrives, which is exactly what happened to the score these endpoints used
 * to publish (an ASR confidence, banded green/amber/red).
 *
 * So the shapes here say plainly what the sidecar can and cannot claim. `score` is null under
 * proxy-v1 and `words_the_recogniser_was_unsure_of` is what the numbers honestly support.
 */

const BASE = "/api/v1/pron";

export interface UnsureWord {
  word: string;
  confidence: number | null;
  /** Null under proxy-v1 — a confidence is not a pronunciation score. */
  score: number | null;
  recogniser_unsure: boolean | null;
  heard_approx?: string | null;
}

export interface ReadAloudResult {
  transcript: string;
  /** Null under proxy-v1. Present only when a method that genuinely scores lands. */
  overall: number | null;
  mean_confidence: number | null;
  words_the_recogniser_was_unsure_of: UnsureWord[];
  method: string;
  method_note: string;
  accent_notice: string;
  media_url?: string;
}

export interface DrillItem {
  id: string;
  drill_type: string;
  a: string;
  b: string;
  contrast?: string | null;
  sentence_a?: string | null;
  sentence_b?: string | null;
  key?: string | null;
  prompt?: string | null;
}

export interface DrillSet {
  drill_type: string;
  contrast: string | null;
  items: DrillItem[];
  contrasts: { id: string; label?: string; contrast?: string }[];
  accuracy: Record<string, unknown>;
  accent_notice: string;
  empty_reason: string | null;
}

export function getDrills(type = "minimal_pair_ab", contrast?: string) {
  const query = new URLSearchParams({ type, limit: "10" });
  if (contrast) query.set("contrast", contrast);
  return api.get<DrillSet>(`${BASE}/drills?${query}`);
}

/** Send one read-aloud take with the sentence the learner was asked to say. */
export function readAloud(audio: Blob, referenceText: string) {
  const form = new FormData();
  form.append("wav", audio, "read.webm");
  form.append("reference_text", referenceText);
  form.append("source", "read_aloud");
  return api.post<ReadAloudResult>(`${BASE}/read-aloud`, form);
}

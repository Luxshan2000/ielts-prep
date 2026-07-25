/**
 * Quote anchoring for the feedback report (04 §7).
 *
 * The sidecar already decided which quotes exist in the transcript (04 §6.4 step 4 —
 * `errors[].anchored`, plus the `unanchored` list) using a normalized-substring match.
 * The renderer has to repeat that match to get **offsets**, because `AnnotatedText`
 * highlights by UTF-16 range. This mirrors `scoring/speaking.py::_normalize` exactly:
 * lowercase, every non-word character collapsed to a single space, trimmed.
 */

import type { Annotation } from "@/components/ui";
import type { ReportError } from "../store";

interface Normalized {
  text: string;
  /** `map[i]` is the original index of normalized character `i`. */
  map: number[];
}

const WORD_RE = /[\p{L}\p{N}_]/u;

function normalize(input: string): Normalized {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (WORD_RE.test(ch)) {
      if (pendingSpace && chars.length > 0) {
        chars.push(" ");
        map.push(i);
      }
      pendingSpace = false;
      const lower = ch.toLowerCase();
      chars.push(lower.length === 1 ? lower : lower[0]);
      map.push(i);
    } else {
      pendingSpace = true;
    }
  }
  return { text: chars.join(""), map };
}

export interface QuoteMatch {
  start: number;
  end: number;
}

/**
 * Locate `quote` inside `text`, ignoring case and punctuation. Evidence strings often
 * read `"…quote…" — commentary`, so the quoted head is tried as a fallback (the same
 * concession the sidecar's anchoring makes).
 */
export function findQuote(text: string, quote: string): QuoteMatch | null {
  if (!text || !quote) return null;
  const hay = normalize(text);
  if (!hay.text) return null;

  const candidates = [quote, quote.split("—")[0], quote.replace(/^[“"'\s]+|[”"'\s.]+$/g, "")];
  for (const candidate of candidates) {
    const needle = normalize(candidate).text;
    if (needle.length < 3) continue;
    const at = hay.text.indexOf(needle);
    if (at < 0) continue;
    const start = hay.map[at];
    const end = hay.map[at + needle.length - 1] + 1;
    if (start === undefined || end === undefined || end <= start) continue;
    return { start, end };
  }
  return null;
}

/** True when the quote can be highlighted somewhere in `text`. */
export function quoteAnchors(text: string, quote: string): boolean {
  return findQuote(text, quote) !== null;
}

/**
 * `AnnotatedText` annotations for one candidate turn. Returns the annotations plus the
 * indices of the report errors that were consumed, so the caller can list the leftovers
 * below the transcript instead of dropping them.
 */
export function annotateTurn(
  text: string,
  errors: ReportError[],
): { annotations: Annotation[]; matched: number[] } {
  const annotations: Annotation[] = [];
  const matched: number[] = [];
  const taken: QuoteMatch[] = [];

  errors.forEach((error, index) => {
    const hit = findQuote(text, error.quote);
    if (!hit) return;
    // Overlaps are dropped rather than rendered wrong — buildSegments would skip them
    // silently and the note would go missing from the UI.
    if (taken.some((t) => hit.start < t.end && t.start < hit.end)) return;
    taken.push(hit);
    matched.push(index);
    annotations.push({
      start: hit.start,
      end: hit.end,
      severity: "error",
      note: error.issue || "Needs work",
      suggestion: error.better || undefined,
    });
  });

  return { annotations, matched };
}

/** A single "highlight the whole quote" annotation, for the quote-only fallback view. */
export function wholeQuoteAnnotation(quote: string, error: ReportError): Annotation[] {
  const trimmed = quote.trim();
  if (!trimmed) return [];
  return [
    {
      start: 0,
      end: trimmed.length,
      severity: "error",
      note: error.issue || "Needs work",
      suggestion: error.better || undefined,
    },
  ];
}

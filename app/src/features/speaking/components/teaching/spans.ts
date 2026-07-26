/**
 * Locating annotation spans inside a model transcript.
 *
 * The content contract (DESIGN.md §6.4 lint 12) guarantees every `span` is an exact
 * substring of its own transcript and that spans do not overlap — the UI locates
 * annotations by string search, which is why the lint gate exists. This module is
 * still defensive about all three ways that guarantee can break in the wild:
 *
 *  - a span that is not present at all (hand-edited pack, or a legacy row);
 *  - two annotations sharing identical span text (each takes the next occurrence,
 *    left to right, rather than both collapsing onto the first);
 *  - overlapping spans (the earlier one wins; the later is reported unresolved).
 *
 * Unresolved marks are returned rather than dropped silently so the viewer can still
 * list them beneath the transcript. Losing a teaching note because of a stray comma
 * would be worse than showing it without its highlight.
 */

export interface HasSpan {
  span: string;
}

export interface Placed<T extends HasSpan> {
  start: number;
  end: number;
  mark: T;
}

export interface Segment<T extends HasSpan> {
  text: string;
  placed: Placed<T> | null;
}

export interface Placement<T extends HasSpan> {
  placed: Placed<T>[];
  unresolved: T[];
}

/** Sorted, non-overlapping placements plus whatever could not be located. */
export function placeSpans<T extends HasSpan>(text: string, marks: T[]): Placement<T> {
  const found: Placed<T>[] = [];
  const unresolved: T[] = [];
  // Where the next search for this exact span text should start, so repeated spans
  // walk forward through the transcript instead of all landing on occurrence one.
  const cursor = new Map<string, number>();

  for (const mark of marks) {
    const span = mark.span;
    if (!span) {
      unresolved.push(mark);
      continue;
    }
    const from = cursor.get(span) ?? 0;
    let at = text.indexOf(span, from);
    if (at === -1 && from > 0) at = text.indexOf(span);
    if (at === -1) {
      unresolved.push(mark);
      continue;
    }
    cursor.set(span, at + span.length);
    found.push({ start: at, end: at + span.length, mark });
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: Placed<T>[] = [];
  let boundary = 0;
  for (const item of found) {
    if (item.start < boundary) {
      unresolved.push(item.mark);
      continue;
    }
    placed.push(item);
    boundary = item.end;
  }

  return { placed, unresolved };
}

/** The transcript cut into plain and marked runs, in reading order. */
export function segmentText<T extends HasSpan>(text: string, placed: Placed<T>[]): Segment<T>[] {
  const segments: Segment<T>[] = [];
  let at = 0;
  for (const item of placed) {
    if (item.start > at) segments.push({ text: text.slice(at, item.start), placed: null });
    segments.push({ text: text.slice(item.start, item.end), placed: item });
    at = item.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at), placed: null });
  return segments;
}

/**
 * Split a segmented transcript back into paragraphs.
 *
 * Model transcripts use `\n\n` between paragraphs, one per cue-card bullet, and the
 * paragraphing carries real information — it is how the learner sees that bullet 4
 * is a third of the answer. A span never crosses a paragraph break in authored
 * content, but if one did, the run is split at the break and both halves keep the
 * mark so the highlight stays continuous.
 */
export function toParagraphs<T extends HasSpan>(segments: Segment<T>[]): Segment<T>[][] {
  const paragraphs: Segment<T>[][] = [[]];
  for (const segment of segments) {
    const parts = segment.text.split(/\n{2,}/);
    parts.forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part === "") return;
      paragraphs[paragraphs.length - 1].push({ text: part, placed: segment.placed });
    });
  }
  return paragraphs.filter((p) => p.length > 0);
}

/**
 * Two independent mark layers over one transcript.
 *
 * Annotations and swap slots are authored against the *same* band-7 text and are
 * expected to overlap — a swap slot often wraps a whole sentence that already
 * carries two annotations inside it. One segmentation cannot express that, so the
 * text is cut at every boundary from either layer and each atomic run reports which
 * mark of each layer covers it. The renderer then decides who owns the click.
 */
export interface LayeredRun<A extends HasSpan, B extends HasSpan> {
  text: string;
  /** Index into the annotation placements, or -1. */
  aIndex: number;
  /** Index into the swap placements, or -1. */
  bIndex: number;
  a: Placed<A> | null;
  b: Placed<B> | null;
}

export function layerSpans<A extends HasSpan, B extends HasSpan>(
  text: string,
  aPlaced: Placed<A>[],
  bPlaced: Placed<B>[],
): LayeredRun<A, B>[] {
  const cuts = new Set<number>([0, text.length]);
  for (const p of aPlaced) {
    cuts.add(p.start);
    cuts.add(p.end);
  }
  for (const p of bPlaced) {
    cuts.add(p.start);
    cuts.add(p.end);
  }
  const points = [...cuts].filter((c) => c >= 0 && c <= text.length).sort((x, y) => x - y);

  const runs: LayeredRun<A, B>[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const aIndex = aPlaced.findIndex((p) => p.start <= start && p.end >= end);
    const bIndex = bPlaced.findIndex((p) => p.start <= start && p.end >= end);
    runs.push({
      text: text.slice(start, end),
      aIndex,
      bIndex,
      a: aIndex === -1 ? null : aPlaced[aIndex],
      b: bIndex === -1 ? null : bPlaced[bIndex],
    });
  }
  return runs;
}

/** Rough spoken-length estimate, used where the content omits `approx_seconds`. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

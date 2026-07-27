/**
 * Locating annotation and swap-slot spans inside a model answer.
 *
 * The content contract (DESIGN.md §8.4 lint 20) guarantees every `span` is an exact
 * substring of its own text and that annotations within one model do not overlap.
 * The UI locates them by string search, which is why that lint exists — and this
 * module is still defensive about all three ways the guarantee breaks in the wild:
 *
 *  - a span that is not present at all (a hand-edited pack, or a legacy row);
 *  - two annotations sharing identical span text — each takes the next occurrence,
 *    left to right, rather than both collapsing onto the first;
 *  - genuinely overlapping spans — the earlier one wins, the later is reported
 *    unresolved rather than dropped, so its note still renders beneath the text.
 *
 * Losing a teaching note to a stray comma would be worse than showing it without
 * its highlight.
 */

export interface HasSpan {
  span: string;
}

export interface Placed<T extends HasSpan> {
  start: number;
  end: number;
  mark: T;
}

export interface Placement<T extends HasSpan> {
  placed: Placed<T>[];
  unresolved: T[];
}

/** Sorted, non-overlapping placements plus whatever could not be located. */
export function placeSpans<T extends HasSpan>(text: string, marks: T[]): Placement<T> {
  const found: Placed<T>[] = [];
  const unresolved: T[] = [];
  // Where the next search for this exact span should start, so a repeated span walks
  // forward through the answer instead of every copy landing on occurrence one.
  const cursor = new Map<string, number>();

  for (const mark of marks) {
    const span = mark?.span ?? "";
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

/**
 * Two independent mark layers over one text.
 *
 * Annotations and swap slots are authored against the *same* band-7 answer and are
 * expected to overlap — a swap slot often wraps a date that already sits inside an
 * annotated clause. One segmentation cannot express that, so the text is cut at
 * every boundary from either layer and each atomic run reports which mark of each
 * layer covers it. The renderer then decides who owns the click.
 */
export interface LayeredRun {
  text: string;
  /** Index into the annotation placements, or -1. */
  aIndex: number;
  /** Index into the swap placements, or -1. */
  bIndex: number;
}

export function layerSpans<A extends HasSpan, B extends HasSpan>(
  text: string,
  aPlaced: Placed<A>[],
  bPlaced: Placed<B>[],
): LayeredRun[] {
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

  const runs: LayeredRun[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    runs.push({
      text: text.slice(start, end),
      aIndex: aPlaced.findIndex((p) => p.start <= start && p.end >= end),
      bIndex: bPlaced.findIndex((p) => p.start <= start && p.end >= end),
    });
  }
  return runs;
}

/**
 * Runs regrouped into paragraphs.
 *
 * Model answers use `\n\n` between paragraphs and the paragraphing carries real
 * information — it is how the learner sees that the overview is its own paragraph
 * and how long a body group is meant to be. A span never crosses a break in
 * authored content, but if one did, both halves keep their marks so the highlight
 * stays continuous.
 */
export function toParagraphs(runs: LayeredRun[]): LayeredRun[][] {
  const paragraphs: LayeredRun[][] = [[]];
  for (const run of runs) {
    const parts = run.text.split(/\n{2,}/);
    parts.forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part === "") return;
      paragraphs[paragraphs.length - 1].push({ ...run, text: part });
    });
  }
  return paragraphs.filter((p) => p.length > 0);
}

/** A plain string split into paragraphs, for the "your answer" column. */
export function splitParagraphs(text: string): string[] {
  return (text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

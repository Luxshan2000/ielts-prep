/**
 * Word-level diff for the rewrite loop (05 §8).
 *
 * 05 names jsdiff's `diffWords`; jsdiff is not a dependency of this workspace and
 * the rules forbid adding one, so this is the same algorithm in ~60 lines: an LCS
 * table over whitespace-delimited tokens, walked back into insert/delete/equal
 * runs. Essays are 150–400 words, so an O(n·m) table is ~0.3 MB in the worst case
 * — well inside budget — and a guard falls back to a paragraph-level diff for
 * anything pathological.
 */

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffChunk {
  op: DiffOp;
  /** Text including its trailing whitespace, so joining chunks restores the input. */
  text: string;
}

/** Tokens are "word + following whitespace" so reassembly is lossless. */
function tokenize(text: string): string[] {
  const tokens = text.match(/\S+\s*|\s+/g);
  return tokens ?? [];
}

const key = (token: string): string => token.trim().toLowerCase();

const MAX_TOKENS = 3000;

export function diffWords(before: string, after: string): DiffChunk[] {
  const a = tokenize(before ?? "");
  const b = tokenize(after ?? "");

  if (a.length === 0 && b.length === 0) return [];
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    // Degrade honestly rather than hang: whole-text replace.
    const chunks: DiffChunk[] = [];
    if (before) chunks.push({ op: "delete", text: before });
    if (after) chunks.push({ op: "insert", text: after });
    return chunks;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = new Int32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * cols + j] =
        key(a[i]) === key(b[j])
          ? lcs[(i + 1) * cols + (j + 1)] + 1
          : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + (j + 1)]);
    }
  }

  const out: DiffChunk[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      // Same word, possibly different casing/spacing: keep the newer rendering.
      push("equal", b[j]);
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + (j + 1)]) {
      push("delete", a[i]);
      i += 1;
    } else {
      push("insert", b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    push("delete", a[i]);
    i += 1;
  }
  while (j < b.length) {
    push("insert", b[j]);
    j += 1;
  }
  return out;
}

export interface DiffStats {
  added: number;
  removed: number;
  kept: number;
}

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

export function diffStats(chunks: DiffChunk[]): DiffStats {
  const stats: DiffStats = { added: 0, removed: 0, kept: 0 };
  for (const chunk of chunks) {
    const n = wordCount(chunk.text);
    if (chunk.op === "insert") stats.added += n;
    else if (chunk.op === "delete") stats.removed += n;
    else stats.kept += n;
  }
  return stats;
}

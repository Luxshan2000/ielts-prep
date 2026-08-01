/**
 * Wide content must scroll inside itself, never push the page sideways.
 *
 * A horizontal scrollbar on the window is the defect a learner actually reports, and it is
 * almost never where they think it is: one table five columns wide, in a panel that only
 * appears after a session ends, moves the whole layout. That is exactly how the vocabulary
 * session summary shipped — an unwrapped four-column table, and 582 of the bank's entries are
 * multi-word phrases ("take something into consideration"), so it only burst once the
 * vocabulary expansion landed.
 *
 * Measuring this in a browser needs every screen in a state that renders the offending panel,
 * which is why a live sweep of the routes found nothing. So this checks the source instead:
 * the two constructs that cannot fit a narrow window are a `<table>` and a `min-w-[...]`, and
 * both are fine — provided something above them is allowed to scroll.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) tsxFiles(path, out);
    else if (entry.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/** The nearest enclosing scroll container, searched backwards from an offending line. */
function scrollableAbove(lines: string[], index: number, window = 12): boolean {
  for (let i = index; i >= Math.max(0, index - window); i--) {
    if (/overflow-x-auto|overflow-auto|overflow-x-scroll|scrollbar-thin/.test(lines[i])) return true;
  }
  return false;
}

const FILES = tsxFiles(SRC);

describe("no construct can push the page sideways", () => {
  it("finds the components to check", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("wraps every <table> in something that scrolls", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/<table[\s>]/.test(line)) return;
        if (!scrollableAbove(lines, i)) {
          offenders.push(`${file.slice(SRC.length)}:${i + 1}`);
        }
      });
    }
    expect(offenders, "a table wider than its container drags the whole page with it").toEqual([]);
  });

  it("wraps every wide min-width floor in something that scrolls", () => {
    // A min-width is a promise the element will not shrink. Small ones (a 3rem number cell, a
    // 14rem search box) sit on wrapping flex children and are safe at any width. Anything from
    // this floor up cannot fit a narrow pane, so it needs somewhere to overflow — a chart, a
    // wide table, a split pane. 320px is where a phone-width layout starts to burst.
    const WIDE_PX = 320;
    const widthOf = (raw: string, unit: string) =>
      unit === "rem" ? Number(raw) * 16 : Number(raw);

    const offenders: string[] = [];
    for (const file of FILES) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const match = line.match(/min-w-\[([0-9.]+)(px|rem)\]/);
        if (!match) return;
        if (widthOf(match[1], match[2]) < WIDE_PX) return;
        if (!scrollableAbove(lines, i)) {
          offenders.push(`${file.slice(SRC.length)}:${i + 1} (${match[0]})`);
        }
      });
    }
    expect(offenders, "an element that refuses to shrink needs somewhere to overflow").toEqual([]);
  });
});

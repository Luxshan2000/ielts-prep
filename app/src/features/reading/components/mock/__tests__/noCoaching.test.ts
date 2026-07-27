/**
 * The invariant the whole mock rests on: **nothing inside the sitting can teach.**
 *
 * This is not a style rule. If a candidate can reach a strategy card, a worked
 * solution or the dictionary while the hour runs, the score that comes out measures
 * their use of the app rather than their reading. It is also exactly the kind of
 * thing reintroduced by accident six months from now ("just a small link back to the
 * strategy…"), which is why it is asserted against the source rather than left to
 * review.
 *
 * Comments are stripped first — this file's own prose would otherwise trip it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** The modules that render, or are rendered by, the hour itself. */
const SITTING_MODULES = ["MockSitting.tsx", "store.ts"];

function sourceOf(...segments: string[]): string {
  return readFileSync(join(here, "..", ...segments), "utf8");
}

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the sitting cannot teach", () => {
  it.each(SITTING_MODULES)("%s imports nothing from the coaching layer", (file) => {
    const body = code(sourceOf(file));
    const imports = [...body.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    // `script.ts` may borrow the pacing constants, but the sitting itself may not
    // pull a panel, a solution card or the coach store.
    expect(
      imports.filter((path) => /coach\/(?!labels)|Solutions|Strategy|Paraphrase|Vocab/i.test(path)),
    ).toEqual([]);
  });

  it.each(SITTING_MODULES)("%s links to no coaching route", (file) => {
    expect(code(sourceOf(file))).not.toMatch(/\/reading\/coach/);
  });

  it("turns the dictionary off inside the sitting", () => {
    const body = code(sourceOf("MockSitting.tsx"));
    expect(body).toMatch(/lookupEnabled=\{false\}/);
    // Double-clicked words still queue silently for after the paper.
    expect(body).toMatch(/onLookedUp=\{addLookedUp\}/);
  });

  it("has no pause control anywhere in the hour", () => {
    const body = code(sourceOf("MockSitting.tsx"));
    expect(body).not.toMatch(/setPaused/);
    expect(body).not.toMatch(/Pause/);
  });

  it("keeps highlighting and notes, which computer-delivered IELTS has", () => {
    const body = code(sourceOf("MockSitting.tsx"));
    expect(body).toMatch(/toolsEnabled\b/);
    expect(body).toMatch(/onAddHighlight=/);
    expect(body).toMatch(/onSetNote=/);
  });

  it("is fully operable from the keyboard", () => {
    const body = code(sourceOf("MockSitting.tsx"));
    expect(body).toMatch(/event\.altKey/);
    expect(body).toMatch(/ArrowRight/);
    expect(body).toMatch(/metaKey \|\| event\.ctrlKey/);
  });

  it("states the transfer-time fact once, in the briefing, and nowhere else", () => {
    const script = code(sourceOf("script.ts"));
    expect(script).toMatch(/no extra time/i);
    expect(code(sourceOf("MockSitting.tsx"))).not.toMatch(/transfer/i);
  });
});

describe("the sitting is opened and closed under exam conditions", () => {
  const store = code(sourceOf("store.ts"));

  it("opens the attempt as a full test under exam conditions, never as practice", () => {
    expect(store).toMatch(/mode:\s*"full"/);
    expect(store).toMatch(/exam_conditions:\s*true/);
    expect(store).not.toMatch(/exam_conditions:\s*false/);
  });

  it("keeps one wall-clock hour that cannot be paused", () => {
    expect(code(sourceOf("script.ts"))).toMatch(/MOCK_SECONDS = 60 \* 60/);
    expect(store).toMatch(/record\.endedAt \?\? Date\.now\(\)/);
    expect(store).toMatch(/end - record\.startedAt/);
  });

  it("records the sitting so the coach shuts itself while it runs", () => {
    expect(store).toMatch(/status: "sitting"/);
    const coach = code(readFileSync(join(here, "..", "..", "coach", "ReadingCoach.tsx"), "utf8"));
    expect(coach).toMatch(/activeSitting\(mockRecords\)/);
    expect(coach).toMatch(/examConditions/);
  });

  it("the report — after the hour — is where the loop back into learning belongs", () => {
    expect(code(sourceOf("MockReport.tsx"))).toMatch(/buildNextActions/);
    expect(code(sourceOf("analysis.ts"))).toMatch(/\/reading\/coach/);
  });
});

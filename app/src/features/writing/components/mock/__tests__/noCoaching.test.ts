/**
 * The invariant the whole mock rests on: **nothing inside the sitting can teach.**
 *
 * This is not a style rule. If a candidate can reach a model answer, a language
 * bank or the coach while the hour is running, the bands that come out the other
 * end measure their reading speed, not their writing. It is also exactly the kind
 * of thing that gets reintroduced by accident six months from now ("just a small
 * link back to the plan…"), which is why it is asserted against the source rather
 * than left to review.
 *
 * The check reads the sitting's own modules and fails on any import from the
 * teaching layer, any route string pointing at the coach, and the two panels that
 * would be the easiest to reach for. Comments are stripped first — this file's own
 * doc comment would otherwise trip it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** Files that render, or are rendered by, the hour itself. */
const SITTING_MODULES = ["MockSitting.tsx", "script.ts", "format.ts"];

function sourceOf(file: string): string {
  return readFileSync(join(here, "..", file), "utf8");
}

/** Remove block and line comments so documentation prose is not treated as code. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the sitting cannot teach", () => {
  it.each(SITTING_MODULES)("%s imports nothing from the teaching layer", (file) => {
    const body = code(sourceOf(file));
    const imports = [...body.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports.filter((path) => /coach|teaching|Templates|ModelAnswer/i.test(path))).toEqual(
      [],
    );
  });

  it.each(SITTING_MODULES)("%s links to no coaching route", (file) => {
    const body = code(sourceOf(file));
    expect(body).not.toMatch(/\/writing\/coach/);
  });

  it("the editor runs with no spellcheck and no third-party grammar overlay", () => {
    const body = code(sourceOf("MockSitting.tsx"));
    expect(body).toMatch(/spellCheck=\{false\}/);
    expect(body).toMatch(/data-gramm="false"/);
  });

  it("nothing auto-submits at zero", () => {
    const body = code(sourceOf("MockSitting.tsx"));
    // The only call to submit() is the one behind the hand-in confirmation.
    expect(body.match(/\.submit\(\)/g) ?? []).toHaveLength(1);
    expect(body).toMatch(/confirm\(/);
  });

  it("both tasks are reachable from minute zero", () => {
    const body = code(sourceOf("MockSitting.tsx"));
    expect(body).toMatch(/TASK_ORDER\.map/);
    expect(body).toMatch(/switchTask\(/);
  });

  it("the report — after the hour — is where the coach link belongs", () => {
    // The other half of the invariant: the loop back into learning must exist
    // somewhere, and these two files are the only places it may.
    expect(code(sourceOf("MockReport.tsx"))).toMatch(/\/writing\/coach/);
    expect(code(sourceOf("analysis.ts"))).toMatch(/\/writing\/coach/);
  });
});

describe("the sitting is opened and closed under exam conditions", () => {
  const store = code(sourceOf("store.ts"));

  it("opens both attempts in exam mode, never practice", () => {
    expect(store.match(/mode:\s*"exam"/g) ?? []).toHaveLength(2);
    expect(store).not.toMatch(/mode:\s*"practice"/);
  });

  it("keeps one wall-clock hour that cannot be paused", () => {
    expect(store).toMatch(/MOCK_SECONDS = 60 \* 60/);
    // Elapsed is measured against the wall clock, not accumulated while focused:
    // the hour has to keep running when the learner walks away from it.
    expect(store).toMatch(/record\.endedAt \?\? Date\.now\(\)/);
    expect(store).toMatch(/end - record\.startedAt/);
  });

  it("records the sitting so the coach can shut itself while it runs", () => {
    // The coach reads the same records and locks its models on `status === "sitting"`.
    expect(store).toMatch(/status: "sitting"/);
    const coach = readFileSync(join(here, "..", "..", "coach", "WritingCoach.tsx"), "utf8");
    expect(code(coach)).toMatch(/record\.status === "sitting"/);
  });
});

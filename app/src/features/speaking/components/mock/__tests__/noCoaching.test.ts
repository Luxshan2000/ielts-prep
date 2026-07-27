/**
 * The invariant the whole mock rests on: **nothing inside the sitting can teach.**
 *
 * This is not a style rule. If a candidate can reach a model answer, a vocabulary
 * list or the Topic Coach while the clock is running, the band that comes out the
 * other end measures their reading speed, not their English — and the trend built
 * from it is worthless. It is also exactly the kind of thing that gets reintroduced
 * by accident six months from now ("just a small link back to the topic…"), which is
 * why it is asserted against the source rather than left to review.
 *
 * The check reads the sitting's own modules and fails on any import from the teaching
 * layer or any route string pointing at the coach. Prose in comments is stripped
 * first — this file's own doc comment would otherwise trip it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** Files that render, or are rendered by, the live sitting. */
const SITTING_MODULES = [
  "MockSitting.tsx",
  "SittingStage.tsx",
  "SittingHud.tsx",
  "PrepPad.tsx",
  "PartTransition.tsx",
  "script.ts",
];

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
    expect(imports.filter((path) => /teaching|coach/i.test(path))).toEqual([]);
  });

  it.each(SITTING_MODULES)("%s links to no coaching route", (file) => {
    const body = code(sourceOf(file));
    expect(body).not.toMatch(/\/speaking\/coach/);
    expect(body).not.toMatch(/\/language-bank|\/vocabulary\//);
  });

  it("the sitting has no way to reveal a transcript of what was said", () => {
    const body = code(sourceOf("SittingStage.tsx"));
    expect(body).not.toMatch(/TranscriptFeed|usePipecatConversation/);
  });

  it("the report — after the attempt — is where the coach link belongs", () => {
    // The other half of the invariant: the loop back into learning must exist
    // somewhere, and this is the only place it may.
    expect(code(sourceOf("NextActions.tsx"))).toMatch(/\/speaking\/coach/);
  });
});

/**
 * Hiding the teaching layer from the *screen* is only half of it. The sidebar is still
 * on the page during a sitting, so a candidate can navigate to the Topic Coach in one
 * click and read the model answer with the clock running. What stops that is entirely
 * server-side: the `speaking_mocks` row opened by `POST /api/v1/speaking/mock/sessions`
 * puts the whole sidecar under exam conditions until it is closed.
 *
 * Round 2 shipped with these two halves not joined — the UI opened its sitting through
 * the ordinary `POST /api/v1/speaking/sessions` route, so no mock row was ever written
 * and the coach stayed wide open for the entire test. These assertions are here so that
 * cannot silently come back.
 */
describe("the sitting is opened and closed under exam conditions", () => {
  const api = code(sourceOf("api.ts"));
  const store = code(sourceOf("store.ts"));

  it("opens the sitting through the mock route, not the plain session route", () => {
    expect(api).toMatch(/post<[^>]*>\(\s*"\/api\/v1\/speaking\/mock\/sessions"/);
    expect(api).not.toMatch(/post<[^>]*>\(\s*"\/api\/v1\/speaking\/sessions"/);
  });

  it("asks the server to attach the live call, so there is one signalling path", () => {
    expect(api).toMatch(/live:\s*true/);
  });

  it("marks through the mock route, which is what closes the sitting", () => {
    expect(api).toMatch(/\/api\/v1\/speaking\/mock\/sessions\/\$\{[^}]+\}\/score/);
  });

  it("closes the sitting on every walk-out path, or the coach stays locked", () => {
    expect(api).toMatch(/abandonMock/);
    // Silence (nothing to mark) and a failed marking are the two ways a sitting ends
    // without a score; both must still release the lock.
    expect(store.match(/abandonMock\(/g) ?? []).toHaveLength(2);
  });
});

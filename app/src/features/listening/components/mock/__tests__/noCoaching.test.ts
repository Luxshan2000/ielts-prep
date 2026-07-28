/**
 * The invariant the whole mock rests on: **nothing inside the sitting can teach, and
 * nothing inside it can replay.**
 *
 * These are not style rules. If a candidate can reach a prediction chip, a signpost list
 * or the transcript while the paper runs, the score measures their use of the app rather
 * than their listening — and if they can play a part twice, it measures nothing at all.
 * Both are exactly the kind of thing reintroduced by accident six months from now ("just a
 * small link back to the brief…"), which is why they are asserted against the source
 * rather than left to review.
 *
 * The play-once rule moved from this renderer to the sidecar, and these assertions moved
 * with it. A renderer's promise not to offer a rewind button is a *preference*; the
 * condition that defines this paper has to be a refusal, from something the client cannot
 * reach. So what is checked here is that the sitting asks permission before it makes a
 * sound, and reads the ledger back from the server rather than from its own memory.
 *
 * Comments are stripped first — this file's own prose would otherwise trip it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** The modules that render, or are rendered by, the sitting itself. */
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
    expect(
      imports.filter((path) => /coach|Prediction|Signpost|Transcript|Brief/i.test(path)),
    ).toEqual([]);
  });

  it.each(SITTING_MODULES)("%s links to no coaching route", (file) => {
    expect(code(sourceOf(file))).not.toMatch(/\/listening\/coach/);
  });

  it("never renders a transcript or an explanation during the paper", () => {
    const body = code(sourceOf("MockSitting.tsx"));
    expect(body).not.toMatch(/TranscriptPanel/);
    expect(body).not.toMatch(/with_answers/);
    expect(body).not.toMatch(/explanation/);
  });

  it("mounts the player in exam mode, which carries no transport controls", () => {
    const body = code(sourceOf("MockSitting.tsx"));
    // `exam` with no value is the JSX shorthand for `exam={true}`.
    expect(body).toMatch(/<PartPlayer[\s\S]*?\n\s+exam\n/);
    expect(body).not.toMatch(/exam=\{false\}/);
    expect(body).not.toMatch(/onReady=/);
  });
});

describe("a recording plays once, and the server is what refuses the second", () => {
  const sitting = code(sourceOf("MockSitting.tsx"));
  const store = code(sourceOf("store.ts"));

  it("asks the server for the play before any audio element is mounted", () => {
    // The player is mounted only for the part the server has just granted. A grant that
    // never arrives therefore produces no sound at all, rather than sound plus a 409.
    expect(sitting).toMatch(/armed === playPart\.id \?[\s\S]*?<PartPlayer/);
    expect(sitting).toMatch(/const granted = await play\(mockId, scriptId\)/);
    expect(sitting).toMatch(/if \(granted\) setArmed\(scriptId\)/);
  });

  it("posts the play to the sidecar rather than recording it locally", () => {
    expect(store).toMatch(/sessions\/\$\{enc\(mockId\)\}\/play/);
    // No localStorage ledger: a play the client could forget is a play it could repeat.
    expect(store).not.toMatch(/localStorage/);
  });

  it("reads which parts are spent from the server's ledger, not from its own memory", () => {
    expect(sitting).toMatch(/Object\.keys\(session\?\.plays\.played/);
    expect(sitting).toMatch(/parts\.findIndex\(\(part\) => !playedIds\.has\(part\.id\)\)/);
    // Re-reading after a refused play means the screen shows the server's truth.
    expect(store).toMatch(/await get\(\)\.load\(mockId, \{ quiet: true \}\)/);
  });

  it("states the restriction in words, not only by withholding a button", () => {
    expect(sitting).toMatch(/plays once/i);
    expect(sitting).toMatch(/no pause, no rewind, no replay/i);
    // The control's accessible name carries it too, for anyone not reading the prose.
    expect(sitting).toMatch(/aria-label=\{`Play part \$\{playPart\.part\}\. This recording plays once/);
  });
});

describe("the sitting is opened and closed under exam conditions", () => {
  const store = code(sourceOf("store.ts"));
  const sitting = code(sourceOf("MockSitting.tsx"));

  it("opens the sitting through the mock endpoints, never as a bare attempt", () => {
    expect(store).toMatch(/\/api\/v1\/listening\/mock/);
    expect(store).toMatch(/api\.post<MockSession>\(`\$\{MOCK\}\/sessions`/);
    expect(store).not.toMatch(/mode:\s*"practice"/);
  });

  it("renders every part before the clock starts, and shows honest progress", () => {
    const preflight = code(sourceOf("MockPreflight.tsx"));
    // Parts ready out of four, plus the render job's own percentage — not a spinner.
    expect(preflight).toMatch(/ready_parts/);
    expect(preflight).toMatch(/job_progress_pct/);
    expect(preflight).toMatch(/role="progressbar"/);
    expect(preflight).toMatch(/disabled=\{!preparing\.audio\.ready\}/);
  });

  it("keeps one wall-clock timer that cannot be paused", () => {
    expect(store).toMatch(/Date\.now\(\) - started/);
    expect(sitting).toMatch(/Date\.parse\(startedAt\)/);
  });

  it("models both delivery formats, and labels which window is which", () => {
    const script = code(sourceOf("script.ts"));
    expect(script).toMatch(/CHECK_SECONDS = 120/);
    expect(script).toMatch(/TRANSFER_SECONDS = 600/);
    expect(script).toMatch(/clerical allowance/);
    // The window's own label comes from the server, so the two cannot disagree.
    expect(sitting).toMatch(/session\?\.timing\?\.window_label/);
    expect(sitting).toMatch(/paper \? "Transfer your answers" : "Check your answers"/);
  });

  it("requires an explicit abandon to leave, and does not stop the clock for it", () => {
    expect(sitting).toMatch(/Abandon this mock\?/);
    expect(sitting).toMatch(/destructive: true/);
  });

  it("puts the loop back into learning in the report, after the paper", () => {
    const report = code(sourceOf("MockReport.tsx"));
    expect(report).toMatch(/\/listening\/coach/);
    // Raw score leads; the band is secondary.
    expect(report).toMatch(/Raw score/);
    expect(report).toMatch(/score\.raw_score/);
  });
});

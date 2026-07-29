/**
 * Content-Security-Policy invariants (asset-visibility guard).
 *
 * Pack artwork — the listening map/plan SVGs and the reading diagrams — is served by the
 * sidecar on `http://127.0.0.1:<port>` behind a signed media ticket, exactly like the
 * audio. The CSP used to allow that origin under `media-src` but not under `img-src`, so
 * audio played and every image was silently refused by the browser. The failure mode is
 * uniquely nasty because nothing looks broken: the SVGs shipped, were checksummed, and
 * returned 200 with `content-type: image/svg+xml`, while `MapAsset` degraded politely to
 * "the map isn't in the installed content pack". Twenty `map_labelling` marks across the
 * listening bank were unanswerable, because the labels live on the plan.
 *
 * There are two CSPs and they must stay in step: the meta tag in `index.html` (dev and the
 * built SPA) and the header the packaged Electron main process injects. A fix applied to
 * one and not the other ships broken.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** Pull one directive out of a CSP string. */
function directive(csp: string, name: string): string {
  const found = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  return found ?? "";
}

const SIDECAR_ORIGIN = "http://127.0.0.1:*";

describe("renderer CSP (index.html)", () => {
  const html = read("../../index.html");
  const csp = /content="([^"]*default-src[^"]*)"/.exec(html)?.[1] ?? "";

  it("has a CSP at all", () => {
    expect(csp).toContain("default-src 'self'");
  });

  it("lets pack artwork load from the sidecar", () => {
    expect(directive(csp, "img-src")).toContain(SIDECAR_ORIGIN);
  });

  it("still lets pack audio load from the sidecar", () => {
    expect(directive(csp, "media-src")).toContain(SIDECAR_ORIGIN);
  });

  it("does not widen default-src to the network to achieve it", () => {
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
  });
});

describe("packaged CSP (electron/main.ts)", () => {
  const main = read("../../electron/main.ts");

  it("grants img-src the same sidecar origin as media-src", () => {
    const img = /"img-src[^"]*"/.exec(main)?.[0] ?? "";
    const media = /"media-src[^"]*"/.exec(main)?.[0] ?? "";
    expect(media).toContain(SIDECAR_ORIGIN);
    expect(img).toContain(SIDECAR_ORIGIN);
  });
});

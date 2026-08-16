/**
 * Feature registration invariant (integration guard).
 *
 * `App.tsx` discovers screens with `import.meta.glob('./features/*\/route.tsx')`. A
 * feature folder that ships a `page.tsx` but no `route.tsx` compiles, tests green, and
 * is completely INVISIBLE to users — there is no other symptom. This suite mirrors the
 * glob and asserts the shipped navigation, so that failure mode can never land silently.
 */

import { describe, expect, it, vi } from "vitest";
import type { FeatureRoute } from "@/lib/featureRoute";

// Eagerly loading every route pulls in the live-call screen and, through it, the WebRTC
// stack — which touches canvas/WebRTC APIs jsdom does not implement. Stub the transport
// exactly as the speaking feature's own route test does; the route modules stay real.
vi.mock("@pipecat-ai/small-webrtc-transport", () => ({ SmallWebRTCTransport: class {} }));
vi.mock("@pipecat-ai/client-js", () => ({ PipecatClient: class {}, RTVIEvent: {} }));
vi.mock("@pipecat-ai/client-react", () => ({
  PipecatClientAudio: () => null,
  PipecatClientProvider: () => null,
  useRTVIClientEvent: () => undefined,
  usePipecatClient: () => undefined,
  usePipecatClientMediaTrack: () => null,
  usePipecatClientTransportState: () => "disconnected",
  usePipecatConversation: () => ({ messages: [] }),
}));

const routeModules = import.meta.glob<{ default: FeatureRoute }>(
  "../features/*/route.tsx",
  { eager: true },
);
const featureFolders = import.meta.glob("../features/*/*", { eager: false });

/** Every folder under `src/features/`, derived from the files inside it. */
function featureNames(): string[] {
  const names = new Set<string>();
  for (const file of Object.keys(featureFolders)) {
    const match = /\.\.\/features\/([^/]+)\//.exec(file);
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

const routes: FeatureRoute[] = Object.values(routeModules)
  .map((mod) => mod.default)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.path.localeCompare(b.path));

describe("feature route discovery", () => {
  it("gives every feature folder a route.tsx", () => {
    const registered = new Set(
      Object.keys(routeModules).map((file) => /\.\.\/features\/([^/]+)\//.exec(file)?.[1]),
    );
    const missing = featureNames().filter((name) => !registered.has(name));
    expect(missing, `features with no route.tsx (invisible to users): ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("default-exports a usable FeatureRoute from every route.tsx", () => {
    for (const [file, mod] of Object.entries(routeModules)) {
      const route = mod.default;
      expect(route, `${file} has no default export`).toBeTruthy();
      expect(typeof route.path, `${file} has no path`).toBe("string");
      expect(route.path.startsWith("/"), `${file} path must be absolute`).toBe(true);
      expect(route.element, `${file} has no element`).toBeTruthy();
    }
  });

  it("registers unique paths", () => {
    const paths = routes.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  /**
   * The four skills run in the exam's own order. They used to run backwards from it, so the
   * last paper a candidate sits was the first thing in the sidebar.
   */
  it("shows the ten shipped screens in the sidebar, in the order a learner meets them", () => {
    const labelled = routes.filter((r) => Boolean(r.label)).map((r) => r.label);
    expect(labelled).toEqual([
      "Home",
      "Listening",
      "Reading",
      "Writing",
      "Speaking",
      "Vocabulary",
      "Grammar",
      "Pronunciation",
      "Progress",
      "Settings",
    ]);
  });

  /**
   * Grouping is what stops ten entries reading as one undifferentiated list. Home sits above
   * the headings; Settings is drawn in the footer, so neither carries a group.
   */
  it("files every sidebar entry under a heading, apart from Home and Settings", () => {
    const grouped = Object.fromEntries(
      routes.filter((r) => r.label).map((r) => [r.label, r.group ?? null]),
    );
    expect(grouped).toEqual({
      Home: null,
      Listening: "skills",
      Reading: "skills",
      Writing: "skills",
      Speaking: "skills",
      Vocabulary: "foundations",
      Grammar: "foundations",
      Pronunciation: "foundations",
      Progress: "review",
      Settings: null,
    });
  });

  it("keeps onboarding out of the sidebar but reachable at /onboarding", () => {
    const onboarding = routes.find((r) => r.path === "/onboarding");
    expect(onboarding).toBeTruthy();
    expect(onboarding?.label).toBeFalsy();
  });

  it("gives every sidebar entry an icon, and matches Home exactly", () => {
    for (const route of routes.filter((r) => r.label)) {
      expect(route.icon, `${route.path} has no sidebar icon`).toBeTruthy();
    }
    // Without `end`, "/" would highlight for every route in the app.
    expect(routes.find((r) => r.path === "/")?.end).toBe(true);
  });
});

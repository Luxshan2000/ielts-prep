import { describe, expect, it } from "vitest";
import route from "../route";

describe("listening route contract", () => {
  it("registers itself in the sidebar at /listening", () => {
    expect(route.path).toBe("/listening");
    expect(route.label).toBe("Listening");
    expect(route.icon).toBeTruthy();
    expect(route.order).toBe(20);
    expect(route.element).toBeTruthy();
  });

  it("exposes the child paths the hub navigates to", () => {
    const paths = (route.children ?? []).map((child) => (child.index ? "<index>" : child.path));
    // Assert the destinations the hub actually navigates to are PRESENT, rather than
    // pinning the whole list: adding a screen under /listening is ordinary feature work
    // and should not fail a route-contract test. Removing one of these would.
    for (const required of [
      "<index>",
      "test/:testId",
      "part/:scriptId",
      "review/:attemptId",
      "accents",
    ]) {
      expect(paths).toContain(required);
    }
    // Every child is relative — a leading slash would escape the feature's subtree.
    expect(paths.every((p) => p === "<index>" || !p?.startsWith("/"))).toBe(true);
    for (const child of route.children ?? []) expect(child.element).toBeTruthy();
  });
});

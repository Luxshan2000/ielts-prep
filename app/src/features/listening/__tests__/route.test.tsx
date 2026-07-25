import { describe, expect, it } from "vitest";
import route from "../route";

describe("listening route contract", () => {
  it("registers itself in the sidebar at /listening", () => {
    expect(route.path).toBe("/listening");
    expect(route.label).toBe("Listening");
    expect(route.icon).toBeTruthy();
    expect(route.order).toBe(50);
    expect(route.element).toBeTruthy();
  });

  it("exposes the child paths the hub navigates to", () => {
    const paths = (route.children ?? []).map((child) => (child.index ? "<index>" : child.path));
    expect(paths).toEqual([
      "<index>",
      "test/:testId",
      "part/:scriptId",
      "review/:attemptId",
      "accents",
    ]);
    for (const child of route.children ?? []) expect(child.element).toBeTruthy();
  });
});

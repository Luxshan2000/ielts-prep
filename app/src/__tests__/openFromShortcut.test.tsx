import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OpenFromShortcut, needsLauncher } from "../OpenFromShortcut";

afterEach(() => {
  delete window.__BANDREADY_SIDECAR__;
});

describe("the browser edition opened without the launcher", () => {
  it("is recognised only when the sidecar served the page without a token", () => {
    expect(needsLauncher()).toBe(false); // the desktop app and dev: nothing injected
    window.__BANDREADY_SIDECAR__ = { token: "t" };
    expect(needsLauncher()).toBe(false);
    window.__BANDREADY_SIDECAR__ = { token: "" };
    expect(needsLauncher()).toBe(true);
  });

  it("says what to do instead of showing a broken app", () => {
    render(<OpenFromShortcut />);
    expect(screen.getByRole("heading", { name: "Open BandReady from its shortcut" })).toBeTruthy();
    expect(screen.getByText(/Your work is all still there/)).toBeTruthy();
  });
});

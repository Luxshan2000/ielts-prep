/**
 * Route-wiring contract. `App.tsx` discovers `features/*\/route.tsx` and nests the
 * declared children under the feature path, so this mounts the exported route the
 * same way the app does and proves both levels resolve.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import writingRoute from "../../route";

// The hub fetches prompts/history on mount; keep the test off the network.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  const fail = () => Promise.reject(new actual.ApiError(0, "sidecar_unreachable", "offline"));
  return {
    ...actual,
    api: { ...actual.api, get: fail, post: fail, patch: fail, put: fail, del: fail },
  };
});

function mountAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={writingRoute.path} element={writingRoute.element}>
          {writingRoute.children?.map((child) => (
            <Route key={child.path} path={child.path} element={child.element} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("writing route", () => {
  it("declares the sidebar contract", () => {
    expect(writingRoute.path).toBe("/writing");
    expect(writingRoute.label).toBe("Writing");
    expect(writingRoute.order).toBe(40);
    expect(writingRoute.icon).toBeTruthy();
    // Assert the child routes the sidebar contract depends on are PRESENT rather than
    // pinning the exact list: adding a screen under /writing is normal feature work and
    // should not fail a test about the sidebar. Removing one of these would.
    const children = writingRoute.children?.map((c) => c.path) ?? [];
    expect(children).toContain("attempt/:attemptId");
    expect(children).toContain("coach/:promptId");
    expect(children).toContain("mock");
    // Every child is relative — a leading slash would escape the feature's own subtree.
    expect(children.every((p) => !p.startsWith("/"))).toBe(true);
  });

  it("renders the hub at /writing", () => {
    mountAt("/writing");
    expect(screen.getByRole("heading", { level: 1, name: "Writing" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /prompt bank/i })).toBeInTheDocument();
  });

  it("renders the attempt workspace at /writing/attempt/:id", () => {
    mountAt("/writing/attempt/wa_1");
    expect(screen.getByRole("heading", { level: 1, name: "Writing attempt" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /prompt bank/i })).toBeNull();
  });
});

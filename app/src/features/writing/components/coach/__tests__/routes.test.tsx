/**
 * Route wiring for the two new rooms, mounted the way `App.tsx` mounts them.
 *
 * The point is the unhappy path: with the sidecar unreachable, every one of these
 * screens must show a state — loading, error, or an honest empty — rather than a
 * white screen. A coach that throws on a missing payload would take the whole
 * Writing feature down with it, and the payload is missing on every prompt shipped
 * before it existed.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConfirmProvider } from "@/components/ui";
import writingRoute from "../../../route";

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
    <ConfirmProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={writingRoute.path} element={writingRoute.element}>
            {writingRoute.children?.map((child) => (
              <Route key={child.path} path={child.path} element={child.element} />
            ))}
          </Route>
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>,
  );
}

describe("the coach and the mock are reachable", () => {
  it("declares both rooms as child routes of /writing", () => {
    const paths = writingRoute.children?.map((c) => c.path) ?? [];
    expect(paths).toContain("coach");
    expect(paths).toContain("coach/:promptId");
    expect(paths).toContain("mock");
    expect(paths).toContain("mock/sitting/:mockId");
    expect(paths).toContain("mock/report/:mockId");
  });

  /**
   * The coach was a tab here and a route in the other three skills, so the same room was
   * reached three different ways across four. Both are header buttons now, and this asserts
   * the shared wording as much as the wiring: a "Coach" that is called something else in one
   * room is the inconsistency, not a cosmetic detail.
   */
  it("puts the coach and the mock on the Writing hub as header actions, named as elsewhere", async () => {
    mountAt("/writing");
    expect(await screen.findByRole("button", { name: /^coach$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^mock test$/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /coach/i })).not.toBeInTheDocument();
  });

  it("renders the coach with the engine down instead of throwing", async () => {
    mountAt("/writing/coach/wp_core_01");
    expect(await screen.findByRole("heading", { level: 1, name: /writing coach/i })).toBeInTheDocument();
  });

  it("renders the mock pre-flight with the engine down", async () => {
    mountAt("/writing/mock");
    expect(
      await screen.findByRole("heading", { level: 1, name: /mock writing paper/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No coach, no frameworks, no phrase help, no spellcheck/)).toBeInTheDocument();
  });

  it("says so plainly when a sitting is not on this machine", async () => {
    mountAt("/writing/mock/sitting/does-not-exist");
    expect(
      await screen.findByRole("button", { name: /back to the mock room/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not on this machine/i)).toBeInTheDocument();
  });

  it("renders the mock report for a sitting that is not on this machine", async () => {
    mountAt("/writing/mock/report/does-not-exist");
    expect(
      await screen.findByRole("heading", { level: 1, name: /mock writing report/i }),
    ).toBeInTheDocument();
  });
});

/**
 * The screen itself: mounted the way `App.tsx` mounts it, against a stubbed sidecar.
 *
 * What is worth asserting here is the wiring rather than the layout — that `/writing/history`
 * resolves, that it pages the attempts endpoint instead of showing the first fifty, that a
 * sitting kept in `localStorage` appears beside the essays, and that the writing hub offers a
 * way in.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import writingRoute from "../../route";
import type { AttemptSummary } from "../../store";

const get = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: (url: string) => get(url) as Promise<unknown>,
      post: () => Promise.reject(new actual.ApiError(0, "sidecar_unreachable", "offline")),
      patch: () => Promise.reject(new actual.ApiError(0, "sidecar_unreachable", "offline")),
    },
  };
});

function attempt(over: Partial<AttemptSummary> & { id: string }): AttemptSummary {
  return {
    prompt_id: "wp_1",
    parent_attempt_id: null,
    mode: "practice",
    status: "scored",
    word_count: 265,
    seconds_elapsed: 1800,
    overtime_seconds: 0,
    paste_events: 0,
    integrity_flag: null,
    submitted_at: "2026-07-26T15:30:00.000Z",
    overall_band: 7,
    started_at: "2026-07-26T15:00:00.000Z",
    prompt: {
      id: "wp_1",
      task_type: "task2",
      genre: "opinion",
      prompt_text: "Some people believe that university education should be free for everyone.",
    },
    ...over,
  };
}

const MOCK_RECORD = {
  id: "mk_1",
  module: "academic",
  startedAt: Date.parse("2026-07-20T09:00:00.000Z"),
  endedAt: Date.parse("2026-07-20T10:00:00.000Z"),
  status: "submitted",
  task1: { attemptId: "wa_t1", promptId: "wp_t1" },
  task2: { attemptId: "wa_t2", promptId: "wp_t2" },
  perTaskSeconds: { task1: 1200, task2: 2400 },
  overtimeSeconds: 0,
};

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

beforeEach(() => {
  window.localStorage.clear();
  get.mockReset();
});

afterEach(cleanup);

describe("/writing/history", () => {
  it("lists every attempt, following the cursor past the first page", async () => {
    window.localStorage.setItem("bandready.writing.mocks.v1", JSON.stringify([MOCK_RECORD]));
    get.mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/writing/mock/sessions")) return Promise.resolve({ items: [] });
      if (url.includes("cursor=wa_page1")) {
        return Promise.resolve({
          items: [
            attempt({
              id: "wa_t2",
              prompt_id: "wp_t2",
              mode: "exam",
              prompt: {
                id: "wp_t2",
                task_type: "task2",
                genre: "opinion",
                prompt_text: "Traffic congestion in cities is worsening. What can be done?",
              },
            }),
          ],
          next_cursor: null,
        });
      }
      return Promise.resolve({
        items: [
          attempt({ id: "wa_page1" }),
          attempt({ id: "wa_draft", status: "failed", overall_band: null }),
        ],
        next_cursor: "wa_page1",
      });
    });

    mountAt("/writing/history");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Your writing history" }),
    ).toBeInTheDocument();

    // Two pages of attempts, minus the one the sitting owns, plus the sitting itself.
    const list = await screen.findByRole("list");
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(3));

    expect(screen.getByText(/Academic paper/)).toBeInTheDocument();
    expect(screen.getByText("Band 7.0", { exact: false })).toBeInTheDocument();
    // The attempt marking could not reach is listed, unscored, in plain words.
    expect(screen.getByText(/Not marked/)).toBeInTheDocument();
  });

  it("filters to what the learner typed and offers a way back when nothing matches", async () => {
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/writing/mock/sessions")
        ? Promise.resolve({ items: [] })
        : Promise.resolve({
            items: [
              attempt({ id: "wa_1" }),
              attempt({
                id: "wa_2",
                prompt: {
                  id: "wp_2",
                  task_type: "ac_task1",
                  genre: "bar",
                  prompt_text: "The bar chart shows coffee consumption in four countries.",
                },
              }),
            ],
            next_cursor: null,
          }),
    );

    mountAt("/writing/history");
    const box = await screen.findByRole("textbox", { name: /search your history/i });

    await userEvent.type(box, "coffee");
    await waitFor(() => expect(screen.getByText(/1 of 2 shown/)).toBeInTheDocument());
    expect(screen.queryByText(/university education/)).toBeNull();

    await userEvent.clear(box);
    await userEvent.type(box, "kayaking");
    expect(await screen.findByText("Nothing matches that")).toBeInTheDocument();
  });

  it("says so plainly when there is nothing to show yet", async () => {
    get.mockImplementation(() => Promise.resolve({ items: [], next_cursor: null }));
    mountAt("/writing/history");
    expect(await screen.findByText("You have not written anything yet")).toBeInTheDocument();
  });

  it("reports a sidecar that is down instead of an empty history", async () => {
    const { ApiError } = await import("@/lib/api");
    get.mockImplementation(() =>
      Promise.reject(new ApiError(0, "sidecar_unreachable", "offline")),
    );
    mountAt("/writing/history");
    expect(await screen.findByText("Your history could not be loaded")).toBeInTheDocument();
  });
});

describe("the way in", () => {
  it("puts History in the writing header and drops the attempts tab", async () => {
    window.localStorage.setItem("bandready.writing.mocks.v1", JSON.stringify([MOCK_RECORD]));
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/writing/attempts")
        ? Promise.resolve({ items: [attempt({ id: "wa_1" })], next_cursor: null })
        : Promise.resolve({ items: [] }),
    );

    mountAt("/writing");

    const button = await screen.findByRole("button", { name: /history/i });
    // Counted the way the screen counts: one essay plus one sitting.
    await waitFor(() => expect(button).toHaveTextContent("2"));
    expect(screen.queryByRole("tab", { name: /your attempts/i })).toBeNull();

    await userEvent.click(button);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Your writing history" }),
    ).toBeInTheDocument();
  });
});

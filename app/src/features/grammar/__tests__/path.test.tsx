/**
 * The path screen, whose whole job is making 154 lessons feel walkable.
 *
 * Two of these are regressions waiting to happen and are the reason this file exists.
 *
 * The first is the locked row. `blocked_by` arrives as `{id, title}` objects, and the screen
 * used to treat them as ids and look each one up in a map keyed by id — so every lookup
 * missed, the "what is this waiting for" line never rendered, and 153 of the 154 rows said
 * "Locked" and nothing else. A wall of locks with no reasons is the single fastest way to
 * make a beginner close a syllabus.
 *
 * The second is the denominator. A learner is told this takes months; a progress display that
 * quietly drops the total is how that promise stops being checkable.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PathScreen } from "../components/PathScreen";
import { useGrammarStore } from "../store";
import type { PathPoint, PathResponse } from "../types";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, fetchPath: vi.fn() };
});

function point(over: Partial<PathPoint> & Pick<PathPoint, "id" | "sequence_index">): PathPoint {
  return {
    unit_id: "u01",
    title: `Lesson ${over.sequence_index}`,
    grammar_name: null,
    cefr_level: "A1",
    role: "form",
    estimated_minutes: 15,
    state: "locked",
    stage: null,
    blocked_by: [],
    ...over,
  };
}

const first = point({
  id: "gr_clause_svo",
  sequence_index: 1,
  title: "Putting a sentence together so that it says who does what",
  state: "next",
  is_next_up: true,
});

const second = point({
  id: "gr_be_present",
  sequence_index: 2,
  title: "Saying what someone or something is",
  blocked_by: [{ id: "gr_clause_svo", title: first.title }],
  start_here: "gr_clause_svo",
});

const far = point({
  id: "gr_stative",
  sequence_index: 3,
  title: "The verbs that refuse the continuous",
  blocked_by: [{ id: "gr_be_present", title: second.title }],
  start_here: "gr_clause_svo",
});

/** Its blocker is one lesson back; the lesson that actually opens it is three back. */
const deep = point({
  id: "gr_pres_vs_cont",
  sequence_index: 4,
  title: "Choosing between how things are and what is going on",
  blocked_by: [{ id: "gr_stative", title: far.title }],
  start_here: "gr_be_present",
});

const later = point({
  id: "gr_used_to",
  sequence_index: 5,
  unit_id: "u02",
  title: "Saying something was true and is not now",
  blocked_by: [{ id: "gr_stative", title: far.title }],
  start_here: "gr_clause_svo",
});

const PATH: PathResponse = {
  units: [
    {
      unit_id: "u01",
      title: "Building a sentence",
      track: "A",
      point_ids: [first.id, second.id, far.id, deep.id],
    },
    { unit_id: "u02", title: "Talking about now", track: "B", point_ids: [later.id] },
  ],
  points: [first, second, far, deep, later],
  summary: {
    total_points: 5,
    started: 0,
    practised: 0,
    mastered: 0,
    next_point_id: first.id,
    due_now: 0,
    harvested_codes: 0,
    pace_note: "The whole path is 5 points and about 1 hour of work.",
  },
};

/** A row, found by the lesson its own button names — blocker chips repeat titles. */
function row(title: string): HTMLElement {
  const found = screen
    .getAllByRole("listitem")
    .find((li) => li.querySelector("button")?.textContent?.includes(title));
  if (!found) throw new Error(`no row for “${title}”`);
  return found;
}

function open(path: PathResponse = PATH) {
  useGrammarStore.setState({ path, pathLoading: false, pathError: null, missing: false });
  return render(
    <MemoryRouter initialEntries={["/grammar"]}>
      <PathScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useGrammarStore.setState({ path: null, pathLoading: false, pathError: null });
});

describe("a locked lesson", () => {
  it("says which lesson it is waiting for, and links to it", () => {
    open();
    const locked = row(second.title);
    expect(within(locked).getByText(/Opens after/)).toBeInTheDocument();
    expect(within(locked).getByRole("button", { name: first.title })).toBeInTheDocument();
  });

  it("points at the lesson that actually starts the branch when it is further back", () => {
    open();
    // Its blocker is the lesson before it, but the one that has to be done first
    // is three back — and nothing else on the screen is sending the learner there.
    expect(within(row(deep.title)).getByText(/To get here, start at/)).toBeInTheDocument();
  });

  it("does not repeat the start-here line when the card at the top already says it", () => {
    open();
    expect(within(row(second.title)).queryByText(/To get here, start at/)).toBeNull();
  });
});

describe("the whole path", () => {
  it("never drops the denominator", () => {
    open();
    expect(screen.getByText(/lesson 1 of 5/)).toBeInTheDocument();
    expect(screen.getByText(/5 lessons in the path/)).toBeInTheDocument();
  });

  it("draws one block per part, and marks the part holding the next lesson", () => {
    open();
    expect(
      screen.getByRole("button", { name: /Part 1 of 2, Building a sentence, 0 of 4 finished/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Part 2 of 2, Talking about now/ })).toBeInTheDocument();
  });

  it("opens the part with the next lesson and leaves the rest shut", () => {
    open();
    expect(row(far.title)).toBeInTheDocument();
    expect(screen.queryByText(later.title)).toBeNull();
  });
});

describe("narrowing the list", () => {
  it("counts each state so a returning learner can see what is open", () => {
    open();
    expect(screen.getByRole("button", { name: /Ready to start 1/ })).toBeInTheDocument();
  });

  it("explains an empty result instead of showing nothing", async () => {
    open();
    await userEvent.type(screen.getByLabelText("Find a lesson"), "zzzz");
    expect(screen.getByText(/No lesson matches/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show the whole path/ })).toBeInTheDocument();
  });

  it("expands every part that has a match, so a search is never answered by a closed list", async () => {
    open();
    await userEvent.type(screen.getByLabelText("Find a lesson"), "refuse");
    expect(screen.getByText(far.title)).toBeInTheDocument();
  });
});

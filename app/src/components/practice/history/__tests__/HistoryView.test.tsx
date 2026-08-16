/**
 * The shared history screen, held to the parts of the contract every room depends on.
 *
 * These are deliberately not four rooms' worth of adapter tests — each feature owns those.
 * What is asserted here is only what would go wrong in all four at once: the status tone
 * actually reaching the page, a row with no destination not pretending to be a link, and
 * the filters coming from the rows rather than a fixed list.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HistoryView } from "../HistoryView";
import type { HistoryRow } from "../types";

function row(over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id: "a1",
    kind: "practice",
    title: "A passage about bees",
    startedAt: "2026-08-01T09:00:00Z",
    statusLabel: "Scored",
    href: "/reading/review/a1",
    ...over,
  };
}

function show(rows: HistoryRow[]) {
  return render(
    <MemoryRouter>
      <HistoryView rows={rows} emptyTitle="Nothing yet" emptyDescription="Sit one." />
    </MemoryRouter>,
  );
}

describe("HistoryView", () => {
  it("colours the status by its tone, so a scored row and an unmarked one do not read alike", () => {
    show([
      row({ id: "a", statusLabel: "Scored", statusTone: "success" }),
      row({ id: "b", statusLabel: "Not finished", statusTone: "warning" }),
      row({ id: "c", statusLabel: "Ended with an error", statusTone: "destructive" }),
      row({ id: "d", statusLabel: "Conversation saved", statusTone: "default" }),
      row({ id: "e", statusLabel: "Attempted" }),
    ]);

    expect(screen.getByText("Scored").className).toContain("text-success");
    expect(screen.getByText("Not finished").className).toContain("text-warning");
    expect(screen.getByText("Ended with an error").className).toContain("text-destructive");
    // `default` and an omitted tone are the same thing: the row is ordinary, so it
    // inherits the muted colour of the line it sits on rather than claiming attention.
    expect(screen.getByText("Conversation saved").className).not.toMatch(
      /text-(success|warning|destructive)/,
    );
    expect(screen.getByText("Attempted").className).not.toMatch(
      /text-(success|warning|destructive)/,
    );
  });

  it("renders a row with no destination as static, with its reason", () => {
    show([
      row({
        id: "d1",
        kind: "drill",
        title: "Matching headings drill",
        statusLabel: "Scored",
        href: null,
        unopenableReason: "drill reports are not kept after the run",
      }),
    ]);

    expect(
      screen.getByText(/drill reports are not kept after the run/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Matching headings drill/ })).toBeNull();
  });

  it("offers only the filters the rows actually contain", () => {
    show([row({ id: "a" }), row({ id: "b", kind: "mock", title: "Full test 2" })]);

    // The chips are the only pressable things on the page, so `aria-pressed` picks them
    // out from the rows, whose own kind badges carry the same words.
    const chips = screen
      .getAllByRole("button")
      .filter((el) => el.hasAttribute("aria-pressed"))
      .map((el) => el.textContent);

    expect(chips).toEqual(["Everything2", "Full test1", "Practice1"]);
  });
});

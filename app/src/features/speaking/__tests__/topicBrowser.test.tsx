/**
 * The topic browser exists because 108 sets could only be reached through a dropdown that
 * listed every card title for a part: 280 of them for Part 1. These tests pin the three
 * things that make it browsable rather than merely different.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopicBrowser } from "../components/TopicBrowser";
import type { SpeakingCard } from "../store";

function card(over: Partial<SpeakingCard> & { id: string; title: string }): SpeakingCard {
  return {
    part: 2,
    card_set_id: `set_${over.id}`,
    tags: [],
    difficulty: "core",
    builtin: false,
    ...over,
  } as SpeakingCard;
}

const CARDS = [
  card({ id: "a", title: "A job you would like", tags: ["work"], difficulty: "core" }),
  card({ id: "b", title: "A river near your home", tags: ["nature"], difficulty: "stretch" }),
  card({ id: "c", title: "A teacher who helped you", tags: ["education"], difficulty: "core" }),
];

function mount(onPick = vi.fn(), attempted = new Set<string>()) {
  render(
    <TopicBrowser
      cards={CARDS}
      attempted={attempted}
      onPick={onPick}
      actionLabel="Practise"
      emptyTitle="No topic sets installed"
      emptyDescription="Install a pack."
    />,
  );
  return onPick;
}

describe("the topic browser", () => {
  it("shows every topic as its own tile, not as dropdown rows", () => {
    mount();
    expect(screen.getByText("3 topics")).toBeInTheDocument();
    for (const c of CARDS) {
      expect(screen.getByRole("button", { name: `Practise: ${c.title}` })).toBeInTheDocument();
    }
  });

  it("searches the tags as well as the title, since a learner remembers the subject", async () => {
    mount();
    await userEvent.type(screen.getByLabelText("Search topics"), "nature");
    expect(screen.getByText("1 of 3 topics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /A river near your home/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /A job you would like/ })).not.toBeInTheDocument();
  });

  /** The specific reason the search is word-wise: no single field holds both terms. */
  it("narrows on several words at once rather than needing one field to hold them all", async () => {
    mount();
    await userEvent.type(screen.getByLabelText("Search topics"), "river stretch");
    expect(screen.getByText("1 of 3 topics")).toBeInTheDocument();
  });

  it("hands back the set id and the card, so the caller can start or study it", async () => {
    const onPick = mount();
    await userEvent.click(screen.getByRole("button", { name: /A teacher who helped you/ }));
    expect(onPick).toHaveBeenCalledWith("set_c", expect.objectContaining({ id: "c" }));
  });

  it("can hide what has already been attempted", async () => {
    mount(vi.fn(), new Set(["set_a"]));
    const status = screen.getByLabelText("Status");
    await userEvent.click(status);
    await userEvent.click(await screen.findByRole("option", { name: "Not started" }));
    expect(screen.getByText("2 of 3 topics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /A job you would like/ })).not.toBeInTheDocument();
  });

  /** An empty result from a filter is not the same as an empty pack, and must not read as one. */
  it("distinguishes nothing-matches from nothing-installed", async () => {
    mount();
    await userEvent.type(screen.getByLabelText("Search topics"), "zzzz");
    expect(screen.getByText("Nothing matches that")).toBeInTheDocument();
    expect(screen.queryByText("No topic sets installed")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Clear search and filters/ }));
    expect(screen.getByText("3 topics")).toBeInTheDocument();
  });

  it("offers no difficulty filter a pack cannot answer", () => {
    render(
      <TopicBrowser
        cards={[CARDS[0]]}
        attempted={new Set()}
        onPick={vi.fn()}
        actionLabel="Practise"
        emptyTitle="x"
        emptyDescription="y"
      />,
    );
    expect(screen.queryByLabelText("Difficulty")).not.toBeInTheDocument();
  });
});

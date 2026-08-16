/**
 * Searching the reference.
 *
 * Every article title in the pack is written as an answer — "Saying what is generally true",
 * "The word *the*, and what it promises the reader" — which is the right way round for
 * reading and useless for looking something up. A learner types the name they were taught:
 * "present simple", "articles", "despite or although". None of those words are in the title,
 * the one-liner or the also-called line, so the search found nothing and the screen said so
 * confidently.
 *
 * The pack ships the learner's own phrasings with every article for exactly this. They are
 * searched, and deliberately not displayed.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TheoryScreen } from "../components/theory/TheoryScreen";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

const INDEX = {
  start_here: "th_how_to_use",
  article_count: 2,
  chapters: [
    {
      id: "thc_02",
      title: "Tenses: talking about time",
      blurb: "All twelve tenses as one system.",
      count: 1,
      articles: [
        {
          id: "th_present_simple",
          chapter_id: "thc_02",
          sequence_index: 23,
          title: "Saying what is generally true",
          cefr_level: "A1",
          also_called: "the present simple",
          one_line: "Use it for what is true in general.",
          question_in_learner_words: "When do I use the plain form of the verb?",
          aliases: ["present simple", "simple present", "he works or he is working"],
        },
      ],
    },
    {
      id: "thc_07",
      title: "Nouns, articles and describing words",
      blurb: "a, an, the.",
      count: 1,
      articles: [
        {
          id: "th_article_the",
          chapter_id: "thc_07",
          sequence_index: 27,
          title: "The word *the*, and what it promises the reader",
          cefr_level: "A2",
          also_called: null,
          one_line: "It says the reader can already tell which one you mean.",
          question_in_learner_words: "When do I use *the*?",
          aliases: ["definite article", "articles", "when to use the"],
        },
      ],
    },
  ],
};

async function open() {
  get.mockResolvedValue(INDEX);
  render(<TheoryScreen />);
  await screen.findByText("Saying what is generally true");
  return screen.getByLabelText("Search the reference");
}

describe("searching the reference", () => {
  it("finds an article by the name the learner was taught it under", async () => {
    const box = await open();
    await userEvent.type(box, "present simple");
    await waitFor(() => expect(screen.getByText("Saying what is generally true")).toBeInTheDocument());
    expect(screen.queryByText(/what it promises the reader/)).not.toBeInTheDocument();
  });

  it("finds the articles article, which does not say “articles” anywhere on its card", async () => {
    const box = await open();
    await userEvent.type(box, "articles");
    await waitFor(() => expect(screen.getByText(/what it promises the reader/)).toBeInTheDocument());
  });

  it("keeps the search terms off the card — they are a way in, not a subtitle", async () => {
    await open();
    expect(screen.queryByText(/definite article/)).not.toBeInTheDocument();
    expect(screen.queryByText(/When do I use/)).not.toBeInTheDocument();
  });

  it("still says nothing matched when nothing does", async () => {
    const box = await open();
    await userEvent.type(box, "quantum mechanics");
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeInTheDocument());
  });
});

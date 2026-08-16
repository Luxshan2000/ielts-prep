/**
 * What one word has to tell a learner before it is worth reviewing.
 *
 * A learner asked for four things about every entry: what it means, an example, the
 * situation the example belongs to, and when and where to use the word. The bank stored
 * two of them. Deck opt-in copies eight fields out of the pack and drops the rest, so the
 * register, the situations each example was authored for, the thing not to say with the
 * word, and the words it is confused with were all sitting in `vocab_pack_entries` with no
 * route to the screen. `GET /vocab/entries/{id}` now reads them back off the pack row, and
 * these tests hold the drawer to showing them.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConfirmProvider } from "@/components/ui";
import { EntryDetailDrawer } from "../components/EntryDetailDrawer";
import { useVocabStore } from "../store";
import type { VocabEntry } from "../types";

const BASE: VocabEntry = {
  id: "ve_1",
  headword: "scale back",
  lemma: "scale back",
  is_phrase: true,
  ipa: "skeɪl bæk",
  pos: "verb",
  definition: "to reduce the size or amount of something deliberately",
  own_context_sentence: "Households scale back fresh food first.",
  own_context_origin: "seed",
  example_sentences: ["Respondents scale back discretionary categories."],
  collocations: ["scale back spending"],
  topic_tags: ["food-diet"],
  cefr_level: "B2",
  audio_ref: "media/vocab/ve_1.wav",
  audio_url: "/api/v1/media/vocab/ve_1.wav",
  status: "active",
  created_at: "2026-03-12T09:00:00.000Z",
  updated_at: "2026-03-12T09:00:00.000Z",
  source: { module: "seed", session_id: "fud_scale_back", detail: "deck:topic-food" },
  srs: null,
};

function open(entry: VocabEntry) {
  useVocabStore.setState({ detail: entry, detailLoading: false, detailError: null });
  return render(
    <ConfirmProvider>
      <EntryDetailDrawer />
    </ConfirmProvider>,
  );
}

afterEach(() => {
  useVocabStore.setState({ detail: null, detailLoading: false, detailError: null });
});

describe("the entry drawer", () => {
  it("names the situation each example was written for", () => {
    open({
      ...BASE,
      usage: {
        register: "both",
        avoid: null,
        situations: [
          {
            text: "Households scale back fresh food first.",
            register: "written",
            skill: "writing_t2",
          },
          {
            text: "We scaled back the party a bit.",
            register: "spoken",
            skill: "speaking_p2",
          },
        ],
        confusables: [],
      },
    });

    expect(screen.getByText("Writing Task 2")).toBeInTheDocument();
    expect(screen.getByText("Speaking Part 2")).toBeInTheDocument();
    expect(screen.getByText("We scaled back the party a bit.")).toBeInTheDocument();
  });

  it("says where the word belongs and what not to do with it", () => {
    open({
      ...BASE,
      usage: {
        register: "academic",
        avoid: "Separable. Scale it back or scale back the plan, both work.",
        situations: [],
        confusables: [],
      },
    });

    expect(screen.getByText(/Best in academic writing/)).toBeInTheDocument();
    expect(screen.getByText(/Scale it back or scale back the plan/)).toBeInTheDocument();
  });

  it("shows the word it is confused with, and how the two differ", () => {
    open({
      ...BASE,
      usage: {
        register: null,
        avoid: null,
        situations: [],
        confusables: [
          {
            term: "cut out",
            difference: "Scale back keeps the thing and makes it smaller. Cut out stops it.",
            minimal_pair: ["They scaled back the programme.", "They cut the programme."],
          },
        ],
      },
    });

    expect(screen.getByText("cut out")).toBeInTheDocument();
    expect(screen.getByText(/keeps the thing and makes it smaller/)).toBeInTheDocument();
    expect(screen.getByText("They cut the programme.")).toBeInTheDocument();
  });

  it("still shows plain examples for a word the pack knows nothing about", () => {
    open(BASE);
    expect(screen.getByText("Respondents scale back discretionary categories.")).toBeInTheDocument();
    expect(screen.queryByText(/Best in/)).not.toBeInTheDocument();
  });
});

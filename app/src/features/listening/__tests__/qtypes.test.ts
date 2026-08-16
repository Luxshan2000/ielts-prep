import { describe, expect, it } from "vitest";
import {
  assetMediaPath,
  countWords,
  groupQuestions,
  joinLetters,
  letterCount,
  optionEntries,
  parseMarkdownTable,
  rangeLabel,
  splitLetters,
  wordLimitLabel,
} from "../qtypes";
import type { ListeningQuestion } from "../types";

const question = (over: Partial<ListeningQuestion>): ListeningQuestion => ({
  id: `q-${over.number ?? 1}`,
  number: over.number ?? 1,
  source_number: over.number ?? 1,
  type: "note_completion",
  instruction: null,
  prompt: null,
  options: null,
  select_n: null,
  asset: null,
  word_limit: null,
  slots: 1,
  ...over,
});

describe("word counting", () => {
  it("counts a hyphenated compound as one word", () => {
    expect(countWords("purpose-built centre")).toBe(2);
  });

  it("ignores surrounding whitespace", () => {
    expect(countWords("  1892  ")).toBe(1);
    expect(countWords("")).toBe(0);
  });
});

describe("word-limit labels", () => {
  it("uses IELTS wording", () => {
    expect(wordLimitLabel(1)).toBe("ONE WORD AND/OR A NUMBER");
    expect(wordLimitLabel(2)).toBe("NO MORE THAN TWO WORDS AND/OR A NUMBER");
    expect(wordLimitLabel(null)).toBeNull();
  });
});

describe("option banks", () => {
  it("keeps authored letters from a mapping", () => {
    expect(optionEntries({ A: "first", B: "second" })).toEqual([
      ["A", "first"],
      ["B", "second"],
    ]);
  });

  it("letters an array bank", () => {
    expect(optionEntries(["first", "second", "third"])).toEqual([
      ["A", "first"],
      ["B", "second"],
      ["C", "third"],
    ]);
  });

  it("survives a missing bank", () => {
    expect(optionEntries(null)).toEqual([]);
  });
});

describe("letter answers", () => {
  it("round-trips a multi-select answer in sorted, comma form", () => {
    expect(joinLetters(["D", "B"])).toBe("B, D");
    expect(splitLetters("B, D")).toEqual(["B", "D"]);
    expect(splitLetters("bd")).toEqual(["BD"]);
  });

  it("reads how many letters are wanted from select_n, then slots", () => {
    expect(letterCount(question({ select_n: 2 }))).toBe(2);
    expect(letterCount(question({ slots: 3 }))).toBe(3);
    expect(letterCount(question({}))).toBe(1);
  });
});

describe("markdown tables", () => {
  it("drops the separator row and keeps gapped cells", () => {
    const model = parseMarkdownTable(
      ["| Item | Cost |", "|---|---|", "| Day pass | ______ |"].join("\n"),
    );
    expect(model.header).toEqual(["Item", "Cost"]);
    expect(model.rows).toEqual([["Day pass", "______"]]);
  });
});

describe("map assets", () => {
  it("routes a pack-relative path through the media API", () => {
    expect(assetMediaPath("packs/core/maps/museum.svg")).toBe(
      "/api/v1/media/packs/core/maps/museum.svg",
    );
    expect(assetMediaPath({ src: "core/maps/plan.svg" })).toBe(
      "/api/v1/media/packs/core/maps/plan.svg",
    );
    expect(assetMediaPath(null)).toBeNull();
  });
});

describe("grouping", () => {
  it("groups consecutive questions that share an instruction and type", () => {
    const groups = groupQuestions([
      question({ number: 11, instruction: "Complete the notes." }),
      question({ number: 12, instruction: "Complete the notes." }),
      question({ number: 13, instruction: "Choose A, B or C.", type: "multiple_choice" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(rangeLabel(groups[0].questions)).toBe("Questions 11-12");
    expect(rangeLabel(groups[1].questions)).toBe("Question 13");
  });
});

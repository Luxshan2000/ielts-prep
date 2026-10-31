import { describe, expect, it } from "vitest";
import { blockSubtitle } from "../blocks";
import type { PlanBlock } from "../types";

const warmup: PlanBlock = {
  kind: "warmup_srs",
  minutes: 10,
  module: "vocab",
  activity: "review",
  params: { max_cards: 20 },
};

describe("the warm-up block's subtitle", () => {
  it("does not promise due cards to an empty bank", () => {
    // Every session opens with this block, the first one included, and on day one the
    // bank is empty by design. "Up to 20 due cards" led to a screen saying there were none.
    expect(blockSubtitle(warmup, { due: 0, bankSize: 0 })).toBe(
      "Your word bank is empty. Start by choosing a study deck.",
    );
  });

  it("says so when the bank has words but none are due", () => {
    expect(blockSubtitle(warmup, { due: 0, bankSize: 40 })).toBe("Nothing due today.");
  });

  it("keeps the plan's cap when there is real work, or when the counts are unknown", () => {
    expect(blockSubtitle(warmup, { due: 12, bankSize: 40 })).toBe("Up to 20 due cards");
    expect(blockSubtitle(warmup, { due: null, bankSize: null })).toBe("Up to 20 due cards");
    expect(blockSubtitle(warmup)).toBe("Up to 20 due cards");
  });
});

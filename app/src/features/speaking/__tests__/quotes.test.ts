import { describe, expect, it } from "vitest";
import { annotateTurn, findQuote, quoteAnchors } from "../components/quotes";
import type { ReportError } from "../store";

const error = (quote: string, issue = "quantifier", better = "heavy traffic"): ReportError => ({
  quote,
  issue,
  better,
});

describe("findQuote", () => {
  it("matches ignoring case and punctuation, returning original offsets", () => {
    const text = "I live in a small city, and there were very much cars.";
    const hit = findQuote(text, "there were very much cars");
    expect(hit).not.toBeNull();
    expect(text.slice(hit!.start, hit!.end)).toBe("there were very much cars");
  });

  it("matches across punctuation the model dropped", () => {
    const text = "Well — honestly, it's my daily commute; it takes an hour.";
    const hit = findQuote(text, "my daily commute it takes an hour");
    expect(hit).not.toBeNull();
    expect(text.slice(hit!.start, hit!.end)).toBe("my daily commute; it takes an hour");
  });

  it("falls back to the quoted head of an evidence string", () => {
    const text = "The traffic in my city is terrible in the morning.";
    expect(quoteAnchors(text, "traffic in my city is terrible — shows range")).toBe(true);
  });

  it("returns null when the quote is not present", () => {
    expect(findQuote("I enjoy reading books.", "I dislike swimming")).toBeNull();
  });

  it("ignores quotes too short to anchor safely", () => {
    expect(findQuote("A cat sat on the mat.", "a")).toBeNull();
  });

  it("tolerates empty input without throwing", () => {
    expect(findQuote("", "anything")).toBeNull();
    expect(findQuote("something", "")).toBeNull();
  });
});

describe("annotateTurn", () => {
  it("produces one annotation per matched error and reports which were used", () => {
    const text = "there were very much cars and I am agree with that";
    const errors = [
      error("very much cars"),
      error("I am agree", "verb form", "I agree"),
      error("never said this", "n/a", "n/a"),
    ];
    const { annotations, matched } = annotateTurn(text, errors);
    expect(matched).toEqual([0, 1]);
    expect(annotations).toHaveLength(2);
    expect(annotations[0].severity).toBe("error");
    expect(annotations[0].suggestion).toBe("heavy traffic");
    expect(text.slice(annotations[1].start, annotations[1].end)).toBe("I am agree");
  });

  it("drops an overlapping second match instead of rendering it wrong", () => {
    const text = "there were very much cars today";
    const { annotations, matched } = annotateTurn(text, [
      error("very much cars"),
      error("much cars today", "collocation", "a lot of traffic today"),
    ]);
    expect(matched).toEqual([0]);
    expect(annotations).toHaveLength(1);
  });

  it("returns nothing for a turn with no errors", () => {
    const { annotations, matched } = annotateTurn("A clean sentence.", []);
    expect(annotations).toHaveLength(0);
    expect(matched).toHaveLength(0);
  });
});

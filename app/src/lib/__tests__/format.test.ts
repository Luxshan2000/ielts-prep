/**
 * format.ts has no tests, despite being imported by roughly thirty files to render
 * every band, timer and score in the app. That is a bad place for silent behavior
 * change, so this file just pins down what each function actually does today —
 * especially at the edges, where the "obvious" implementation is usually wrong.
 *
 * One thing worth flagging rather than quietly encoding: bandBucket compares with
 * `<`, and every comparison against NaN is false, so an unscoreable band falls
 * through every branch and comes out "strong" — the bucket meant for a 9.0. That is
 * pinned below as documented behavior, not asserted as correct; formatBand's
 * NaN → em dash is the guard that is presumably meant to catch this case upstream.
 */

import { describe, expect, it, vi } from "vitest";
import { bandBucket, countWords, daysUntil, formatBand, formatDuration, scorePct } from "../format";

describe("formatDuration", () => {
  it("renders under an hour as m:ss, unpadded minutes", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(599)).toBe("9:59");
  });

  it("switches to h:mm:ss only once a full hour has passed", () => {
    expect(formatDuration(3599)).toBe("59:59");
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("pads minutes to two digits once hours are shown, but never pads the hour", () => {
    expect(formatDuration(7325)).toBe("2:02:05"); // 2h 2m 5s
  });

  it("clamps a negative input to 0:00 instead of printing a minus sign", () => {
    expect(formatDuration(-1)).toBe("0:00");
    expect(formatDuration(-3600)).toBe("0:00");
  });

  it("truncates fractional seconds rather than rounding them up", () => {
    // 65.9 must read as 1:05, not round up to 1:06 — a countdown should never skip a second.
    expect(formatDuration(65.9)).toBe("1:05");
  });
});

describe("countWords", () => {
  it("counts a contraction as one word, not two", () => {
    expect(countWords("don't")).toBe(1);
    expect(countWords("I don't know")).toBe(3);
  });

  it("counts a hyphenated compound as one word", () => {
    expect(countWords("a well-known fact")).toBe(3);
  });

  it("accepts a curly apostrophe the same way as a straight one", () => {
    expect(countWords("isn\u2019t that well-known")).toBe(3);
  });

  it("does not count bare punctuation as a word", () => {
    // A naive `split(/\s+/)` would count "..." and a lone "-" as tokens; the IELTS
    // rule is that a word needs an actual letter or digit in it.
    expect(countWords("...")).toBe(0);
    expect(countWords("word - word")).toBe(2);
  });

  it("counts digits as words", () => {
    expect(countWords("There were 12 cats")).toBe(4);
  });

  it("is 0 for empty or whitespace-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("bandBucket", () => {
  it("buckets by the documented boundaries (12-design-system.md §8.2)", () => {
    expect(bandBucket(4.9)).toBe("low");
    expect(bandBucket(5.0)).toBe("mid");
    expect(bandBucket(5.5)).toBe("mid");
    expect(bandBucket(5.9)).toBe("mid");
    expect(bandBucket(6.0)).toBe("good");
    expect(bandBucket(6.5)).toBe("good");
    expect(bandBucket(6.9)).toBe("good");
  });

  it("puts 7.0 itself in strong, not good — the < 7 check makes 7.0 the strong floor", () => {
    expect(bandBucket(7.0)).toBe("strong");
    expect(bandBucket(9.0)).toBe("strong");
  });

  it("falls through to strong for NaN, since every `<` comparison against NaN is false", () => {
    // Documenting this, not endorsing it — see the file header. Callers that might
    // pass an unscoreable band should go through formatBand's NaN check first.
    expect(bandBucket(NaN)).toBe("strong");
  });
});

describe("scorePct", () => {
  it("computes correct/total as a percentage", () => {
    expect(scorePct(7, 10)).toBe(70);
    expect(scorePct(3, 4)).toBe(75);
    expect(scorePct(10, 10)).toBe(100);
  });

  it("is 0 for zero questions, never NaN", () => {
    expect(scorePct(0, 0)).toBe(0);
    expect(scorePct(5, 0)).toBe(0);
  });
});

describe("daysUntil", () => {
  it("is 0 for a date string that does not parse", () => {
    expect(daysUntil("not-a-date")).toBe(0);
    expect(daysUntil("")).toBe(0);
    expect(daysUntil("2026-13-45")).toBe(0);
  });

  it("counts whole days from today, positive ahead and negative behind", () => {
    // Pinned to a fixed instant so the answer doesn't drift with the calendar. CI runs
    // in UTC (no TZ override in the workflow), which is what this asserts against.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    try {
      expect(daysUntil("2026-01-15")).toBe(0);
      expect(daysUntil("2026-01-18")).toBe(3);
      expect(daysUntil("2026-01-14")).toBe(-1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("formatBand", () => {
  it("always shows one decimal place", () => {
    expect(formatBand(6.5)).toBe("6.5");
    expect(formatBand(7)).toBe("7.0");
  });

  it("does not treat a real 0.0 band as missing", () => {
    // `band === null` etc. is a strict check, not `!band` — 0 must format normally.
    expect(formatBand(0)).toBe("0.0");
  });

  it.each([null, undefined, NaN])("is an em dash for %p", (value) => {
    expect(formatBand(value)).toBe("\u2014");
  });
});
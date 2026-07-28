/**
 * Review shows one line per answer, not the whole form six times.
 *
 * Form, note and table prompts are authored once for a group and repeated on every
 * question in it, with `**n**` marking which gap is whose. That is right for the player,
 * where the learner fills the form in as one object. In review it meant every one of six
 * answers was preceded by the entire booking form, with the markdown showing raw as
 * `**1**`, so the line that actually mattered was impossible to find.
 */

import { describe, expect, it } from "vitest";
import { promptLineFor, stripEmphasis } from "../qtypes";

const FORM = [
  "PENVALE COTTAGES — TELEPHONE BOOKING",
  "",
  "Example",
  "Type of let: self-catering",
  "",
  "Surname: **1** ______",
  "Daytime telephone: **2** ______",
  "Number of adults: **3** ______",
  "Arrival: Saturday **4** ______ April",
  "Cottage: **5** ______",
  "Deposit: **6** ______ pounds",
].join("\n");

describe("promptLineFor", () => {
  it("returns only the line belonging to the question", () => {
    expect(promptLineFor(FORM, 1)).toBe("Surname: 1 ______");
    expect(promptLineFor(FORM, 4)).toBe("Arrival: Saturday 4 ______ April");
    expect(promptLineFor(FORM, 6)).toBe("Deposit: 6 ______ pounds");
  });

  it("never leaves markdown emphasis showing raw", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(promptLineFor(FORM, n)).not.toContain("**");
    }
  });

  it("does not confuse 1 with 11 when both are marked", () => {
    const block = "Room: **1** ______\nFloor: **11** ______";
    expect(promptLineFor(block, 1)).toBe("Room: 1 ______");
    expect(promptLineFor(block, 11)).toBe("Floor: 11 ______");
  });

  it("keeps the whole prompt when the question is not marked in it", () => {
    // A single-question prompt carries no markers at all.
    const plain = "What time does the tour start?";
    expect(promptLineFor(plain, 7)).toBe(plain);
  });

  it("falls back to the full block when the number is absent from the markers", () => {
    expect(promptLineFor(FORM, 99)).toContain("PENVALE COTTAGES");
  });

  it("keeps a table whole — a row without its header means nothing", () => {
    const table = [
      "| Day | Activity | Cost |",
      "| --- | --- | --- |",
      "| Monday | **12** ______ | £4 |",
      "| Tuesday | walking | **13** ______ |",
    ].join("\n");
    const out = promptLineFor(table, 12);
    expect(out).toContain("Day");
    expect(out).toContain("Tuesday");
  });

  it.each([null, undefined, "", "   "])("is empty for %p", (input) => {
    expect(promptLineFor(input, 1)).toBe("");
  });

  it("tolerates a missing question number", () => {
    expect(promptLineFor(FORM, null)).toContain("PENVALE COTTAGES");
    expect(promptLineFor(FORM, null)).not.toContain("**");
  });
});

describe("stripEmphasis", () => {
  it("removes bold and italic markers but keeps the text", () => {
    expect(stripEmphasis("a **bold** and *thin* line")).toBe("a bold and thin line");
  });

  it("leaves a bare asterisk alone", () => {
    expect(stripEmphasis("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  it("leaves gap underscores untouched", () => {
    expect(stripEmphasis("Surname: **1** ______")).toBe("Surname: 1 ______");
  });
});

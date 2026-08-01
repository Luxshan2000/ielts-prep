/**
 * The theory reference must not show its own authoring syntax.
 *
 * Authors write example sentences as *emphasis* and terms as **bold**. Printed raw, the
 * reader sees the asterisks — the same defect the listening answer sheet shipped with, in a
 * different feature. And three block types (warning, false_rule, l1_note) carry wrong/right
 * pairs under their own field names, so a renderer guessing at `text` drew empty callouts:
 * the alarming case, because the block still appears, with nothing in it.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ArticleBody, type Block } from "../components/theory/ArticleBody";

function draw(...body: Block[]) {
  return render(<ArticleBody body={body} />);
}

describe("emphasis", () => {
  it("resolves *italic* rather than printing the asterisks", () => {
    const { container } = draw({ type: "prose", text: "Say *The bridge closed.* here." });
    expect(container.textContent).not.toContain("*");
    expect(screen.getByText("The bridge closed.").tagName).toBe("EM");
  });

  it("resolves **bold** rather than printing the asterisks", () => {
    const { container } = draw({ type: "prose", text: "That word is the **verb**." });
    expect(container.textContent).not.toContain("*");
    expect(screen.getByText("verb").tagName).toBe("STRONG");
  });

  it("leaves ordinary prose exactly as written", () => {
    draw({ type: "prose", text: "A sentence needs a subject and a verb." });
    expect(screen.getByText("A sentence needs a subject and a verb.")).toBeInTheDocument();
  });

  it("does not mangle a lone asterisk used as itself", () => {
    const { container } = draw({ type: "prose", text: "2 * 3 = 6" });
    expect(container.textContent).toBe("2 * 3 = 6");
  });
});

describe("warning", () => {
  const block: Block = {
    type: "warning",
    wrong: "The new footbridge over the canal.",
    right: "The new footbridge over the canal opened in March.",
    why_it_happens: "It names something clearly, so it feels finished.",
    smallest_fix: "Add a word that says what happened.",
  };

  it("shows both halves of the wrong/right pair", () => {
    draw(block);
    expect(screen.getByText("The new footbridge over the canal.")).toBeInTheDocument();
    expect(
      screen.getByText("The new footbridge over the canal opened in March."),
    ).toBeInTheDocument();
  });

  it("explains why it happens and how to fix it", () => {
    draw(block);
    expect(screen.getByText(/It names something clearly/)).toBeInTheDocument();
    expect(screen.getByText(/Add a word that says what happened/)).toBeInTheDocument();
  });

  it("is never an empty callout", () => {
    const { container } = draw(block);
    expect(container.textContent?.replace(/Watch out/, "").trim().length).toBeGreaterThan(20);
  });
});

describe("false_rule", () => {
  it("shows the myth it is correcting and the truth", () => {
    draw({
      type: "false_rule",
      heard: "A sentence expresses a complete thought.",
      truth: "That describes a sentence; it does not let you check one.",
      what_to_do: "Look for a subject and a verb.",
    });
    expect(screen.getByText("A sentence expresses a complete thought.")).toBeInTheDocument();
    expect(screen.getByText(/it does not let you check one/)).toBeInTheDocument();
    expect(screen.getByText(/Look for a subject and a verb/)).toBeInTheDocument();
  });
});

describe("l1_note", () => {
  it("names the language rather than showing its ISO code", () => {
    draw({ type: "l1_note", lang: "ta", mechanism: "Tamil marks the doer on the verb." });
    expect(screen.getByText(/If your first language is Tamil/)).toBeInTheDocument();
    expect(screen.queryByText(/\bta\b/)).not.toBeInTheDocument();
  });

  it("falls back to a generic label for an unknown code", () => {
    draw({ type: "l1_note", lang: "xx", mechanism: "Something happens." });
    expect(screen.getByText(/A common first-language slip/)).toBeInTheDocument();
  });

  it("shows the wrong/right pair", () => {
    draw({
      type: "l1_note",
      lang: "es",
      wrong: "Is raining again.",
      right: "It is raining again.",
    });
    expect(screen.getByText("Is raining again.")).toBeInTheDocument();
    expect(screen.getByText("It is raining again.")).toBeInTheDocument();
  });
});

describe("quick_check", () => {
  const block: Block = {
    type: "quick_check",
    items: [{ question: "Is this a sentence? Snow fell.", answer: "Yes.", why: "Subject + verb." }],
  };

  it("hides the answer until asked", () => {
    draw(block);
    expect(screen.getByText(/Is this a sentence\?/)).toBeInTheDocument();
    expect(screen.queryByText("Yes.")).not.toBeInTheDocument();
  });

  it("reveals it on one click — this is reference, not assessment", async () => {
    draw(block);
    await userEvent.click(screen.getByRole("button", { name: "Show the answer" }));
    expect(screen.getByText("Yes.")).toBeInTheDocument();
    expect(screen.getByText("Subject + verb.")).toBeInTheDocument();
  });
});

describe("tables and structure", () => {
  it("renders a paradigm with its headers", () => {
    draw({
      type: "paradigm",
      caption: "Present simple",
      headers: ["Person", "Form"],
      rows: [["I", "work"], ["She", "works"]],
    });
    expect(screen.getByRole("columnheader", { name: "Person" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "works" })).toBeInTheDocument();
  });

  it("marks the highlighted span inside an example", () => {
    draw({
      type: "examples",
      items: [{ text: "The clinic opens at eight.", mark: "opens" }],
    });
    expect(screen.getByText("opens").tagName).toBe("MARK");
  });

  it("keeps an unknown block's text rather than dropping it silently", () => {
    draw({ type: "something_new", text: "Still worth reading." });
    expect(screen.getByText("Still worth reading.")).toBeInTheDocument();
  });

  it("renders nothing for an unknown block with no text, without throwing", () => {
    expect(() => draw({ type: "mystery" })).not.toThrow();
  });
});

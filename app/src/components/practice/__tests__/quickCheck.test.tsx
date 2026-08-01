/**
 * The self-check panel, and the one rule it must not learn.
 *
 * Three surfaces in this app are called a "check": listening's timed transfer step, reading's
 * solutions panel (withheld until a real attempt exists), and this — a reader confirming they
 * followed an explanation. Only the middle one is gated, and that gate is a product rule
 * rather than a display option, which is why it stays its own component. The test that
 * matters here is the negative one: this panel reveals on demand, always.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QuickCheck, type QuickCheckItem } from "../QuickCheck";

const ITEMS: QuickCheckItem[] = [
  { question: "Is this a sentence? Snow fell.", answer: "Yes.", why: "It has a subject and a verb." },
  { question: "Is this a sentence? The long queue outside.", answer: "No.", why: "Nothing says what happened." },
];

describe("QuickCheck", () => {
  it("shows every question up front", () => {
    render(<QuickCheck items={ITEMS} />);
    expect(screen.getByText(/Snow fell/)).toBeInTheDocument();
    expect(screen.getByText(/The long queue outside/)).toBeInTheDocument();
  });

  it("hides the answers until asked", () => {
    render(<QuickCheck items={ITEMS} />);
    expect(screen.queryByText("Yes.")).not.toBeInTheDocument();
    expect(screen.queryByText("No.")).not.toBeInTheDocument();
  });

  it("reveals one answer without revealing the others", async () => {
    render(<QuickCheck items={ITEMS} />);
    const buttons = screen.getAllByRole("button", { name: "Show the answer" });
    await userEvent.click(buttons[0]);

    expect(screen.getByText("Yes.")).toBeInTheDocument();
    expect(screen.getByText("It has a subject and a verb.")).toBeInTheDocument();
    expect(screen.queryByText("No.")).not.toBeInTheDocument();
  });

  it("needs exactly one click — a reference never makes you earn the answer", async () => {
    render(<QuickCheck items={[ITEMS[0]]} />);
    await userEvent.click(screen.getByRole("button", { name: "Show the answer" }));
    expect(screen.getByText("Yes.")).toBeInTheDocument();
  });

  it("takes an item with no explanation", async () => {
    render(<QuickCheck items={[{ question: "Two plus two?", answer: "Four." }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Show the answer" }));
    expect(screen.getByText("Four.")).toBeInTheDocument();
  });

  it("renders nothing at all when there is nothing to check", () => {
    const { container } = render(<QuickCheck items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lets the caller resolve its own authoring syntax", async () => {
    render(
      <QuickCheck
        items={[{ question: "Which is right: *he go* or *he goes*?", answer: "*he goes*" }]}
        renderText={(t) => <span>{t.replace(/\*/g, "")}</span>}
      />,
    );
    expect(screen.getByText("Which is right: he go or he goes?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show the answer" }));
    expect(screen.getByText("he goes")).toBeInTheDocument();
  });

  it("takes a caller's title", () => {
    render(<QuickCheck items={ITEMS} title="Try these" />);
    expect(screen.getByText("Try these")).toBeInTheDocument();
  });
});

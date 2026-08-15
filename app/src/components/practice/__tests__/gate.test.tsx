/**
 * The gate and the accent notice are the two product rules the shared library is responsible
 * for. Both were being re-implemented per feature, and a rule that is re-implemented is a rule
 * that eventually gets one implementation wrong.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttemptGate } from "@/components/practice/AttemptGate";
import { ACCENT_NOTICE_FALLBACK, AccentNotice } from "@/components/practice/AccentNotice";
import { Button } from "@/components/ui";

describe("AttemptGate", () => {
  it("hides the gated content and says how to open it", () => {
    render(
      <AttemptGate
        locked
        reason="Answer this passage — three questions is enough — and the worked solutions open here."
        action={<Button>Answer this passage now</Button>}
        stillOpen="The map, the strategy and the vocabulary stay open."
      >
        <p>Question 1 answer: FALSE, because paragraph C says the opposite.</p>
      </AttemptGate>,
    );
    expect(screen.queryByText(/paragraph C/)).toBeNull();
    expect(screen.getByText("Have a go first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answer this passage now" })).toBeInTheDocument();
    expect(screen.getByText(/The map, the strategy and the vocabulary stay open/)).toBeInTheDocument();
  });

  it("says the mock is the reason when the mock is the reason, and that it comes back", () => {
    render(
      <AttemptGate locked variant="mock" reason="The coach reopens when you submit the paper.">
        <p>Coach</p>
      </AttemptGate>,
    );
    expect(screen.getByText("Closed while the mock is running")).toBeInTheDocument();
    expect(screen.getByText(/reopens the moment you finish/)).toBeInTheDocument();
  });

  it("gets out of the way entirely once the attempt exists", () => {
    render(
      <AttemptGate locked={false} reason="unused">
        <p>Question 1 answer: FALSE.</p>
      </AttemptGate>,
    );
    expect(screen.getByText("Question 1 answer: FALSE.")).toBeInTheDocument();
    expect(screen.queryByText("Have a go first")).toBeNull();
  });
});

describe("AccentNotice", () => {
  it("shows the sidecar's own wording", () => {
    render(<AccentNotice notice="IELTS accepts every accent." />);
    expect(screen.getByText("IELTS accepts every accent.")).toBeInTheDocument();
  });

  it("still states the rule when the field comes back empty", () => {
    // 09 §0 is not conditional on the response carrying the string, so neither is this.
    render(<AccentNotice notice="   " />);
    expect(screen.getByText(ACCENT_NOTICE_FALLBACK)).toBeInTheDocument();
    expect(screen.queryByText(/mispronounc/i)).toBeNull();
  });
});

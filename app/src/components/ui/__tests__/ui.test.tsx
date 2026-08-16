import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BandScore, Button, CircularTimer, Notice, QuestionPalette } from "@/components/ui";
import { bandBucket, formatBand, formatDuration } from "@/lib/format";

describe("Button", () => {
  it("renders the label and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start session</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Start session" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps the label laid out (but invisible) while loading, so width never reflows", () => {
    const { rerender } = render(<Button>Review 24 cards</Button>);
    const idleLabel = screen.getByText("Review 24 cards");
    expect(idleLabel).not.toHaveClass("invisible");

    rerender(<Button loading>Review 24 cards</Button>);
    const loadingLabel = screen.getByText("Review 24 cards");
    // Still in the DOM (so the button keeps its intrinsic width) but hidden.
    expect(loadingLabel).toBeInTheDocument();
    expect(loadingLabel).toHaveClass("invisible");

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("applies the destructive variant classes", () => {
    render(<Button variant="destructive">Delete profile</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-destructive");
  });
});

describe("BandScore", () => {
  it("always renders the numeral — colour is never the only encoding", () => {
    render(<BandScore band={6.5} label="Fluency" />);
    expect(screen.getByText("6.5")).toBeInTheDocument();
    expect(screen.getByLabelText("Band 6.5, Fluency")).toBeInTheDocument();
  });

  it("maps bands onto the 12 §8.2 buckets", () => {
    expect(bandBucket(4.5)).toBe("low");
    expect(bandBucket(5.5)).toBe("mid");
    expect(bandBucket(6.5)).toBe("good");
    expect(bandBucket(7.0)).toBe("strong");

    const { container } = render(<BandScore band={7} size="sm" />);
    expect(container.querySelector("[data-band-bucket]")).toHaveAttribute(
      "data-band-bucket",
      "strong",
    );
  });

  it("formats whole bands with one decimal", () => {
    render(<BandScore band={7} size="lg" />);
    expect(screen.getByText("7.0")).toBeInTheDocument();
    expect(formatBand(null)).toBe("—");
  });
});

describe("CircularTimer", () => {
  it("shows the remaining time as mm:ss", () => {
    render(<CircularTimer totalSec={120} remainingSec={83} />);
    expect(screen.getByText("1:23")).toBeInTheDocument();
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("pulses and turns warning-coloured under the warn threshold", () => {
    const { container, rerender } = render(
      <CircularTimer totalSec={60} remainingSec={45} warnAtSec={10} />,
    );
    const calm = container.firstElementChild as HTMLElement;
    expect(calm).not.toHaveClass("animate-timer-pulse");
    expect(calm).not.toHaveAttribute("data-warning");

    rerender(<CircularTimer totalSec={60} remainingSec={9} warnAtSec={10} />);
    const warning = container.firstElementChild as HTMLElement;
    expect(warning).toHaveClass("animate-timer-pulse");
    expect(warning).toHaveAttribute("data-warning", "true");
    expect(screen.getByText("0:09")).toHaveClass("text-warning");
  });

  it("does not pulse while paused", () => {
    const { container } = render(
      <CircularTimer totalSec={60} remainingSec={5} warnAtSec={10} paused />,
    );
    expect(container.firstElementChild).not.toHaveClass("animate-timer-pulse");
  });
});

describe("QuestionPalette", () => {
  it("labels each question with its status and jumps on click", async () => {
    const onJump = vi.fn();
    render(
      <QuestionPalette
        count={3}
        current={2}
        status={{ 1: "answered", 2: "blank", 3: "flagged" }}
        onJump={onJump}
      />,
    );
    expect(screen.getByLabelText("Question 1, answered")).toBeInTheDocument();
    expect(screen.getByLabelText("Question 3, flagged")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Question 3, flagged"));
    expect(onJump).toHaveBeenCalledWith(3);
  });
});

describe("Notice", () => {
  it("announces a failure but not a standing advisory", () => {
    const { rerender } = render(
      <Notice tone="danger">The audio for part 3 could not be generated.</Notice>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // "Spelling is marked" is part of the page, not a response to anything. Announcing it on
    // every mount interrupts the learner mid-question for something they already knew.
    rerender(
      <Notice tone="warning" announce={false} title="Spelling is marked.">
        A misspelled answer is wrong, exactly as in the real exam.
      </Notice>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Spelling is marked.")).toBeInTheDocument();
  });

  it("keeps the way out beside the message and hides the icon from the reading order", async () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <Notice tone="warning" actions={<Button size="sm">Try again</Button>} onDismiss={onDismiss}>
        The library could not be loaded.
      </Notice>,
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss this notice" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

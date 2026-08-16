/**
 * The shell is the only thing all ten screens share, so its promises are worth pinning:
 * one back link, one primary-action slot, a sidebar whose grouping survives collapsing,
 * and a header the mobile drawer button cannot be drawn on top of.
 */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PageShell } from "@/components/shell/PageShell";
import { Sidebar, type SidebarItem } from "@/components/shell/Sidebar";
import { RoomCard } from "@/components/practice/RoomCard";
import { Button, TabPanel } from "@/components/ui";

const ITEMS: SidebarItem[] = [
  { path: "/", label: "Home", end: true },
  { path: "/reading", label: "Reading", group: "skills" },
  { path: "/listening", label: "Listening", group: "skills" },
  { path: "/vocab", label: "Vocabulary", group: "foundations", badge: "12" },
  { path: "/settings", label: "Settings" },
];

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar items={ITEMS} />
    </MemoryRouter>,
  );
}

describe("PageShell", () => {
  it("draws one back link, worded by the shell rather than by each screen", () => {
    render(
      <PageShell title="Reading coach" back={{ to: "/reading", label: "Reading" }}>
        <p>body</p>
      </PageShell>,
    );
    const link = screen.getByRole("link", { name: "Back to Reading" });
    expect(link).toHaveAttribute("href", "#/reading");
  });

  it("keeps the primary action rightmost, after reload and status", () => {
    render(
      <PageShell
        title="Progress"
        onRefresh={() => {}}
        refreshLabel="Recompute estimates"
        status={<span>4 of 5 done</span>}
        actions={<Button>Start the first block</Button>}
      >
        <p>body</p>
      </PageShell>,
    );
    const header = screen.getByRole("banner");
    const controls = within(header).getAllByRole("button");
    expect(controls.map((el) => el.getAttribute("aria-label") ?? el.textContent)).toEqual([
      "Recompute estimates",
      "Start the first block",
    ]);
    // The reload is a control of its own, so it stops occupying the slot the eye goes to.
    expect(within(header).getByText("4 of 5 done")).toBeInTheDocument();
  });

  it("reserves the drawer gutter on the first header row, at mobile widths only", () => {
    const { container, rerender } = render(
      <PageShell title="Reading">
        <p>body</p>
      </PageShell>,
    );
    expect(container.querySelector(".pl-11.md\\:pl-0")).not.toBeNull();

    // With a back link above it, the gutter has to move to the row that is now first.
    rerender(
      <PageShell title="Reading" back={{ to: "/", label: "Home" }}>
        <p>body</p>
      </PageShell>,
    );
    const gutter = container.querySelector(".pl-11.md\\:pl-0");
    expect(gutter?.textContent).toBe("Back to Home");
  });
});

describe("Sidebar", () => {
  it("groups the study routes and leaves Home above the headings", () => {
    renderSidebar();
    expect(screen.getByRole("group", { name: "Exam skills" })).toBeInTheDocument();
    const groundwork = screen.getByRole("group", { name: "Groundwork" });
    expect(within(groundwork).getByRole("link", { name: /Vocabulary/ })).toBeInTheDocument();

    const study = screen.getByRole("navigation", { name: "Study" });
    const links = within(study).getAllByRole("link");
    expect(links[0]).toHaveTextContent("Home");
  });

  it("keeps the grouping when collapsed, where a heading does not fit", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    // The visible heading is gone with the labels, but the group is still named.
    expect(screen.queryByText("Exam skills")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Exam skills" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reading" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByText("Exam skills")).toBeInTheDocument();
  });

  it("shows a badge declared by the route itself, not only the vocab special case", () => {
    renderSidebar();
    const vocab = screen.getByRole("link", { name: /Vocabulary/ });
    expect(within(vocab).getByText("12")).toBeInTheDocument();
  });

  it("says what the collapsed dot counts, since the chip does not fit the rail", async () => {
    render(
      <MemoryRouter>
        <Sidebar
          items={[{ path: "/vocab", label: "Vocabulary", badge: "12", badgeLabel: "12 cards due" }]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Vocabulary, 12 cards due" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("link", { name: "Vocabulary, 12 cards due" })).toBeInTheDocument();

    // The collapse is persisted, so leave it as it was found for the tests that follow.
    await userEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
  });

  it("leaves the theme to the Settings dialog instead of keeping a toggle of its own", () => {
    renderSidebar();
    // The footer used to carry a sun/moon button. The theme now lives in one place, the
    // Appearance section of Settings, so the two controls cannot disagree about it.
    expect(screen.queryByRole("button", { name: /theme/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your preferences" })).toBeInTheDocument();
  });

  it("takes the closed mobile drawer out of the tab order instead of only sliding it away", () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <Sidebar items={ITEMS} mobileOpen={false} />
      </MemoryRouter>,
    );
    // Off-screen but still focusable is how a keyboard learner at 760px fell into a nav they
    // could not see. `md:visible` keeps the docked rail on wider windows untouched.
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("invisible");
    expect(aside?.className).toContain("md:visible");

    rerender(
      <MemoryRouter>
        <Sidebar items={ITEMS} mobileOpen />
      </MemoryRouter>,
    );
    expect(container.querySelector("aside")?.className).not.toContain("invisible");
  });
});

describe("RoomCard", () => {
  it("gives a room one target and lets its description wrap", () => {
    render(
      <RoomCard
        to="/listening/mock"
        title="Mock paper"
        description="Four parts, forty questions, played once, one clock."
        meta={["40 questions", "60 minutes"]}
        tone="exam"
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#/listening/mock");
    expect(link).toHaveTextContent("Four parts, forty questions, played once, one clock.");
    // A truncated description is exactly what hid the difference between two rooms at 820px.
    expect(link.querySelector(".truncate")).toBeNull();
  });

  it("explains why a locked room cannot be entered instead of failing on click", () => {
    render(
      <RoomCard
        to="/listening/mock"
        title="Mock paper"
        description="Four parts, forty questions."
        disabledReason="Finish one practice test first — the mock needs audio you have not generated yet."
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/Finish one practice test first/)).toBeInTheDocument();
  });
});

describe("TabPanel", () => {
  it("names the panel with the tab's own label", () => {
    render(
      <TabPanel value="minimal_pairs" label="Minimal pairs" active>
        <p>body</p>
      </TabPanel>,
    );
    expect(screen.getByRole("tabpanel", { name: "Minimal pairs" })).toBeInTheDocument();
  });

  it("falls back to a word rather than announcing the slug", () => {
    render(
      <TabPanel value="minimal_pairs" active>
        <p>body</p>
      </TabPanel>,
    );
    expect(screen.getByRole("tabpanel", { name: "Minimal pairs" })).toBeInTheDocument();
  });
});

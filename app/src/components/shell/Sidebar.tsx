import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  GraduationCap,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Button, Tooltip } from "@/components/ui";
import { useSettingsStore, useSrsStore } from "@/stores";
import type { FeatureIcon } from "@/lib/featureRoute";

export interface SidebarItem {
  path: string;
  label: string;
  icon?: FeatureIcon;
  end?: boolean;
  /**
   * Which heading this route sits under. Items with no group render first, ungrouped —
   * that is Home, and it is why an app with no groups at all still looks exactly as it
   * does today.
   */
  group?: string;
  /** Count or status chip on the right of the label (due cards, unread feedback). */
  badge?: ReactNode;
  /**
   * The badge said in words — "20 cards due". Collapsed, the rail has no room for the chip and
   * draws a dot instead; without this the dot is an unexplained mark to a sighted learner and
   * nothing at all to a screen reader, which is the state the badge was invented to avoid.
   */
  badgeLabel?: string;
}

export interface SidebarProps {
  items: SidebarItem[];
  /**
   * Heading order and copy for the groups used by `items`. Groups not named here still
   * render, under a sentence-cased fallback, after the ones that are.
   */
  groups?: { id: string; label: string }[];
  /** Extra badge content per route path; overrides `item.badge` and the due-count fallback. */
  badges?: Record<string, ReactNode>;
  mobileOpen?: boolean;
  onNavigate?: () => void;
  className?: string;
}

const COLLAPSE_KEY = "br-sidebar-collapsed";

// Routes that belong in the footer rather than the study list. Matched by exact path so a
// future /settings/audio still lands in the main nav unless it is added here too.
const PINNED_PATHS = new Set(["/settings"]);

/**
 * Copy for the two groups the app actually ships, so a feature only has to declare which
 * side it is on. These are headings, not a nav list: the routes under them still come from
 * the glob, and a group nobody uses renders nothing.
 */
const DEFAULT_GROUP_LABELS: Record<string, string> = {
  skills: "Exam skills",
  foundations: "Groundwork",
};

function groupLabel(id: string, groups: SidebarProps["groups"]): string {
  const declared = groups?.find((g) => g.id === id);
  if (declared) return declared.label;
  if (DEFAULT_GROUP_LABELS[id]) return DEFAULT_GROUP_LABELS[id];
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/[_-]+/g, " ");
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * NAV comes from the feature-route glob — never hand-edit a list here.
 * 224px expanded, 64px icon rail collapsed; the mobile drawer slides over.
 */
export function Sidebar({
  items,
  groups,
  badges,
  mobileOpen = false,
  onNavigate,
  className,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window === "undefined" ? false : readCollapsed(),
  );
  const dueCount = useSrsStore((s) => s.dueCount);
  const theme = useSettingsStore((s) => s.theme);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage disabled — collapse state stays session-local */
    }
  }, [collapsed]);

  const badgeFor = (item: SidebarItem): ReactNode => {
    if (badges && item.path in badges) return badges[item.path];
    if (item.badge !== undefined && item.badge !== null) return item.badge;
    // Fallback until every route carries its own badge: vocabulary is the one screen whose
    // due count changes hour to hour, and hiding it hides the reason to open the app today.
    if (item.path.startsWith("/vocab") && dueCount > 0) {
      return <Badge tone="primary">{dueCount}</Badge>;
    }
    return null;
  };

  const badgeLabelFor = (item: SidebarItem): string | undefined => {
    if (item.badgeLabel) return item.badgeLabel;
    if (!badges?.[item.path] && item.badge === undefined && item.path.startsWith("/vocab")) {
      return dueCount > 0 ? `${dueCount} cards due` : undefined;
    }
    return undefined;
  };

  // Settings is a destination you reach occasionally, not part of the study run. It sits in
  // the footer with the other chrome so the practice routes read as one uninterrupted list.
  const pinned = items.filter((item) => PINNED_PATHS.has(item.path));
  const main = items.filter((item) => !PINNED_PATHS.has(item.path));

  const ungrouped = main.filter((item) => !item.group);
  // First-appearance order, then anything the caller named explicitly moves to the front in
  // the order it declared — so the sidebar order stays a property of the routes, not of this file.
  const seen: string[] = [];
  for (const item of main) {
    if (item.group && !seen.includes(item.group)) seen.push(item.group);
  }
  const declared = (groups ?? []).map((g) => g.id).filter((id) => seen.includes(id));
  const groupIds = [...declared, ...seen.filter((id) => !declared.includes(id))];

  const renderItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const badge = badgeFor(item);
    const badgeLabel = badgeLabelFor(item);
    // Collapsed, the badge shrinks to a dot, so the count has to survive in the name instead:
    // "Vocabulary, 20 cards due" rather than an icon with a mark on it.
    const collapsedName =
      badge && badgeLabel ? `${item.label}, ${badgeLabel}` : item.label;
    const link = (
      <NavLink
        to={item.path}
        end={item.end}
        onClick={onNavigate}
        // The label is the visible text when expanded; collapsed it becomes the accessible
        // name, so the rail keeps its nine named links instead of nine unnamed icons.
        aria-label={collapsed || (badge && badgeLabel) ? collapsedName : undefined}
        title={collapsed ? collapsedName : undefined}
        className={({ isActive }) =>
          cn(
            "relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed && "justify-center px-0",
            isActive
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )
        }
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && badge && <span className="ml-auto shrink-0">{badge}</span>}
        {collapsed && badge && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </NavLink>
    );
    // `Tooltip` wraps its trigger in an inline-flex span, so without w-full the link
    // collapses to the width of its icon and two rows share a line.
    return collapsed ? (
      <Tooltip
        key={item.path}
        content={collapsedName}
        side="right"
        className="whitespace-nowrap"
        wrapperClassName="w-full"
      >
        {link}
      </Tooltip>
    ) : (
      <div key={item.path}>{link}</div>
    );
  };

  /**
   * A heading a 64px rail has no room for becomes a rule between the groups — the grouping
   * survives the collapse instead of the rail flattening back into one undifferentiated list.
   * `role="group"` carries the name either way, so a screen reader hears it in both states.
   */
  const renderGroup = (id: string) => {
    const label = groupLabel(id, groups);
    return (
      <div key={id} role="group" aria-label={label} className="space-y-1 pt-3 first:pt-0">
        {collapsed ? (
          <div className="mx-3 border-t border-border" aria-hidden="true" />
        ) : (
          <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        )}
        {main.filter((item) => item.group === id).map((item) => renderItem(item))}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "z-40 flex h-full shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground",
        "fixed inset-y-0 left-0 transition-[transform,width,visibility] duration-200 md:static md:translate-x-0",
        collapsed ? "w-16" : "w-56",
        // A closed drawer is only translated off-screen, so below `md` its ten links stayed in
        // the tab order: a keyboard learner pressing Tab from the page title fell into a nav
        // they could not see. `invisible` takes them out; it is a discrete transition, so it
        // still waits for the slide to finish, and `md:visible` keeps the docked rail intact.
        mobileOpen ? "translate-x-0" : "invisible -translate-x-full md:visible md:translate-x-0",
        className,
      )}
    >
      {/* Collapse lives up here with the mark it collapses. It sat in the footer under
          Settings, which put the control furthest from the edge it moves and gave the footer
          a second row it did not need. */}
      <div
        className={cn(
          "titlebar flex h-14 items-center gap-2.5",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <GraduationCap className="h-[18px] w-[18px] text-primary-foreground" aria-hidden="true" />
        </span>
        {!collapsed && <span className="font-semibold">BandReady</span>}
        {/* Expanded, collapse sits with the wordmark it folds away. Collapsed, the 64px rail
            has no room beside the mark, so it drops to its own row just below — still at the
            top, which is the point: it used to be in the footer, as far from the edge it
            moves as the rail allows, and it cost the footer a second row. */}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1.5 ml-auto shrink-0"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <div className="flex shrink-0 justify-center pb-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      )}

      <nav
        aria-label="Study"
        className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-2"
      >
        {ungrouped.map((item) => renderItem(item))}
        {groupIds.map((id) => renderGroup(id))}
      </nav>

      {/* One row expanded: Settings, then your preferences and the theme as icons beside it.
          The footer used to stack a Settings link over a half-empty row holding a sun and a
          collapse arrow — two rows to say what fits on one. */}
      <div className="shrink-0 border-t border-border p-2">
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          {/* Collapsed the row becomes a column, and a bare <nav> in a centred column
              shrinks to its content — which left Settings as a 16px-wide target under
              two 36px icon buttons, narrower than the thing it sits above. `w-full`
              gives it the same hit area and the same centre line as the rest. */}
          <nav aria-label="App" className={cn(collapsed ? "w-full" : "min-w-0 flex-1")}>
            {pinned.map((item) => renderItem(item))}
          </nav>
          <FooterIcon
            collapsed={collapsed}
            icon={SlidersHorizontal}
            label="Your preferences"
            onClick={() => {
              navigate("/settings?tab=you");
              // Below `md` the sidebar is a drawer over the page, so navigating without
              // closing it leaves the learner looking at the nav they just used.
              onNavigate?.();
            }}
          />
          <FooterIcon
            collapsed={collapsed}
            icon={theme === "dark" ? Sun : Moon}
            label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={toggleTheme}
          />
        </div>
      </div>
    </aside>
  );
}

/**
 * One footer control. Always tooltipped rather than only when collapsed: an unlabelled icon
 * needs its name in both states, and the row is icons-beside-a-link either way.
 */
function FooterIcon({
  collapsed,
  icon: Icon,
  label,
  onClick,
}: {
  collapsed: boolean;
  icon: FeatureIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip content={label} side={collapsed ? "right" : "top"}>
      <Button variant="ghost" size="icon" onClick={onClick} aria-label={label}>
        <Icon className="h-4 w-4" />
      </Button>
    </Tooltip>
  );
}

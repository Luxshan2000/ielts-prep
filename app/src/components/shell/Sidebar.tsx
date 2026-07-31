import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { GraduationCap, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Button, Tooltip } from "@/components/ui";
import { useSettingsStore, useSrsStore } from "@/stores";
import type { FeatureIcon } from "@/lib/featureRoute";

export interface SidebarItem {
  path: string;
  label: string;
  icon?: FeatureIcon;
  end?: boolean;
}

export interface SidebarProps {
  items: SidebarItem[];
  /** Extra badge content per route path; overrides the built-in due-count badge. */
  badges?: Record<string, ReactNode>;
  mobileOpen?: boolean;
  onNavigate?: () => void;
  className?: string;
}

const COLLAPSE_KEY = "br-sidebar-collapsed";

// Routes that belong in the footer rather than the study list. Matched by exact path so a
// future /settings/audio still lands in the main nav unless it is added here too.
const PINNED_PATHS = new Set(["/settings"]);

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

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage disabled — collapse state stays session-local */
    }
  }, [collapsed]);

  const badgeFor = (path: string): ReactNode => {
    if (badges && path in badges) return badges[path];
    if (path.startsWith("/vocab") && dueCount > 0) {
      return <Badge tone="primary">{dueCount}</Badge>;
    }
    return null;
  };

  // Settings is a destination you reach occasionally, not part of the study run. It sits in
  // the footer with the other chrome so the practice routes read as one uninterrupted list.
  const pinned = items.filter((item) => PINNED_PATHS.has(item.path));
  const main = items.filter((item) => !PINNED_PATHS.has(item.path));

  const renderItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const badge = badgeFor(item.path);
    const link = (
      <NavLink
        to={item.path}
        end={item.end}
        onClick={onNavigate}
        // The label is the visible text when expanded; collapsed it becomes the accessible
        // name, so the rail keeps its nine named links instead of nine unnamed icons.
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
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
        content={item.label}
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

  return (
    <aside
      className={cn(
        "z-40 flex h-full shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground",
        "fixed inset-y-0 left-0 transition-[transform,width] duration-200 md:static md:translate-x-0",
        collapsed ? "w-16" : "w-56",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        className,
      )}
    >
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
      </div>

      <nav className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-2">
        {main.map((item) => renderItem(item))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border p-2">
        {pinned.map((item) => renderItem(item))}
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(!collapsed && "ml-auto")}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}

import { Link, Outlet, useLocation } from "react-router-dom";
import { GraduationCap, Timer } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Reading feature layout. The screens — library, coach, player, mock and review —
 * are nested routes (see `route.tsx`), so this shell only provides the outlet and
 * lets each screen own its own `PageShell`.
 *
 * The one thing it adds is a launcher strip for the two rooms that are not the
 * library: the coach and the mock paper. It is rendered **only on the library
 * route** — during an attempt, and above all during a mock, a visible link to the
 * coach would be a link to the answers, and the whole point of the exam-conditions
 * guard is that there is nothing to reach for.
 */
export function ReadingPage() {
  const { pathname } = useLocation();
  const onLibrary = pathname === "/reading" || pathname === "/reading/";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {onLibrary && (
        <nav
          aria-label="Reading rooms"
          className="shrink-0 border-b border-border bg-muted/30 px-6 py-2.5"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2">
            <LauncherLink
              to="/reading/coach"
              icon={<GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />}
              title="Reading coach"
              detail="Study one passage — the map, the strategy, and where every answer was."
            />
            <LauncherLink
              to="/reading/mock"
              icon={<Timer className="h-4 w-4 text-primary" aria-hidden="true" />}
              title="Mock paper"
              detail="Three passages, 40 questions, 60 minutes, no help of any kind."
            />
          </div>
        </nav>
      )}
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

function LauncherLink({
  to,
  icon,
  title,
  detail,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2",
        "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ring",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">{title}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{detail}</span>
      </span>
    </Link>
  );
}

export default ReadingPage;

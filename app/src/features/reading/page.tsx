import { Outlet } from "react-router-dom";

/**
 * Reading feature layout. The screens — library, coach, player, mock and review —
 * are nested routes (see `route.tsx`), so this shell only provides the outlet and
 * lets each screen own its own `PageShell`.
 *
 * It used to add a launcher strip for the coach and the mock above the outlet, which
 * put a nav bar between the sidebar and the page title, truncated both descriptions to
 * nonsense below 900px, and gave Reading its entry points in a slot no other skill uses.
 * Those two doors now live in the library's own header, beside the title, exactly where
 * Listening and Writing put theirs.
 */
export function ReadingPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Outlet />
    </div>
  );
}

export default ReadingPage;

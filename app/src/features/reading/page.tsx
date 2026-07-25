import { Outlet } from "react-router-dom";

/**
 * Reading feature layout. The three screens — library, player and review — are
 * nested routes (see `route.tsx`), so this shell only has to provide the outlet
 * and let each screen own its own `PageShell`.
 */
export function ReadingPage() {
  return <Outlet />;
}

export default ReadingPage;

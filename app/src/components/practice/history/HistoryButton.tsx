import { useNavigate } from "react-router-dom";
import { History } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * The way into a room's history, from the room's header.
 *
 * Goes in `PageShell`'s `actions` slot so it sits with the other header controls and lands in
 * the same place in every room. The count is shown when it is known, because "History" alone
 * gives a learner no reason to press it and no idea whether there is anything behind it.
 */
export function HistoryButton({
  to,
  count,
  label = "History",
}: {
  to: string;
  count?: number | null;
  label?: string;
}) {
  const navigate = useNavigate();
  return (
    <Button variant="outline" size="sm" onClick={() => navigate(to)}>
      <History className="h-4 w-4" aria-hidden="true" />
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="tabular ml-1 text-muted-foreground">{count}</span>
      )}
    </Button>
  );
}

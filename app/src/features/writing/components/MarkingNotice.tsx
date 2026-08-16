/**
 * "Nothing here can mark your answer" — said before the answer, not after it.
 *
 * Renders only when the probe in `../markingStatus` came back `unavailable`, so a
 * working install never sees it. It warns and offers the way out; it never disables
 * the button behind it, because practising without a band is still practice.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ScanSearch } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { MARKING_FIX, useMarkingStatus } from "../markingStatus";

export interface MarkingNoticeProps {
  /**
   * What the learner is about to spend, named exactly — "an hour", "forty minutes".
   * The cost is the whole point of showing this before rather than after.
   */
  cost: string;
  className?: string;
}

export function MarkingNotice({ cost, className }: MarkingNoticeProps) {
  const navigate = useNavigate();
  const state = useMarkingStatus((s) => s.state);
  const reason = useMarkingStatus((s) => s.reason);
  const check = useMarkingStatus((s) => s.check);

  useEffect(() => {
    void check();
  }, [check]);

  if (state !== "unavailable" || !reason) return null;

  return (
    <Notice
      tone="warning"
      icon={ScanSearch}
      title="Your answer cannot be marked yet"
      className={className}
      actions={
        <Button size="sm" variant="outline" onClick={() => navigate("/settings")}>
          Set up marking
        </Button>
      }
    >
      <p>{reason}</p>
      <p className="mt-1">
        You can still write this, and it is saved on this machine, but there will be no band and
        no feedback at the end of {cost}.
      </p>
      <p className="mt-1">{MARKING_FIX}</p>
    </Notice>
  );
}

export default MarkingNotice;

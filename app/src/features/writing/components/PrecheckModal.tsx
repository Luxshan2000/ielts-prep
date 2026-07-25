/**
 * The pre-check gate (05 §5). Blocks return the learner to the editor; warnings
 * offer "Submit anyway", which is recorded on the submission but never gates it.
 */

import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge, Button, Modal } from "@/components/ui";
import type { PrecheckReport } from "../store";

export interface PrecheckModalProps {
  report: PrecheckReport | null;
  submitting: boolean;
  onClose: () => void;
  onSubmitAnyway: () => void;
}

export function PrecheckModal({ report, submitting, onClose, onSubmitAnyway }: PrecheckModalProps) {
  const blocked = (report?.blocks.length ?? 0) > 0;
  const warnings = report?.warnings ?? [];

  return (
    <Modal
      open={report !== null}
      onClose={onClose}
      size="md"
      title={blocked ? "This answer can't be marked yet" : "Before we mark this"}
      footer={
        blocked ? (
          <Button onClick={onClose}>Back to the editor</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Keep writing
            </Button>
            <Button loading={submitting} onClick={onSubmitAnyway}>
              Submit anyway
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3 text-[13px]">
          <Badge tone={blocked ? "destructive" : warnings.length > 0 ? "warning" : "success"}>
            {report?.word_count ?? 0} words
          </Badge>
          <span className="text-muted-foreground">
            Minimum for this task: {report?.min_words ?? 0} words
          </span>
        </div>

        {blocked && (
          <ul className="space-y-2.5">
            {report?.blocks.map((check) => (
              <li key={check.id} className="flex items-start gap-2.5">
                <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <p className="text-[13px] leading-6 text-foreground">{check.message}</p>
              </li>
            ))}
          </ul>
        )}

        {!blocked && warnings.length > 0 && (
          <ul className="space-y-2.5">
            {warnings.map((check) => (
              <li key={check.id} className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <p className="text-[13px] leading-6 text-foreground">{check.message}</p>
              </li>
            ))}
          </ul>
        )}

        {!blocked && warnings.length === 0 && (
          <p className="flex items-start gap-2.5 text-[13px] leading-6 text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            Every pre-check passed. Marking takes one model call and about half a minute.
          </p>
        )}

        <p className="border-t border-border pt-3 text-[12px] text-muted-foreground">
          {blocked
            ? "These checks run on your machine before any model is called, so nothing is spent on an answer that can't be marked fairly."
            : "Warnings are passed to the examiner model as context — a real examiner would notice them too."}
        </p>
      </div>
    </Modal>
  );
}

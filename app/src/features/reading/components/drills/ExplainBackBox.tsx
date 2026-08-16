import { useState } from "react";
import { Badge, Button, Textarea } from "@/components/ui";
import { errorText } from "../../store";
import { explainBack } from "./api";
import type { ExplainBack } from "./types";

const TONE = {
  aligned: "success",
  partial: "warning",
  off: "destructive",
} as const;

const TITLE = {
  aligned: "That is the reason",
  partial: "Half of it",
  off: "Not the reason",
} as const;

/**
 * "Say why, in your own words" — the one thing in this surface a string comparison
 * cannot mark.
 *
 * Everything else a drill decides is mechanical, and a mechanical question answered by a
 * model is a mechanical question answered unreliably. This is the exception: whether a
 * sentence the learner composed gives the *same reason* as the authored decision rule.
 * Being able to explain your own correction is what separates learners who improve from
 * learners who read explanations and nod.
 *
 * It runs after the mechanical verdict and can never change it. It is also optional and
 * unavailable on pre-payload questions, where there is no authored rule to check against
 * and a model asked to invent the standard would grade the learner against its own guess.
 */
export function ExplainBackBox({
  questionId,
  selfTrap,
  disabled,
}: {
  questionId: string;
  selfTrap?: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExplainBack | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Explain it back in one sentence
      </Button>
    );
  }

  async function submit() {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await explainBack({ questionId, sentence: trimmed, selfTrap }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <label className="block text-[12px] font-medium" htmlFor={`explain-${questionId}`}>
        Why is that the answer? One sentence in your own words, giving the reason rather than the verdict.
      </label>
      <Textarea
        id={`explain-${questionId}`}
        rows={2}
        value={sentence}
        maxLength={600}
        disabled={busy || Boolean(result)}
        onChange={(event) => setSentence(event.target.value)}
        placeholder="Because the passage only says…"
      />
      {!result && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={submit} disabled={busy || !sentence.trim()}>
            {busy ? "Checking…" : "Check my reason"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      )}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {result && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[result.verdict]}>{TITLE[result.verdict]}</Badge>
            {result.model && (
              <span className="text-[11px] text-muted-foreground">{result.model}</span>
            )}
          </div>
          {result.note && <p className="text-[13px] leading-relaxed">{result.note}</p>}
          {result.missing && result.verdict !== "aligned" && (
            <p className="text-[12px] text-muted-foreground">Missing: {result.missing}</p>
          )}
          <p className="text-[12px] text-muted-foreground">
            The authored rule: {result.decision_rule}
          </p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, WifiOff } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { SpeakAnswer } from "@/components/practice/SpeakAnswer";
import { speakVocabSentence } from "../../api";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChipList, Section, type CommitResult, type ExerciseBodyProps } from "./shared";
import type { CheckSentenceResponse, UseInSentencePayload } from "../../types";

/**
 * §5.2.3 production check. The only exercise the sidecar grades: it asks the
 * configured language model whether the item was used with the right meaning and
 * grammar, and hands back `acceptable` / `issues` / `better_version`.
 * When the model is unreachable the check degrades to "rate yourself" — the
 * review still counts.
 */
export function UseInSentenceExercise({ item, revealed, onCommit, autoFocus }: ExerciseBodyProps) {
  const payload = item.exercise.payload as UseInSentencePayload;
  const [sentence, setSentence] = useState("");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckSentenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const committed = useRef(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  const commit = (result: CommitResult) => {
    if (committed.current) return;
    committed.current = true;
    onCommit(result);
  };

  useEffect(() => {
    if (!revealed || committed.current) return;
    commit({
      correct: null,
      suggestedRating: null,
      detail: "Not checked — rate how confident that sentence felt.",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const runCheck = async () => {
    const text = sentence.trim();
    if (!text) return;
    setChecking(true);
    setError(null);
    try {
      const res = await api.post<CheckSentenceResponse>("/api/v1/vocab/check-sentence", {
        entry_id: item.entry_id,
        sentence: text,
      });
      setCheck(res);
      commit({
        correct: res.acceptable,
        suggestedRating: res.checked ? res.suggested_rating : null,
        detail: res.detail,
      });
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? err.detail
          : "the sentence check could not run — rate yourself instead";
      setError(detail);
      commit({ correct: null, suggestedRating: null, detail });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight">{payload.headword}</p>
        <p className="text-[13px] text-muted-foreground">
          {payload.pos && <span className="italic">{payload.pos} · </span>}
          {payload.definition || "No definition yet."}
        </p>
      </div>

      {payload.collocations.length > 0 && (
        <Section title="Natural combinations">
          <ChipList items={payload.collocations.slice(0, 5)} />
        </Section>
      )}

      <Textarea
        ref={areaRef}
        rows={3}
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
        disabled={revealed}
        placeholder={`Write one sentence using “${payload.headword}”…`}
        aria-label={`A sentence using ${payload.headword}`}
      />

      {!revealed && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Beside the typed path, never instead of it. The transcript lands in the same
              box, so the check that follows is the identical one. */}
          <SpeakAnswer
            prompt="Or say your sentence out loud."
            disabled={revealed || checking}
            onSubmit={async (audio) => {
              const spoken = await speakVocabSentence(audio, item.entry_id);
              if (spoken.gradeable) setSentence(spoken.transcript);
              return spoken;
            }}
          />
          <Button size="sm" loading={checking} disabled={!sentence.trim()} onClick={() => void runCheck()}>
            Check my sentence
          </Button>
          <span className="text-[11px] text-muted-foreground">
            The language model judges meaning and grammar only.
          </span>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px] text-warning">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {check && (
        <div className="space-y-3 border-t border-border pt-4">
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-medium",
              check.acceptable === true && "text-success",
              check.acceptable === false && "text-warning",
              check.acceptable === null && "text-muted-foreground",
            )}
          >
            {check.acceptable === true ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            )}
            {check.acceptable === true
              ? "Used correctly"
              : check.acceptable === false
                ? "Not quite right yet"
                : "Could not be checked"}
          </p>

          {check.issues.length > 0 && (
            <Section title="What to fix">
              <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
                {check.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Section>
          )}

          {check.better_version && (
            <Section title="Minimally corrected">
              <p className="rounded-lg bg-muted/60 p-3 text-[13px] leading-relaxed">
                {check.better_version}
              </p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

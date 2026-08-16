import { useEffect } from "react";
import { AlertCircle, Check, CheckCheck, Inbox, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
  Tooltip,
  useConfirm,
} from "@/components/ui";
import { pluralize } from "@/lib/format";
import { WordAudioButton } from "./WordAudioButton";
import { POS_LABELS, isPendingDefinition, levelLabel, sourceAttribution, topicLabel } from "../labels";
import { useVocabStore } from "../store";
import type { VocabEntry } from "../types";

/**
 * The suggestion inbox (ruling R2-5): the ONLY door through which words from
 * Speaking / Writing / Reading / Listening reach the review queue. Accepting
 * schedules the card now; dismissing deletes the suggestion outright.
 */
export function SuggestionsInbox() {
  const confirm = useConfirm();
  const items = useVocabStore((s) => s.suggestions);
  const total = useVocabStore((s) => s.suggestionsTotal);
  const loading = useVocabStore((s) => s.suggestionsLoading);
  const error = useVocabStore((s) => s.suggestionsError);
  const busy = useVocabStore((s) => s.suggestionBusy);
  const load = useVocabStore((s) => s.loadSuggestions);
  const accept = useVocabStore((s) => s.acceptSuggestion);
  const dismiss = useVocabStore((s) => s.dismissSuggestion);
  const acceptAll = useVocabStore((s) => s.acceptAllSuggestions);

  useEffect(() => {
    void load();
  }, [load]);

  const onAcceptAll = async () => {
    const ok = await confirm({
      title: `Accept ${pluralize(items.length, "word")}?`,
      message:
        "Every word in this inbox becomes an active card, scheduled for review right away. You can still suspend or delete them later from the browser.",
      confirmLabel: "Accept all",
    });
    if (ok) await acceptAll();
  };

  if (loading && items.length === 0) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="The inbox could not be loaded"
        description={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {total === 0
                ? "No words are waiting"
                : `${pluralize(total, "word")} waiting for your decision`}
            </p>
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              This inbox is the only way a word enters your review queue. Nothing here is
              scheduled, and nothing is ever added automatically by a practice session.
            </p>
          </div>
          {items.length > 0 && (
            <Button onClick={() => void onAcceptAll()} loading={busy.length > 1}>
              <CheckCheck className="h-4 w-4" />
              Accept all
            </Button>
          )}
        </CardContent>
      </Card>

      {error && items.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Your inbox is empty"
          description="Finish a Speaking, Writing, Reading or Listening activity and the words you struggled with will land here for you to accept."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((entry) => (
            <SuggestionRow
              key={entry.id}
              entry={entry}
              busy={busy.includes(entry.id)}
              onAccept={() => void accept(entry.id)}
              onDismiss={() => void dismiss(entry.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionRow({
  entry,
  busy,
  onAccept,
  onDismiss,
}: {
  entry: VocabEntry;
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const pending = isPendingDefinition(entry.definition);

  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">{entry.headword}</span>
              {entry.ipa && (
                <span className="tabular text-[13px] text-muted-foreground">{entry.ipa}</span>
              )}
              <Badge tone="outline">{POS_LABELS[entry.pos] ?? entry.pos}</Badge>
              {levelLabel(entry.cefr_level) && (
                <Badge tone="default" title={`Common European Framework level ${entry.cefr_level}`}>
                  {levelLabel(entry.cefr_level)}
                </Badge>
              )}
              <WordAudioButton mediaPath={entry.audio_url} text={entry.headword} variant="ghost" />
            </div>

            <p className="text-[13px] leading-relaxed">
              {pending ? (
                <span className="text-muted-foreground">
                  Definition is still being filled in. Accepting will finish it in the background.
                </span>
              ) : (
                entry.definition
              )}
            </p>

            {entry.own_context_sentence && (
              <p className="rounded-lg bg-muted/60 p-2.5 text-[13px] italic leading-relaxed">
                “{entry.own_context_sentence}”
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                {sourceAttribution(entry)}
              </span>
              {entry.topic_tags.map((tag) => (
                <Badge key={tag} tone="outline" className="font-normal">
                  {topicLabel(tag)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={onAccept} loading={busy}>
              <Check className="h-4 w-4" />
              Accept
            </Button>
            <Tooltip content="Deletes the suggestion. It can come back if you misuse the word again.">
              <span className="inline-flex">
                <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
                  <Trash2 className="h-4 w-4" />
                  Dismiss
                </Button>
              </span>
            </Tooltip>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, PauseCircle, RotateCcw, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  Skeleton,
  Textarea,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  MATURITY_META,
  POS_LABELS,
  STATUS_META,
  formatDue,
  levelLabel,
  percent,
  registerLabel,
  shortDate,
  situationLabel,
  sourceAttribution,
  topicLabel,
} from "../labels";
import { useVocabStore } from "../store";
import type { VocabEntry, VocabStatus } from "../types";
import { WordAudioButton } from "./WordAudioButton";

/** Inspector for one entry: everything stored about it, plus the actions on it. */
export function EntryDetailDrawer() {
  const confirm = useConfirm();
  const entry = useVocabStore((s) => s.detail);
  const loading = useVocabStore((s) => s.detailLoading);
  const error = useVocabStore((s) => s.detailError);
  const close = useVocabStore((s) => s.closeDetail);
  const patchEntry = useVocabStore((s) => s.patchEntry);
  const loadEntries = useVocabStore((s) => s.loadEntries);
  const refreshCounters = useVocabStore((s) => s.refreshCounters);

  const [definition, setDefinition] = useState("");
  const [sentence, setSentence] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setDefinition(entry?.definition ?? "");
    setSentence(entry?.own_context_sentence ?? "");
    setActionError(null);
  }, [entry?.id, entry?.definition, entry?.own_context_sentence]);

  if (!entry && !loading) return null;

  // Present only on the single-entry read, and only for words the shipped pack still knows
  // more about than the bank stores.
  const usage = entry?.usage ?? null;
  const situations = usage?.situations ?? [];
  const register = registerLabel(usage?.register);

  const dirty =
    entry !== null &&
    (definition.trim() !== (entry.definition ?? "").trim() ||
      sentence.trim() !== (entry.own_context_sentence ?? "").trim());

  const save = async () => {
    if (!entry) return;
    setSaving(true);
    const ok = await patchEntry(entry.id, {
      definition: definition.trim(),
      own_context_sentence: sentence.trim() || null,
    } as Partial<VocabEntry>);
    setSaving(false);
    if (!ok) setActionError("Those edits could not be saved.");
  };

  const setStatus = async (status: VocabStatus) => {
    if (!entry) return;
    setBusy(true);
    const ok = await patchEntry(entry.id, { status } as Partial<VocabEntry>);
    setBusy(false);
    if (!ok) setActionError("The status could not be changed.");
  };

  const remove = async () => {
    if (!entry) return;
    const ok = await confirm({
      title: `Delete “${entry.headword}”?`,
      message: "The entry, its schedule and its review history are removed for good.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.del(`/api/v1/vocab/entries/${entry.id}`);
      close();
      await loadEntries();
      await refreshCounters();
    } catch {
      setActionError("The entry could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={entry !== null || loading}
      onClose={close}
      title={entry?.headword ?? "Loading…"}
      width="max-w-lg"
      footer={
        entry ? (
          <>
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button onClick={() => void save()} disabled={!dirty} loading={saving}>
              Save changes
            </Button>
          </>
        ) : undefined
      }
    >
      {loading && !entry ? (
        <div className="space-y-3 p-5" aria-busy="true">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : entry ? (
        <div className="space-y-6 p-5">
          {(error || actionError) && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {actionError ?? error}
            </p>
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-2xl font-semibold tracking-tight">{entry.headword}</p>
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                {entry.ipa && <span className="tabular">{entry.ipa}</span>}
                <span className="italic">{POS_LABELS[entry.pos] ?? entry.pos}</span>
                {levelLabel(entry.cefr_level) && (
                  <Badge tone="default" title={`Common European Framework level ${entry.cefr_level}`}>
                    {levelLabel(entry.cefr_level)}
                  </Badge>
                )}
                <Badge tone={STATUS_META[entry.status].tone}>
                  {STATUS_META[entry.status].label}
                </Badge>
              </p>
              <p className="text-[11px] text-muted-foreground">{sourceAttribution(entry)}</p>
            </div>
            <WordAudioButton mediaPath={entry.audio_url} text={entry.headword} />
          </div>

          <p className="text-[12px] text-muted-foreground">{STATUS_META[entry.status].hint}</p>

          <Block title="Definition">
            <Textarea
              rows={2}
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              aria-label="Definition"
            />
          </Block>

          <Block title="Your own sentence">
            <Textarea
              rows={3}
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder="The sentence you met this word in. The gap-fill exercise is built from it."
              aria-label="Your own context sentence"
            />
          </Block>

          {entry.collocations.length > 0 && (
            <Block title="Collocations">
              <div className="flex flex-wrap gap-1.5">
                {entry.collocations.map((c) => (
                  <Badge key={c} tone="outline" className="font-normal">
                    {c}
                  </Badge>
                ))}
              </div>
            </Block>
          )}

          {/*
            Examples, and where each one belongs.

            The pack authored every example against a situation — one for a speaking part,
            one for a Task 2 essay, one academic — and the bank kept only the sentences.
            A learner who asked "when and where do I use this word" was reading three
            unlabelled lines. When the pack row is still reachable the situation is shown
            with the sentence; the plain list below is the fallback for a word the learner
            added themselves.
          */}
          {situations.length > 0 ? (
            <Block title="Examples, and where to use them">
              <ul className="space-y-2.5">
                {situations.map((situation) => {
                  const where = situationLabel(situation.skill, situation.register);
                  return (
                    <li key={situation.text}>
                      {where && (
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {where}
                        </p>
                      )}
                      <p className="text-[13px] leading-relaxed">{situation.text}</p>
                    </li>
                  );
                })}
              </ul>
            </Block>
          ) : (
            entry.example_sentences.length > 0 && (
              <Block title="Examples">
                <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {entry.example_sentences.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </Block>
            )
          )}

          {(register || usage?.avoid) && (
            <Block title="When to use it">
              {register && <p className="text-[13px] leading-relaxed">{register}</p>}
              {usage?.avoid && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">{usage.avoid}</p>
              )}
            </Block>
          )}

          {(usage?.confusables.length ?? 0) > 0 && (
            <Block title="Not the same as">
              <ul className="space-y-2.5">
                {usage?.confusables.map((other) => (
                  <li key={other.term}>
                    <p className="text-[13px] font-medium">{other.term}</p>
                    {other.difference && (
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {other.difference}
                      </p>
                    )}
                    {other.minimal_pair.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[12px] italic text-muted-foreground">
                        {other.minimal_pair.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {entry.topic_tags.length > 0 && (
            <Block title="Topics">
              <div className="flex flex-wrap gap-1.5">
                {entry.topic_tags.map((tag) => (
                  <Badge key={tag} tone="outline" className="font-normal">
                    {topicLabel(tag)}
                  </Badge>
                ))}
              </div>
            </Block>
          )}

          <Block title="Review history">
            {entry.srs ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <Row
                  label="Maturity"
                  value={
                    <Badge tone={MATURITY_META[entry.srs.maturity].tone}>
                      {MATURITY_META[entry.srs.maturity].label}
                    </Badge>
                  }
                />
                <Row label="State" value={entry.srs.state} />
                <Row label="Reviews" value={String(entry.srs.reps)} />
                <Row label="Lapses" value={String(entry.srs.lapses)} />
                <Row label="Next due" value={`${formatDue(entry.srs.due)} · ${shortDate(entry.srs.due)}`} />
                <Row label="Last review" value={shortDate(entry.srs.last_review)} />
                <Row
                  label="Stability"
                  value={
                    entry.srs.stability === null
                      ? "-"
                      : `${entry.srs.stability.toFixed(1)} days`
                  }
                />
                <Row
                  label="Recall now"
                  value={percent(entry.srs.retrievability)}
                />
              </dl>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Not scheduled yet. Accept it from the inbox or set it active to start reviewing.
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Added {shortDate(entry.created_at)} · last changed {shortDate(entry.updated_at)}
            </p>
          </Block>

          <Block title="Actions">
            <div className="flex flex-wrap gap-2">
              {entry.status !== "active" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus("active")}>
                  <RotateCcw className="h-4 w-4" />
                  Put back in rotation
                </Button>
              )}
              {entry.status !== "suspended" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus("suspended")}>
                  <PauseCircle className="h-4 w-4" />
                  Suspend
                </Button>
              )}
              {entry.status !== "known" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus("known")}>
                  <CheckCircle2 className="h-4 w-4" />
                  Mark known
                </Button>
              )}
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove()}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </Block>
        </div>
      ) : null}
    </Drawer>
  );
}

function Block({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{value}</dd>
    </>
  );
}

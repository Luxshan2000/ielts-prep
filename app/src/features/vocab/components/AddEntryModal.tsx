import { useEffect, useState } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { POS_LABELS, POS_VALUES, isPendingDefinition, topicLabel } from "../labels";
import { useVocabStore, type AddEntryInput } from "../store";
import type { LookupPreview } from "../types";

const POS_OPTIONS = [
  { value: "", label: "Let BandReady decide" },
  ...POS_VALUES.map((pos) => ({ value: pos, label: POS_LABELS[pos] ?? pos })),
];

export interface AddEntryModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Manual add. Unlike a module suggestion this schedules immediately (§3.2) —
 * the learner asked for it, so it is active from the moment it lands.
 */
export function AddEntryModal({ open, onClose }: AddEntryModalProps) {
  const addEntry = useVocabStore((s) => s.addEntry);
  const lookupWord = useVocabStore((s) => s.lookupWord);

  const [term, setTerm] = useState("");
  const [sentence, setSentence] = useState("");
  const [pos, setPos] = useState("");
  const [definition, setDefinition] = useState("");
  const [preview, setPreview] = useState<LookupPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setTerm("");
    setSentence("");
    setPos("");
    setDefinition("");
    setPreview(null);
    setError(null);
    setNotice(null);
  }, [open]);

  const runLookup = async () => {
    const word = term.trim();
    if (!word) return;
    setLooking(true);
    setError(null);
    setNotice(null);
    try {
      const res = await lookupWord(word, sentence.trim() || undefined);
      if (!res.found || !res.preview) {
        setPreview(null);
        setNotice(`The language model does not recognise “${word}” as an English word or phrase.`);
        return;
      }
      setPreview(res.preview);
      if (!definition.trim() && !isPendingDefinition(res.preview.definition)) {
        setDefinition(res.preview.definition);
      }
      if (!pos && res.preview.pos && res.preview.pos !== "other") setPos(res.preview.pos);
      if (isPendingDefinition(res.preview.definition)) {
        setNotice(
          "The language model returned nothing extra for this word. Add a definition yourself, or save it and let the background pass fill it in.",
        );
      }
    } catch (err) {
      setPreview(null);
      setNotice(
        err instanceof ApiError
          ? `Look-up is unavailable: ${err.detail}. You can still add the word and fill the definition in later.`
          : "Look-up is unavailable. You can still add the word and fill the definition in later.",
      );
    } finally {
      setLooking(false);
    }
  };

  const save = async () => {
    const word = term.trim();
    if (!word) return;
    setSaving(true);
    setError(null);
    const input: AddEntryInput = {
      term: word,
      pos: pos || undefined,
      definition: definition.trim() || undefined,
      ipa: preview?.ipa ?? undefined,
      cefr_level: preview?.cefr_level ?? undefined,
      sentence_context: sentence.trim() || undefined,
      topic_tags: preview?.topic_tags,
      example_sentences: preview?.example_sentences,
      collocations: preview?.collocations,
    };
    const entry = await addEntry(input);
    setSaving(false);
    if (entry) {
      onClose();
      return;
    }
    setError("The word could not be saved. Check the sidecar is running and try again.");
  };

  const hasPreviewDetail = Boolean(
    preview &&
      (preview.ipa ||
        preview.cefr_level ||
        preview.topic_tags.length > 0 ||
        preview.collocations.length > 0 ||
        preview.example_sentences.length > 0),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a word to your bank"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!term.trim()}>
            Add and schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          A word you add yourself is scheduled straight away. That is the difference between this
          and the suggestion inbox.
        </p>

        <Field label="Word or phrase" required>
          {({ id }) => (
            <Input
              id={id}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="mitigate"
              autoComplete="off"
            />
          )}
        </Field>

        <Field
          label="Your own sentence"
          hint="Optional, but it is what the gap-fill exercise is built from."
        >
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder="Governments must mitigate the effects of rising sea levels."
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Part of speech">
            {() => <Select value={pos} onChange={setPos} options={POS_OPTIONS} />}
          </Field>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => void runLookup()}
              loading={looking}
              disabled={!term.trim()}
            >
              <Sparkles className="h-4 w-4" />
              Look it up
            </Button>
          </div>
        </div>

        <Field label="Definition" hint="Filled in automatically when you look the word up.">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              placeholder="make something less severe or harmful"
            />
          )}
        </Field>

        {notice && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px] text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {notice}
          </p>
        )}

        {preview && hasPreviewDetail && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Will be saved with
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
              {preview.ipa && <span className="tabular">{preview.ipa}</span>}
              {preview.cefr_level && <Badge tone="default">{preview.cefr_level}</Badge>}
              {preview.topic_tags.map((tag) => (
                <Badge key={tag} tone="outline" className="font-normal">
                  {topicLabel(tag)}
                </Badge>
              ))}
            </div>
            {preview.collocations.length > 0 && (
              <p className="text-[13px] text-muted-foreground">
                {preview.collocations.join(" · ")}
              </p>
            )}
            {preview.example_sentences.length > 0 && (
              <ul className="space-y-1 text-[13px] italic text-muted-foreground">
                {preview.example_sentences.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

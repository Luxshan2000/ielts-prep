import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Highlighter, Search, StickyNote, Trash2 } from "lucide-react";
import { Badge, Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  findQuote,
  noteKey,
  paragraphDomId,
  sentenceAround,
  sliceSpans,
  type SpanRange,
} from "../model";
import type { Highlight, PassageDoc } from "../types";
import { useDictionary } from "../useDictionary";
import { DictionaryCard } from "./DictionaryCard";
import { Popover } from "./Popover";

export interface LocateRequest {
  paragraphId: string | null;
  quote: string | null;
  nonce: number;
}

export interface PassagePaneProps {
  passage: PassageDoc;
  /** The whole attempt's highlights — indices line up with `onRemoveHighlight`. */
  highlights: Highlight[];
  notes: Record<string, string>;
  onAddHighlight?: (highlight: Highlight) => void;
  onRemoveHighlight?: (index: number) => void;
  onSetNote?: (key: string, text: string) => void;
  onLookedUp?: (word: string) => void;
  /** Exam conditions turn the note tool off (06 §5). */
  toolsEnabled?: boolean;
  /** Exam conditions also silence the dictionary; words queue for after. */
  lookupEnabled?: boolean;
  locate?: LocateRequest | null;
  className?: string;
}

interface SelectionState {
  rect: DOMRect;
  paragraphId: string;
  textId: string;
  start: number;
  end: number;
  text: string;
}

/** Character offset of (node, offset) within `root`, counting rendered text only. */
function offsetWithin(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return range.toString().length;
}

function readSelection(): SelectionState | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;
  const endEl =
    range.endContainer.nodeType === Node.ELEMENT_NODE
      ? (range.endContainer as Element)
      : range.endContainer.parentElement;
  const paragraph = startEl?.closest<HTMLElement>("[data-paragraph-id]");
  const endParagraph = endEl?.closest<HTMLElement>("[data-paragraph-id]");
  if (!paragraph || paragraph !== endParagraph) return null;
  const text = selection.toString();
  if (!text.trim()) return null;
  const start = offsetWithin(paragraph, range.startContainer, range.startOffset);
  const end = offsetWithin(paragraph, range.endContainer, range.endOffset);
  if (end <= start) return null;
  return {
    rect: range.getBoundingClientRect(),
    paragraphId: paragraph.dataset.paragraphId ?? "",
    textId: paragraph.dataset.textId ?? "",
    start,
    end,
    text,
  };
}

/**
 * The left half of the split view: the passage with visible paragraph markers,
 * persistent highlights and notes, and the double-click dictionary popover.
 *
 * Offsets are plain-text character offsets into the paragraph, so a highlight
 * survives a reload even though the DOM is rebuilt from scratch (06 §5).
 */
export function PassagePane({
  passage,
  highlights,
  notes,
  onAddHighlight,
  onRemoveHighlight,
  onSetNote,
  onLookedUp,
  toolsEnabled = true,
  lookupEnabled = true,
  locate,
  className,
}: PassagePaneProps) {
  const passageId = passage.passage_id ?? passage.id;
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [noteTarget, setNoteTarget] = useState<{ paragraphId: string; rect: DOMRect } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [lookupAnchor, setLookupAnchor] = useState<{ rect: DOMRect; sentence: string } | null>(
    null,
  );
  const [flash, setFlash] = useState<string | null>(null);
  const dictionary = useDictionary();

  const paragraphTexts = useMemo(() => {
    const map = new Map<string, string>();
    for (const block of passage.texts ?? []) {
      for (const para of block.paragraphs ?? []) map.set(String(para.id), para.text ?? "");
    }
    return map;
  }, [passage]);

  /** paragraphId → highlight ranges, tagged with their index in `highlights`. */
  const ranges = useMemo(() => {
    const map = new Map<string, SpanRange[]>();
    highlights.forEach((highlight, index) => {
      if (highlight.passage_id && highlight.passage_id !== passageId) return;
      const list = map.get(highlight.paragraph_id) ?? [];
      list.push({
        start: highlight.start_offset,
        end: highlight.end_offset,
        kind: "highlight",
        id: index,
      });
      map.set(highlight.paragraph_id, list);
    });
    return map;
  }, [highlights, passageId]);

  // Locate-in-passage: scroll the paragraph into view and flash it.
  useEffect(() => {
    if (!locate?.paragraphId) return;
    const id = paragraphDomId(passageId, locate.paragraphId);
    const node = document.getElementById(id);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(locate.paragraphId);
    const timer = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(timer);
  }, [locate?.nonce, locate?.paragraphId, passageId]);

  /**
   * True while the dictionary popover is up. A double-click both selects a word
   * (which would raise the selection toolbar on the deferred pointer-up below)
   * and opens the dictionary — without this guard the two popovers stack on top
   * of each other and Escape only dismisses the toolbar.
   */
  const lookupOpen = useRef(false);

  const closeAll = useCallback(() => {
    lookupOpen.current = false;
    setSelection(null);
    setLookupAnchor(null);
    dictionary.reset();
  }, [dictionary]);

  const onPointerUp = useCallback(() => {
    if (!toolsEnabled && !lookupEnabled) return;
    // Let the browser finish updating the selection first.
    window.setTimeout(() => {
      if (lookupOpen.current) return;
      const next = readSelection();
      setSelection(next);
    }, 0);
  }, [toolsEnabled, lookupEnabled]);

  const onDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-paragraph-id]",
      );
      if (!target) return;
      const word = window.getSelection()?.toString().trim() ?? "";
      if (!word || /\s/.test(word)) return;
      onLookedUp?.(word);
      if (!lookupEnabled) {
        setSelection(null);
        return;
      }
      const info = readSelection();
      const paragraphText = paragraphTexts.get(target.dataset.paragraphId ?? "") ?? "";
      setSelection(null);
      lookupOpen.current = true;
      setLookupAnchor({
        rect: info?.rect ?? target.getBoundingClientRect(),
        sentence: sentenceAround(paragraphText, info?.start ?? 0),
      });
      void dictionary.lookup(word);
    },
    [dictionary, lookupEnabled, onLookedUp, paragraphTexts],
  );

  function commitHighlight() {
    if (!selection || !onAddHighlight) return;
    onAddHighlight({
      passage_id: passageId,
      text_id: selection.textId,
      paragraph_id: selection.paragraphId,
      start_offset: selection.start,
      end_offset: selection.end,
      color: "yellow",
      quote: selection.text.slice(0, 240),
    });
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  function openNote(paragraphId: string, rect: DOMRect) {
    setNoteDraft(notes[noteKey(passageId, paragraphId)] ?? "");
    setNoteTarget({ paragraphId, rect });
    setSelection(null);
  }

  function openLookupFromSelection() {
    if (!selection) return;
    const word = selection.text.trim().split(/\s+/)[0] ?? "";
    if (!word) return;
    const paragraphText = paragraphTexts.get(selection.paragraphId) ?? "";
    onLookedUp?.(word);
    setLookupAnchor({
      rect: selection.rect,
      sentence: sentenceAround(paragraphText, selection.start),
    });
    setSelection(null);
    void dictionary.lookup(word);
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
        onMouseUp={onPointerUp}
        onKeyUp={(event) => {
          if (event.shiftKey || event.key === "Shift") onPointerUp();
        }}
        onDoubleClick={onDoubleClick}
      >
        <div className="mx-auto w-full max-w-3xl px-5 py-5">
          <header className="mb-4 space-y-1.5 border-b border-border pb-3">
            <h2 className="text-base font-semibold">{passage.title}</h2>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {passage.position ? <Badge tone="outline">Passage {passage.position}</Badge> : null}
              {passage.gt_section ? <Badge tone="outline">Section {passage.gt_section}</Badge> : null}
              {passage.difficulty ? <Badge tone="default">{passage.difficulty}</Badge> : null}
              {passage.topic ? <span>{passage.topic}</span> : null}
              {passage.word_count ? <span className="tabular">{passage.word_count} words</span> : null}
            </div>
          </header>

          {(passage.texts ?? []).length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              This passage has no text body in the installed content pack.
            </p>
          )}

          {(passage.texts ?? []).map((block) => (
            <section key={block.id} className="mb-6 last:mb-0">
              {block.heading && (
                <h3 className="mb-2 text-sm font-semibold text-foreground">{block.heading}</h3>
              )}
              <div className="space-y-3">
                {(block.paragraphs ?? []).map((para) => {
                  const paragraphId = String(para.id);
                  const text = para.text ?? "";
                  const spanRanges: SpanRange[] = [...(ranges.get(paragraphId) ?? [])];
                  const isEvidenceParagraph =
                    locate?.paragraphId === paragraphId && Boolean(locate?.quote);
                  if (isEvidenceParagraph && locate?.quote) {
                    const found = findQuote(text, locate.quote);
                    if (found) spanRanges.push({ ...found, kind: "evidence" });
                  }
                  const spans = sliceSpans(text, spanRanges);
                  const note = notes[noteKey(passageId, paragraphId)];

                  return (
                    <div
                      key={paragraphId}
                      id={paragraphDomId(passageId, paragraphId)}
                      className={cn(
                        "flex gap-3 rounded-lg px-2 py-1 transition-colors",
                        flash === paragraphId && "bg-primary/10 ring-2 ring-primary/60",
                      )}
                    >
                      <div className="flex w-7 shrink-0 flex-col items-center gap-1 pt-0.5">
                        <span
                          aria-hidden="true"
                          className="text-[13px] font-bold tabular text-primary"
                        >
                          {paragraphId}
                        </span>
                        {toolsEnabled && (
                          <button
                            type="button"
                            onClick={(event) =>
                              openNote(
                                paragraphId,
                                (event.currentTarget as HTMLElement).getBoundingClientRect(),
                              )
                            }
                            aria-label={
                              note
                                ? `Edit your note on paragraph ${paragraphId}`
                                : `Add a note to paragraph ${paragraphId}`
                            }
                            className={cn(
                              "rounded-md p-1 transition-colors focus-visible:outline-none",
                              "focus-visible:ring-2 focus-visible:ring-ring",
                              note
                                ? "text-warning"
                                : "text-muted-foreground/40 hover:text-foreground",
                            )}
                          >
                            <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          data-paragraph-id={paragraphId}
                          data-text-id={block.id}
                          className="text-[14px] leading-[1.75] text-foreground"
                        >
                          {spans.map((span, index) => {
                            if (!span.highlight && !span.evidence) {
                              return <span key={index}>{span.text}</span>;
                            }
                            if (span.highlight && onRemoveHighlight && span.highlightId !== null) {
                              const highlightId = span.highlightId;
                              return (
                                <button
                                  key={index}
                                  type="button"
                                  title="Remove highlight"
                                  aria-label={`Remove highlight: ${span.text.slice(0, 40)}`}
                                  onClick={() => onRemoveHighlight(highlightId)}
                                  className={cn(
                                    "rounded-[3px] bg-warning/30 px-0 text-inherit underline-offset-2",
                                    "hover:bg-warning/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    span.evidence && "bg-primary/30",
                                  )}
                                >
                                  {span.text}
                                </button>
                              );
                            }
                            return (
                              <mark
                                key={index}
                                className={cn(
                                  "rounded-[3px] text-inherit",
                                  span.evidence ? "bg-primary/30" : "bg-warning/30",
                                )}
                              >
                                {span.text}
                              </mark>
                            );
                          })}
                        </p>
                        {note && (
                          <p className="mt-1.5 rounded-md border-l-2 border-warning bg-warning/10 px-2 py-1 text-[12px] text-foreground">
                            {note}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Selection mini-toolbar (06 §5) */}
      <Popover
        open={Boolean(selection) && (toolsEnabled || lookupEnabled)}
        anchor={selection?.rect ?? null}
        onClose={() => setSelection(null)}
        label="Selection tools"
        width={toolsEnabled ? 260 : 140}
      >
        <div className="flex items-center gap-1 p-1.5">
          {toolsEnabled && onAddHighlight && (
            <Button size="sm" variant="ghost" onClick={commitHighlight}>
              <Highlighter className="h-3.5 w-3.5" />
              Highlight
            </Button>
          )}
          {toolsEnabled && onSetNote && selection && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openNote(selection.paragraphId, selection.rect)}
            >
              <StickyNote className="h-3.5 w-3.5" />
              Note
            </Button>
          )}
          {lookupEnabled && (
            <Button size="sm" variant="ghost" onClick={openLookupFromSelection}>
              <Search className="h-3.5 w-3.5" />
              Look up
            </Button>
          )}
        </div>
      </Popover>

      {/* Note editor */}
      <Popover
        open={Boolean(noteTarget)}
        anchor={noteTarget?.rect ?? null}
        onClose={() => setNoteTarget(null)}
        label={`Note on paragraph ${noteTarget?.paragraphId ?? ""}`}
        title={`Note — paragraph ${noteTarget?.paragraphId ?? ""}`}
      >
        <div className="space-y-2 p-3">
          <Textarea
            value={noteDraft}
            autoFocus
            aria-label="Note text"
            placeholder="What does this paragraph actually claim?"
            onChange={(event) => setNoteDraft(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={!notes[noteKey(passageId, noteTarget?.paragraphId ?? "")]}
              onClick={() => {
                if (noteTarget) onSetNote?.(noteKey(passageId, noteTarget.paragraphId), "");
                setNoteTarget(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (noteTarget) onSetNote?.(noteKey(passageId, noteTarget.paragraphId), noteDraft);
                setNoteTarget(null);
              }}
            >
              Save note
            </Button>
          </div>
        </div>
      </Popover>

      {/* Dictionary popover */}
      <Popover
        open={Boolean(lookupAnchor)}
        anchor={lookupAnchor?.rect ?? null}
        onClose={closeAll}
        label={`Dictionary: ${dictionary.state.word}`}
        title="Dictionary"
        width={340}
      >
        <DictionaryCard
          state={dictionary.state}
          sentenceContext={lookupAnchor?.sentence ?? ""}
          passageId={passageId}
        />
      </Popover>
    </div>
  );
}

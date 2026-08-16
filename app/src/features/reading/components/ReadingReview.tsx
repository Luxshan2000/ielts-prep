import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, BookmarkPlus, Check, RotateCcw } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  Tabs,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import { passageIndexOf, questionDomId } from "../model";
import { errorText, useReadingStore } from "../store";
import { suggestVocab } from "../useDictionary";
import { PassagePane } from "./PassagePane";
import { ResultsSummary } from "./ResultsSummary";
import { ReviewQuestionRow } from "./ReviewQuestionRow";

type Filter = "all" | "wrong" | "flagged";

/** Words the learner looked up mid-test, offered to the vocabulary inbox. */
function LookedUpWords({ words, passageId }: { words: string[]; passageId: string | null }) {
  const [state, setState] = useState<Record<string, "idle" | "saving" | "added" | "error">>({});
  const [error, setError] = useState<string | null>(null);

  if (words.length === 0) return null;

  async function add(word: string) {
    setState((prev) => ({ ...prev, [word]: "saving" }));
    setError(null);
    try {
      await suggestVocab({
        term: word,
        sentenceContext: "",
        itemId: passageId,
        detail: "Looked up during a reading attempt",
      });
      setState((prev) => ({ ...prev, [word]: "added" }));
    } catch (err) {
      setState((prev) => ({ ...prev, [word]: "error" }));
      setError(errorText(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Words you looked up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-[13px] text-muted-foreground">
          Adding a word puts it in your vocabulary inbox; accepting it there starts the spaced
          review schedule.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {words.map((word) => {
            const status = state[word] ?? "idle";
            return (
              <Button
                key={word}
                size="sm"
                variant={status === "added" ? "secondary" : "outline"}
                loading={status === "saving"}
                disabled={status === "added"}
                onClick={() => void add(word)}
              >
                {status === "added" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <BookmarkPlus className="h-3.5 w-3.5" />
                )}
                {word}
              </Button>
            );
          })}
        </div>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Review mode and the results screen in one route (06 §6.1): the score record on
 * the right, the passage on the left, and "locate in passage" wiring the two
 * together so every wrong answer can be traced back to its evidence.
 */
export function ReadingReview() {
  const { attemptId = "" } = useParams();
  const navigate = useNavigate();

  const status = useReadingStore((s) => s.reviewStatus);
  const error = useReadingStore((s) => s.reviewError);
  const review = useReadingStore((s) => s.review);
  const passages = useReadingStore((s) => s.reviewPassages);
  const timeMs = useReadingStore((s) => s.reviewTimeMs);
  const lookedUp = useReadingStore((s) => s.reviewLookedUp);
  const whyWrong = useReadingStore((s) => s.whyWrong);
  const locate = useReadingStore((s) => s.locate);
  const loadReview = useReadingStore((s) => s.loadReview);
  const askWhyWrong = useReadingStore((s) => s.askWhyWrong);
  const setLocate = useReadingStore((s) => s.setLocate);

  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [activePassage, setActivePassage] = useState(0);

  useEffect(() => {
    if (attemptId) void loadReview(attemptId);
  }, [attemptId, loadReview]);

  // Follow a locate request into the passage that actually holds the evidence.
  useEffect(() => {
    if (!locate) return;
    setActivePassage(passageIndexOf(passages, locate.passageId));
  }, [locate, passages]);

  const questions = review?.per_question ?? [];
  const visible = useMemo(() => {
    if (filter === "wrong") return questions.filter((question) => !question.correct);
    if (filter === "flagged") return questions.filter((question) => question.flagged);
    return questions;
  }, [filter, questions]);

  const toggle = useCallback((number: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }, []);

  const jumpToQuestion = useCallback((number: number) => {
    setExpanded((prev) => new Set(prev).add(number));
    window.requestAnimationFrame(() => {
      document
        .getElementById(questionDomId(number))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  if (status === "loading" || status === "idle") {
    return (
      <PageShell
        title="Reading review"
        description="Loading your marked attempt…"
        back={{ to: "/reading", label: "Reading" }}
      >
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageShell>
    );
  }

  if (status === "error" || !review) {
    return (
      <PageShell
        title="Reading review"
        description="This attempt could not be reviewed."
        back={{ to: "/reading", label: "Reading" }}
      >
        <EmptyState
          icon={AlertTriangle}
          title="Review is not available"
          description={
            error ??
            "Review only exists once an attempt has been submitted. Start a fresh attempt from the reading library."
          }
          action={
            <Button variant="outline" onClick={() => void loadReview(attemptId)}>
              <RotateCcw className="h-4 w-4" />
              Try again
            </Button>
          }
        />
      </PageShell>
    );
  }

  const passage = passages[activePassage] ?? null;
  const wrongCount = questions.filter((question) => !question.correct).length;
  const flaggedCount = questions.filter((question) => question.flagged).length;

  const rightColumn = (
    <div className="space-y-4">
      <ResultsSummary
        record={review}
        timeMs={timeMs}
        onJumpToQuestion={jumpToQuestion}
        onDrillType={(qtype) => navigate(`/reading?tab=drills&qtype=${encodeURIComponent(qtype)}`)}
      />

      <LookedUpWords words={lookedUp} passageId={passage?.passage_id ?? passage?.id ?? null} />

      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Every question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          <Tabs
            aria-label="Filter questions"
            value={filter}
            onChange={(value) => setFilter(value as Filter)}
            items={[
              { value: "all", label: "All", badge: questions.length },
              { value: "wrong", label: "Wrong", badge: wrongCount },
              { value: "flagged", label: "Flagged", badge: flaggedCount },
            ]}
          />
          {visible.length === 0 ? (
            <EmptyState
              title={
                filter === "wrong"
                  ? "Nothing wrong in this attempt"
                  : "Nothing flagged in this attempt"
              }
              description={
                filter === "wrong"
                  ? "Every question was marked correct. Try a harder passage or a full timed test."
                  : "Flag questions during a test to come back to them here."
              }
            />
          ) : (
            <div className="space-y-2">
              {visible.map((question) => (
                <ReviewQuestionRow
                  key={question.number}
                  question={question}
                  expanded={expanded.has(question.number)}
                  onToggle={() => toggle(question.number)}
                  timeMs={timeMs[String(question.number)]}
                  why={whyWrong[question.number]}
                  onAskWhy={() => void askWhyWrong(question.number)}
                  canLocate={
                    passages.length > 0 &&
                    Boolean(question.locate?.paragraph_id || question.locate?.evidence_quote)
                  }
                  onLocate={() =>
                    setLocate({
                      passageId: question.locate.passage_id,
                      paragraphId: question.locate.paragraph_id,
                      quote: question.locate.evidence_quote,
                    })
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // Drills have no passage document, so they review in a single column.
  if (!passage) {
    return (
      <PageShell
        title="Reading review"
        description={`${review.raw_score} of ${review.total_questions} correct.`}
        back={{ to: "/reading", label: "Reading" }}
        >
        {rightColumn}
      </PageShell>
    );
  }

  return (
    <PageShell
      bleed
      maxWidth="max-w-none"
      title={`Review: ${passage.title}`}
      description='Select any word in the passage to look it up; use "Locate in passage" to jump to the evidence.'
      back={{ to: "/reading", label: "Reading" }}
      toolbar={
        passages.length > 1 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Passage</span>
            {passages.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={index === activePassage}
                aria-label={`Passage ${index + 1}: ${item.title}`}
                onClick={() => setActivePassage(index)}
                className={cn(
                  "h-7 w-7 rounded-md text-[13px] font-medium tabular transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  index === activePassage
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {index + 1}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <div className="min-h-0 border-b border-border lg:w-[45%] lg:border-b-0 lg:border-r">
          <PassagePane
            passage={passage}
            highlights={[]}
            notes={{}}
            toolsEnabled={false}
            lookupEnabled
            locate={
              locate && locate.passageId === (passage.passage_id ?? passage.id)
                ? {
                    paragraphId: locate.paragraphId,
                    quote: locate.quote,
                    nonce: locate.nonce,
                  }
                : null
            }
          />
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{rightColumn}</div>
      </div>
    </PageShell>
  );
}

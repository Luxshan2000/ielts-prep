/**
 * The prompt bank browser (05 §2): filter by task type, genre and difficulty,
 * search the instruction text, or ask the configured model for a fresh prompt.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BarChart3, Eye, RefreshCw, Search, Sparkles, Wand2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { useSessionStore } from "@/stores";
import {
  TASK_GENRES,
  TASK_LABELS,
  TASK_MINUTES,
  TASK_MIN_WORDS,
  TASK_SHORT,
  genreLabel,
  useWritingStore,
  type AttemptMode,
  type TaskType,
  type WritingPrompt,
} from "../store";
import { StartAttemptModal } from "./StartAttemptModal";

const TASK_OPTIONS = [
  { value: "all", label: "All task types" },
  { value: "ac_task1", label: TASK_LABELS.ac_task1 },
  { value: "gt_task1", label: TASK_LABELS.gt_task1 },
  { value: "task2", label: TASK_LABELS.task2 },
];

const DIFFICULTY_OPTIONS = [
  { value: "0", label: "Any difficulty" },
  { value: "1", label: "Easier" },
  { value: "2", label: "Standard" },
  { value: "3", label: "Harder" },
];

const DIFFICULTY_LABEL: Record<number, string> = { 1: "Easier", 2: "Standard", 3: "Harder" };

function PromptCard({
  prompt,
  onOpen,
}: {
  prompt: WritingPrompt;
  onOpen: (prompt: WritingPrompt) => void;
}) {
  const minWords = prompt.min_words ?? TASK_MIN_WORDS[prompt.task_type];
  const minutes = prompt.time_limit_s ? Math.round(prompt.time_limit_s / 60) : TASK_MINUTES[prompt.task_type];

  return (
    <Card className="flex flex-col transition-colors hover:border-primary/50">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{TASK_SHORT[prompt.task_type] ?? prompt.task_type}</Badge>
          <Badge tone="outline">{genreLabel(prompt.genre)}</Badge>
          <Badge tone="default">{DIFFICULTY_LABEL[prompt.difficulty] ?? `Level ${prompt.difficulty}`}</Badge>
          {prompt.chart_spec && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
              title={`Includes a ${prompt.chart_spec.kind.replace(/_/g, " ")} visual`}
            >
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
              visual
            </span>
          )}
          {prompt.source === "generated" && <Badge tone="warning">AI-generated</Badge>}
        </div>

        <p className="line-clamp-4 flex-1 text-[13.5px] leading-6 text-foreground">
          {prompt.prompt_text}
        </p>

        <p className="text-[12px] text-muted-foreground">
          Target <span className="tabular text-foreground">{minWords}+ words</span> · exam allowance{" "}
          <span className="tabular text-foreground">{minutes} min</span>
        </p>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button size="sm" onClick={() => onOpen(prompt)}>
            Start
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpen(prompt)}>
            <Eye className="h-3.5 w-3.5" />
            Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PromptBrowser() {
  const navigate = useNavigate();
  const offline = useSessionStore((s) => s.offline);

  const prompts = useWritingStore((s) => s.prompts);
  const loading = useWritingStore((s) => s.promptsLoading);
  const error = useWritingStore((s) => s.promptsError);
  const filters = useWritingStore((s) => s.filters);
  const setFilter = useWritingStore((s) => s.setFilter);
  const loadPrompts = useWritingStore((s) => s.loadPrompts);
  const createAttempt = useWritingStore((s) => s.createAttempt);
  const attemptError = useWritingStore((s) => s.attemptError);
  const generating = useWritingStore((s) => s.generating);
  const generateDetail = useWritingStore((s) => s.generateDetail);
  const generateError = useWritingStore((s) => s.generateError);
  const generatePrompt = useWritingStore((s) => s.generatePrompt);

  const [selected, setSelected] = useState<WritingPrompt | null>(null);
  const [starting, setStarting] = useState(false);
  const [query, setQuery] = useState(filters.q);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  // Debounced free-text search — one request per pause, not per keystroke.
  useEffect(() => {
    if (query === filters.q) return;
    const handle = window.setTimeout(() => setFilter("q", query), 350);
    return () => window.clearTimeout(handle);
  }, [query, filters.q, setFilter]);

  const genreOptions = useMemo(() => {
    const genres = filters.task_type === "all" ? [] : TASK_GENRES[filters.task_type as TaskType];
    return [
      { value: "all", label: filters.task_type === "all" ? "All patterns" : "All patterns" },
      ...genres.map((genre) => ({ value: genre, label: genreLabel(genre) })),
    ];
  }, [filters.task_type]);

  const onStart = async (mode: AttemptMode) => {
    if (!selected) return;
    setStarting(true);
    const attemptId = await createAttempt(selected.id, mode);
    setStarting(false);
    if (attemptId) {
      setSelected(null);
      navigate(`/writing/attempt/${attemptId}`);
    }
  };

  const onGenerate = async () => {
    const taskType: TaskType = filters.task_type === "all" ? "task2" : (filters.task_type as TaskType);
    await generatePrompt(taskType, filters.genre === "all" ? null : filters.genre);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the prompt text…"
            aria-label="Search writing prompts"
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Task type"
          value={filters.task_type}
          onChange={(value) => {
            setFilter("task_type", value as TaskType | "all");
          }}
          options={TASK_OPTIONS}
          className="w-[15rem]"
        />
        <Select
          aria-label="Pattern"
          value={filters.genre}
          onChange={(value) => setFilter("genre", value)}
          options={genreOptions}
          disabled={filters.task_type === "all"}
          className="w-[12rem]"
        />
        <Select
          aria-label="Difficulty"
          value={String(filters.difficulty)}
          onChange={(value) => setFilter("difficulty", Number(value))}
          options={DIFFICULTY_OPTIONS}
          className="w-[11rem]"
        />
        <Button
          variant="outline"
          loading={generating}
          disabled={offline}
          onClick={() => void onGenerate()}
          title={
            offline
              ? "The practice engine isn't responding"
              : "Ask your configured model for a brand-new prompt"
          }
        >
          <Sparkles className="h-4 w-4" />
          New prompt
        </Button>
      </div>

      {generating && generateDetail && (
        <p role="status" className="text-[12px] text-muted-foreground">
          Writing a new prompt: {generateDetail}
        </p>
      )}
      {generateError && (
        <p role="alert" className="text-[13px] text-destructive">
          {generateError}
        </p>
      )}

      {loading && prompts.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load the prompt bank"
          description={error}
          action={
            <Button variant="outline" onClick={() => void loadPrompts()}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          }
        />
      ) : prompts.length === 0 ? (
        <EmptyState
          icon={Wand2}
          title="No prompts match these filters"
          description={
            filters.q || filters.task_type !== "all" || filters.genre !== "all" || filters.difficulty
              ? "Clear the filters to see the whole bank, or generate a prompt with your configured model."
              : "The shipped prompt bank is empty in this build. Generate one with your configured model to start writing."
          }
          action={
            <Button
              variant="outline"
              loading={generating}
              disabled={offline}
              onClick={() => void onGenerate()}
            >
              <Sparkles className="h-4 w-4" />
              Generate a prompt
            </Button>
          }
        />
      ) : (
        <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
          {prompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} onOpen={setSelected} />
          ))}
        </div>
      )}

      <StartAttemptModal
        prompt={selected}
        starting={starting}
        error={attemptError}
        onClose={() => setSelected(null)}
        onStart={(mode) => void onStart(mode)}
      />
    </div>
  );
}

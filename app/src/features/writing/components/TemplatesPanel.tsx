/**
 * Templates and frameworks library (05 §9) — `GET /api/v1/writing/templates`.
 *
 * Snippets are NEVER auto-inserted into the editor: clicking copies to the
 * clipboard. The pedagogy is internalisation, and the evaluator already penalises
 * formulaic templating under Lexical Resource.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Library, RefreshCw } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useWritingStore, type WritingTemplate } from "../store";

const CATEGORY_LABEL: Record<string, string> = {
  all: "All",
  task2_skeleton: "Essay skeletons",
  letter_opening_closing: "Letter frames",
  t1_overview_language: "Task 1 overview language",
  cohesion_bank: "Linkers",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category.replace(/_/g, " ");
}

function TemplateCard({ template }: { template: WritingTemplate }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(template.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <CardTitle>{template.title}</CardTitle>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {categoryLabel(template.category)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void copy()} aria-label={`Copy ${template.title}`}>
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="scrollbar-thin overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 font-mono text-[12.5px] leading-6 text-foreground">
          {template.body}
        </pre>
        {template.teaching_note && (
          <p className="flex gap-2 text-[12.5px] leading-6 text-muted-foreground">
            <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            {template.teaching_note}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export interface TemplatesPanelProps {
  /** Single column inside the editor's phrase-help drawer. */
  dense?: boolean;
  className?: string;
}

export function TemplatesPanel({ dense = false, className }: TemplatesPanelProps) {
  const templates = useWritingStore((s) => s.templates);
  const loading = useWritingStore((s) => s.templatesLoading);
  const error = useWritingStore((s) => s.templatesError);
  const loadTemplates = useWritingStore((s) => s.loadTemplates);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const template of templates) if (!seen.includes(template.category)) seen.push(template.category);
    return seen;
  }, [templates]);

  const visible = useMemo(
    () => (category === "all" ? templates : templates.filter((t) => t.category === category)),
    [templates, category],
  );

  if (loading && templates.length === 0) {
    return (
      <div className={cn("space-y-3", className)}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load the templates library"
        description={error}
        action={
          <Button
            variant="outline"
            onClick={() => {
              useWritingStore.setState({ templates: [] });
              void loadTemplates();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        }
        className={className}
      />
    );
  }

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={Library}
        title="No templates in this build"
        description="The frameworks library ships with the app; reinstalling restores it."
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-[13px] leading-6 text-muted-foreground">
        Frameworks to internalise, not to paste. Copying a skeleton straight into an answer reads as
        templating and caps Coherence around band 6. Learn the shape, then write it in your own words.
      </p>
      {categories.length > 1 && (
        <Tabs
          aria-label="Template categories"
          value={category}
          onChange={setCategory}
          items={[
            { value: "all", label: CATEGORY_LABEL.all },
            ...categories.map((c) => ({ value: c, label: categoryLabel(c) })),
          ]}
        />
      )}
      <div className={cn("grid gap-3", dense ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2")}>
        {visible.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}

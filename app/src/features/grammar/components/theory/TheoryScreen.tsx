import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Clock, Search } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, SkeletonCard } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { levelLabel } from "../../labels";
import { ArticleBody, RichText, type Block } from "./ArticleBody";

/**
 * A CEFR code is a seat number to most people preparing for IELTS, so the words go
 * on the chip and the code stays only where somebody who knows it would look for
 * it — the title attribute.
 */
function LevelBadge({ level }: { level: string }) {
  const words = levelLabel(level);
  if (!words) return null;
  return (
    <Badge tone="outline" title={`Common European Framework level ${level}`}>
      {words}
    </Badge>
  );
}

// The api client takes a full path; every other feature spells out /api/v1 the same way.
const BASE = "/api/v1/theory";

/**
 * The Theory tab — the reference, browsable from a cold start.
 *
 * Practice teaches in bite-sized points sequenced for acquisition: a walking route. This is
 * the map. A learner who does not yet know what a modal *is* can read the whole shape of the
 * language here before being asked to practise any of it, which is the entire point — so
 * nothing on this screen is locked, and no article requires anything first.
 *
 * Two ways in, because that is how references are actually used: the chapter index for
 * reading through, and search for looking something up mid-question.
 */

interface ArticleSummary {
  id: string;
  chapter_id: string;
  sequence_index: number;
  title: string;
  cefr_level: string;
  also_called?: string | null;
  one_line?: string | null;
  estimated_read_minutes?: number | null;
}

interface Chapter {
  id: string;
  title: string;
  blurb?: string | null;
  articles: ArticleSummary[];
  count: number;
}

interface Article extends ArticleSummary {
  chapter_title: string;
  body: Block[];
  short_answer?: string | null;
  previous: ArticleSummary | null;
  next: ArticleSummary | null;
  position: { index: number; total: number };
}

export function TheoryScreen() {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [startHere, setStartHere] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ chapters: Chapter[]; start_here: string | null }>(`${BASE}/chapters`)
      .then((data) => {
        if (cancelled) return;
        setChapters(data.chapters);
        setStartHere(data.start_here);
      })
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorState error={error} title="The reference could not load" />;
  if (!chapters) return <SkeletonCard />;

  if (openId) {
    return <ArticleView id={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} />;
  }

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? chapters
        .map((c) => ({
          ...c,
          articles: c.articles.filter((a) =>
            [a.title, a.also_called, a.one_line]
              .filter(Boolean)
              .some((t) => String(t).toLowerCase().includes(needle)),
          ),
        }))
        .filter((c) => c.articles.length > 0)
    : chapters;

  const total = chapters.reduce((n, c) => n + c.count, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="The reference is still being written"
        description="Theory articles ship with the content pack. None have arrived in this build yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the reference — a tense, a word, a question"
            aria-label="Search the reference"
            className="pl-8"
          />
        </div>
        {startHere && !needle && (
          <Button onClick={() => setOpenId(startHere)}>
            <BookOpen className="h-4 w-4" />
            Start at the beginning
          </Button>
        )}
      </div>

      {needle && shown.length === 0 ? (
        <EmptyState
          icon={Search}
          title={`Nothing matches “${query}”`}
          description="Try the name you know it by — “past tense”, “the”, “if”."
        />
      ) : (
        shown.map((chapter) => (
          <section key={chapter.id} className="rounded-xl border border-border bg-card">
            <header className="border-b border-border px-4 py-3">
              <h2 className="text-[15px] font-semibold">
                <RichText text={chapter.title} />
              </h2>
              {chapter.blurb && (
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  <RichText text={chapter.blurb} />
                </p>
              )}
            </header>
            <ul className="divide-y divide-border">
              {chapter.articles.map((article) => (
                <li key={article.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(article.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors",
                      "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">
                        <RichText text={article.title} />
                      </span>
                      {article.one_line && (
                        <span className="mt-0.5 block text-[13px] text-muted-foreground">
                          <RichText text={article.one_line} />
                        </span>
                      )}
                      {article.also_called && (
                        <span className="mt-0.5 block text-[12px] text-muted-foreground">
                          also called <RichText text={article.also_called} />
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 pt-0.5">
                      {article.estimated_read_minutes ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {article.estimated_read_minutes} min
                        </span>
                      ) : null}
                      <LevelBadge level={article.cefr_level} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function ArticleView({
  id,
  onOpen,
  onClose,
}: {
  id: string;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setArticle(null);
    setError(null);
    api
      .get<Article>(`${BASE}/articles/${encodeURIComponent(id)}`)
      .then((data) => !cancelled && setArticle(data))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Moving between articles must start at the top, or the reader lands mid-paragraph.
  const go = useCallback(
    (next: string) => {
      onOpen(next);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    },
    [onOpen],
  );

  if (error) return <ErrorState error={error} title="That article could not load" />;
  if (!article) return <SkeletonCard />;

  return (
    <article className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          All chapters
        </Button>
        <span className="text-[12px] text-muted-foreground">
          {article.chapter_title} · {article.position.index} of {article.position.total}
        </span>
      </div>

      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            <RichText text={article.title} />
          </h1>
          <LevelBadge level={article.cefr_level} />
        </div>
        {article.also_called && (
          <p className="text-[13px] text-muted-foreground">
            also called <RichText text={article.also_called} />
          </p>
        )}
        {article.one_line && (
          <p className="text-[14px] text-foreground/90">
            <RichText text={article.one_line} />
          </p>
        )}
      </header>

      {article.short_answer && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            The short answer
          </p>
          <p className="mt-1 text-[14px] leading-relaxed">
            <RichText text={article.short_answer} />
          </p>
        </div>
      )}

      <ArticleBody body={article.body ?? []} />

      <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        {article.previous ? (
          <Button variant="outline" size="sm" onClick={() => go(article.previous!.id)}>
            <ArrowLeft className="h-4 w-4" />
            <span className="max-w-[16rem] truncate">
              <RichText text={article.previous.title} />
            </span>
          </Button>
        ) : (
          <span />
        )}
        {article.next && (
          <Button variant="outline" size="sm" onClick={() => go(article.next!.id)}>
            <span className="max-w-[16rem] truncate">
              <RichText text={article.next.title} />
            </span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </nav>
    </article>
  );
}

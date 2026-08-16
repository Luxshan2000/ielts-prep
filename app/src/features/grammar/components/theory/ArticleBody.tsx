import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, CornerDownRight, Eye, HelpCircle, Lightbulb, Scale, X } from "lucide-react";
import { Badge } from "@/components/ui";
import { QuickCheck } from "@/components/practice/QuickCheck";
import { cn } from "@/lib/cn";

/**
 * Renders one theory article's body.
 *
 * A reference is read two ways — straight through, and looked up mid-panic — so every block
 * has to be legible on its own. The block types are the authoring contract
 * (staging-theory/DESIGN-THEORY.md); an unknown one renders its text rather than vanishing,
 * because a silently dropped block is a hole the reader cannot even see.
 *
 * This file has twice been written against the template instead of the shipped articles, and
 * both times whole block types fell through `default` and rendered nothing at all. The rule
 * now: every field name here comes from content/core-en/data/theory.jsonl, and the audit in
 * __tests__/realArticles.test.tsx renders all 99 articles and fails if any block comes out
 * empty, or leaks authoring syntax, or prints an internal id.
 *
 * The other rule: authoring bookkeeping is never learner-facing. Rows carry a `weight`,
 * exception items carry a `kind` of "A"/"B"/"C", options carry a `point_id`. A person
 * preparing for IELTS has no idea what those mean, so they stay out of the page.
 *
 * `quick_check` is the one interactive block, and it is NOT gated: this is reference, not
 * assessment. The answer is one click away on purpose. (The practice module's gate — answers
 * withheld until a real attempt — is about practice items, and stays exactly as it is.)
 */

export interface Block {
  type?: string;
  kind?: string;
  [key: string]: unknown;
}

// Authors write example sentences as *emphasis* and terms as **bold**, which is how the
// reference reads on the page — and printed raw it shows the asterisks instead. The same
// defect the listening answer sheet had: authoring syntax is never learner-facing.
// Cross-references are written as a bare article id in brackets — [th_present_simple] — and
// five of the ids in the pack point at articles that do not exist, so these are never links:
// they become the topic name in words, which is still a usable pointer.
const TOKEN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\[th_[a-z0-9_]+\])/g;

/** `[th_present_simple]` → `present simple` — an id is not something a learner can read. */
function articleName(ref: string): string {
  return ref.slice(4, -1).replace(/_/g, " ");
}

/** Render a string with `**bold**`, `*italic*` and article references resolved. */
export function RichText({ text }: { text: string }) {
  if (!text.includes("*") && !text.includes("[th_")) return <>{text}</>;
  return (
    <>
      {text.split(TOKEN).map((chunk, i) => {
        if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
          return (
            <strong key={i} className="font-semibold">
              {chunk.slice(2, -2)}
            </strong>
          );
        }
        if (chunk.startsWith("[th_") && chunk.endsWith("]")) {
          return (
            <span key={i} className="font-medium">
              “{articleName(chunk)}”
            </span>
          );
        }
        if (chunk.startsWith("*") && chunk.endsWith("*") && chunk.length > 2) {
          return (
            <em key={i} className="italic">
              {chunk.slice(1, -1)}
            </em>
          );
        }
        return <span key={i}>{chunk}</span>;
      })}
    </>
  );
}

/** A wrong/right pair, shown together — the contrast is the teaching. */
function WrongRight({ wrong, right }: { wrong?: string; right?: string }) {
  if (!wrong && !right) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {wrong && (
        <p className="flex gap-2">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <span className="text-muted-foreground line-through decoration-destructive/50">
            <RichText text={wrong} />
          </span>
        </p>
      )}
      {right && (
        <p className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span className="font-medium">
            <RichText text={right} />
          </span>
        </p>
      )}
    </div>
  );
}

// `l1_note.lang` is an ISO code; a learner should see their language's name.
const LANGUAGES: Record<string, string> = {
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  ru: "Russian",
  si: "Sinhala",
  ta: "Tamil",
  th: "Thai",
  tr: "Turkish",
  ur: "Urdu",
  vi: "Vietnamese",
  zh: "Chinese",
};

// Every example in the pack is tagged with where it belongs. The reference promises the
// reader these labels by name ("Examples are labelled spoken, neutral or written"), so the
// tag is shown in those words and not in the pack's snake_case.
const REGISTERS: Record<string, string> = {
  spoken: "spoken",
  neutral: "neutral",
  written_formal: "formal writing",
  written: "writing",
  informal: "spoken",
  formal: "formal writing",
};

export function ArticleBody({ body }: { body: Block[] }) {
  return (
    <div className="space-y-5">
      {body.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  const type = String(block.type ?? block.kind ?? "");
  const str = (key: string): string => (typeof block[key] === "string" ? (block[key] as string) : "");
  const arr = (key: string): unknown[] => (Array.isArray(block[key]) ? (block[key] as unknown[]) : []);

  switch (type) {
    case "heading": {
      const level = Number(block.level ?? 2);
      const Tag = (level <= 2 ? "h2" : level === 3 ? "h3" : "h4") as "h2" | "h3" | "h4";
      // Headings carry emphasis too — *-s*, *the*, *be* — and printed raw the asterisks are
      // the loudest thing on the page. 220 of them across the pack.
      return (
        <Tag
          id={str("anchor") || undefined}
          className={cn(
            "scroll-mt-20 font-semibold tracking-tight",
            level <= 2 ? "pt-2 text-[17px]" : "text-[15px]",
          )}
        >
          <RichText text={str("text")} />
        </Tag>
      );
    }

    case "prose":
      return (
        <p className="text-[14px] leading-relaxed text-foreground/90">
          <RichText text={str("text")} />
        </p>
      );

    case "term_intro":
      return <TermIntro block={block} />;

    case "rule":
      return (
        <Callout tone="primary" icon={Lightbulb} label={str("label") || "The rule"}>
          <p className="font-medium">
            <RichText text={str("text") || str("rule")} />
          </p>
          {str("why") && (
            <p className="mt-1 text-muted-foreground">
              <RichText text={str("why")} />
            </p>
          )}
        </Callout>
      );

    case "warning":
      return (
        <Callout tone="warning" icon={AlertTriangle} label={str("label") || "Watch out"}>
          {str("text") && <p><RichText text={str("text")} /></p>}
          <WrongRight wrong={str("wrong")} right={str("right")} />
          {str("why_it_happens") && (
            <p className="mt-1.5 text-muted-foreground">
              <RichText text={str("why_it_happens")} />
            </p>
          )}
          {str("smallest_fix") && (
            <p className="mt-1">
              <span className="text-muted-foreground">The fix: </span>
              <RichText text={str("smallest_fix")} />
            </p>
          )}
        </Callout>
      );

    case "false_rule":
      return (
        <Callout tone="destructive" icon={X} label="You may have been taught this, but it is not true">
          <p className="text-muted-foreground line-through decoration-destructive/50">
            <RichText text={str("heard") || str("myth") || str("text")} />
          </p>
          {str("truth") && (
            <p className="mt-1.5 font-medium">
              <RichText text={str("truth")} />
            </p>
          )}
          {str("what_to_do") && (
            <p className="mt-1">
              <span className="text-muted-foreground">So: </span>
              <RichText text={str("what_to_do")} />
            </p>
          )}
        </Callout>
      );

    case "l1_note": {
      const lang = LANGUAGES[str("lang")] ?? str("language");
      return (
        <Callout
          tone="muted"
          icon={HelpCircle}
          label={lang ? `If your first language is ${lang}` : "A common first-language slip"}
        >
          {str("mechanism") && (
            <p>
              <RichText text={str("mechanism")} />
            </p>
          )}
          <WrongRight wrong={str("wrong")} right={str("right")} />
          {str("fix") && (
            <p className="mt-1.5">
              <span className="text-muted-foreground">The fix: </span>
              <RichText text={str("fix")} />
            </p>
          )}
        </Callout>
      );
    }

    case "summary": {
      // Authors write `headline` plus an optional recap `table`; `points` is almost always
      // null and `text` is never written at all. Reading only those two rendered an empty
      // green box at the end of nearly every article.
      const headline = str("headline") || str("text");
      const table = block.table as Block | undefined;
      return (
        <Callout tone="success" icon={Check} label={str("label") || "In short"}>
          {headline && (
            <p>
              <RichText text={headline} />
            </p>
          )}
          {arr("points").length > 0 && (
            <ul className="ml-4 list-disc space-y-1">
              {arr("points").map((p, i) => (
                <li key={i}>
                  <RichText text={String(p)} />
                </li>
              ))}
            </ul>
          )}
          {table && <TableBlock block={table} />}
        </Callout>
      );
    }

    case "examples":
      return <Examples block={block} />;

    case "list":
      return <ListBlock block={block} />;

    case "exceptions":
      return <Exceptions block={block} />;

    case "variation":
      return <Variation block={block} />;

    case "early_sighting":
      return <EarlySighting block={block} />;

    case "paradigm":
      return <Paradigm block={block} />;

    case "table":
      return <TableBlock block={block} />;

    case "contrast":
      return <Contrast block={block} />;

    case "decision_tree":
      return <DecisionTree block={block} />;

    // Diagrams arrive as {type: "visual", kind, caption, spec}; the kind picks the shape and
    // every field the shape needs lives inside `spec`. Dispatching on `type` alone dropped
    // all 35 of them. The bare `kind` cases keep the template's older spelling working.
    case "visual":
    case "two_box":
    case "timeline":
    case "slot_frame":
    case "cline":
    case "ladder":
    case "axis":
      return <VisualBlock block={block} />;

    case "quick_check": {
      const items = arr("items").map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          question: String(item.question ?? item.prompt ?? item.text ?? ""),
          answer: String(item.answer ?? ""),
          why: item.why == null ? null : String(item.why),
        };
      });
      // Authors write emphasis into these too, so they resolve the same way the prose does.
      return <QuickCheck items={items} renderText={(t) => <RichText text={t} />} />;
    }

    default:
      // Never drop a block: an unknown type still has text worth reading.
      return str("text") ? (
        <p className="text-[14px] leading-relaxed text-foreground/90">
          <RichText text={str("text")} />
        </p>
      ) : null;
  }
}

// ------------------------------------------------------------------- primitives ---

const TONES = {
  primary: "border-primary/30 bg-primary/5 text-foreground",
  warning: "border-warning/40 bg-warning/10 text-foreground",
  destructive: "border-destructive/30 bg-destructive/5 text-foreground",
  success: "border-success/30 bg-success/5 text-foreground",
  muted: "border-border bg-muted/40 text-foreground",
} as const;

const ICON_TONES = {
  primary: "text-primary",
  warning: "text-warning",
  destructive: "text-destructive",
  success: "text-success",
  muted: "text-muted-foreground",
} as const;

function Callout({
  tone,
  icon: Icon,
  label,
  children,
}: {
  tone: keyof typeof TONES;
  icon: typeof Lightbulb;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border p-3 text-[14px] leading-relaxed", TONES[tone])}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide">
        <Icon className={cn("h-3.5 w-3.5", ICON_TONES[tone])} aria-hidden="true" />
        <RichText text={label} />
      </p>
      {children}
    </div>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Highlights the marked spans inside an example, so the pattern is visible not described.
 *
 * Examples carry `marks: [{span, role}]` — usually two, because the teaching is the pair
 * (the doer *and* the verb). Reading a single `mark` string left 636 of them unhighlighted.
 */
function Marked({ text, mark, marks }: { text: string; mark?: string; marks?: string[] }) {
  const spans = [...(marks ?? []), ...(mark ? [mark] : [])].filter(
    (s) => s.length > 0 && text.includes(s),
  );
  if (spans.length === 0) return <RichText text={text} />;
  const wanted = new Set(spans);
  // Longest first, so a span that contains another still wins its own highlight.
  const pattern = [...wanted].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  return (
    <>
      {text.split(new RegExp(`(${pattern})`, "g")).map((chunk, i) =>
        wanted.has(chunk) ? (
          <mark key={i} className="rounded bg-primary/20 px-0.5 font-medium text-foreground">
            <RichText text={chunk} />
          </mark>
        ) : (
          <RichText key={i} text={chunk} />
        ),
      )}
    </>
  );
}

/** The small grey chip that says where a sentence belongs: spoken, neutral, formal writing. */
function RegisterTag({ register }: { register?: unknown }) {
  const label = typeof register === "string" ? (REGISTERS[register] ?? register.replace(/_/g, " ")) : "";
  if (!label) return null;
  return (
    <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}

function TermIntro({ block }: { block: Block }) {
  const term = String(block.term ?? "");
  const gloss = String(block.gloss ?? "");
  const alsoCalled = block.also_called ? String(block.also_called) : null;
  const first = Array.isArray(block.show_first) ? (block.show_first as Block[]) : [];
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-[15px] font-semibold">
          <RichText text={term} />
        </span>
        {alsoCalled && (
          <Badge tone="outline" className="text-[11px]">
            also called <RichText text={alsoCalled} />
          </Badge>
        )}
      </p>
      {gloss && (
        <p className="mt-0.5 text-[14px] text-muted-foreground">
          <RichText text={gloss} />
        </p>
      )}
      {first.length > 0 && (
        <ul className="mt-2 space-y-1">
          {first.map((ex, i) => (
            <li key={i} className="text-[14px] leading-relaxed">
              <Marked
                text={String(ex.text ?? "")}
                mark={ex.mark ? String(ex.mark) : undefined}
                marks={spansOf(ex.marks)}
              />
            </li>
          ))}
        </ul>
      )}
      {block.name_line != null && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          <RichText text={String(block.name_line)} />
        </p>
      )}
      {block.anchor_line != null && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          <RichText text={String(block.anchor_line)} />
        </p>
      )}
    </div>
  );
}

/** `marks: [{span, role}]` → the plain strings. `role` is authoring bookkeeping. */
function spansOf(marks: unknown): string[] {
  if (!Array.isArray(marks)) return [];
  return marks
    .map((m) => (m != null && typeof m === "object" ? String((m as Block).span ?? "") : String(m ?? "")))
    .filter(Boolean);
}

function Examples({ block }: { block: Block }) {
  const items = Array.isArray(block.items) ? (block.items as Block[]) : [];
  const label = block.label ? String(block.label) : null;
  // `dimension` names the one thing that changes down the list — "the joining word", "the
  // time" — which is the whole reason the examples are next to each other.
  const dimension = block.dimension != null ? String(block.dimension) : null;
  // `lead_in` sets the examples up and `so_what` draws the conclusion from them. Without
  // the pair the list is a run of unexplained sentences.
  const leadIn = block.lead_in != null ? String(block.lead_in) : null;
  const soWhat = block.so_what != null ? String(block.so_what) : null;
  return (
    <div className="space-y-1.5">
      {label && <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>}
      {leadIn && (
        <p className="text-[14px] leading-relaxed text-foreground/90">
          <RichText text={leadIn} />
        </p>
      )}
      {dimension && (
        <p className="text-[12px] text-muted-foreground">
          What changes down this list: <RichText text={dimension} />
        </p>
      )}
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const bad = item.correct === false || item.ok === false;
          return (
            <li key={i} className="flex gap-2 text-[14px] leading-relaxed">
              <span aria-hidden="true" className={cn("mt-0.5 shrink-0", bad ? "text-destructive" : "text-success")}>
                {bad ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <Marked
                  text={String(item.text ?? item.sentence ?? "")}
                  mark={item.mark ? String(item.mark) : undefined}
                  marks={spansOf(item.marks)}
                />
                <RegisterTag register={item.register} />
                {item.gloss != null && (
                  <span className="block text-[13px] text-muted-foreground">
                    <RichText text={String(item.gloss)} />
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {soWhat && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          <RichText text={soWhat} />
        </p>
      )}
    </div>
  );
}

function ListBlock({ block }: { block: Block }) {
  const items = Array.isArray(block.items) ? (block.items as unknown[]) : [];
  const leadIn = block.lead_in != null ? String(block.lead_in) : null;
  const numbered = String(block.style ?? "") === "number";
  const Tag = numbered ? "ol" : "ul";
  if (items.length === 0 && !leadIn) return null;
  return (
    <div className="space-y-1.5">
      {leadIn && (
        <p className="text-[14px] leading-relaxed text-foreground/90">
          <RichText text={leadIn} />
        </p>
      )}
      <Tag
        className={cn(
          "ml-5 space-y-1 text-[14px] leading-relaxed text-foreground/90",
          numbered ? "list-decimal" : "list-disc",
        )}
      >
        {items.map((item, i) => (
          <li key={i}>
            <RichText text={typeof item === "string" ? item : String((item as Block)?.text ?? "")} />
          </li>
        ))}
      </Tag>
    </div>
  );
}

/**
 * The exceptions to a rule, with an honest note on what to do about each one.
 *
 * `verdict` and `how_often` are written for the reader and shown. `kind` is "A"/"B"/"C" —
 * the authors' own bucket — and never appears.
 */
function Exceptions({ block }: { block: Block }) {
  const items = Array.isArray(block.items) ? (block.items as Block[]) : [];
  const stopLine = block.stop_line != null ? String(block.stop_line) : null;
  return (
    <Callout tone="muted" icon={Scale} label={String(block.label ?? "The exceptions")}>
      <ul className="mt-1 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="border-l-2 border-border pl-2.5">
            <p>
              <RichText text={String(item.text ?? "")} />
            </p>
            {item.example != null && (
              <p className="mt-0.5 text-[13px] italic text-foreground/80">
                <RichText text={String(item.example)} />
              </p>
            )}
            {(item.how_often != null || item.verdict != null) && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {[item.how_often, item.verdict].filter(Boolean).map(String).join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
      {stopLine && (
        <p className="mt-2 text-[13px]">
          <RichText text={stopLine} />
        </p>
      )}
    </Callout>
  );
}

/**
 * Two forms are both correct and this pack had to pick one.
 *
 * The learner's real question is "will this cost me marks?", so that answer is spelled out
 * instead of being left as the pack's own shorthand.
 */
const COSTS_MARKS: Record<string, string> = {
  no: "Neither one costs you marks. Pick one and keep to it.",
  yes: "This one can cost you marks.",
  "only if mixed": "It only costs marks if you mix the two in one piece of writing.",
};

function Variation({ block }: { block: Block }) {
  const a = (block.option_a ?? {}) as Block;
  const b = (block.option_b ?? {}) as Block;
  const costs = block.costs_marks != null ? String(block.costs_marks) : "";
  const costsLine = COSTS_MARKS[costs.toLowerCase()] ?? costs;
  return (
    <Callout tone="muted" icon={Scale} label="Both of these are correct English">
      {block.what_varies != null && (
        <p className="font-medium">
          <RichText text={String(block.what_varies)} />
        </p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {[a, b].map((option, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[13px] font-semibold">
              <RichText text={String(option.label ?? "")} />
            </p>
            {option.form != null && (
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                <RichText text={String(option.form)} />
              </p>
            )}
            {option.example != null && (
              <p className="mt-1 text-[13px] italic">
                <RichText text={String(option.example)} />
              </p>
            )}
          </div>
        ))}
      </div>
      {block.house_default != null && (
        <p className="mt-2 text-[13px]">
          <span className="text-muted-foreground">This app uses: </span>
          <RichText text={String(block.house_default)} />
        </p>
      )}
      {block.why_this_default != null && (
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          <RichText text={String(block.why_this_default)} />
        </p>
      )}
      {costsLine && (
        <p className="mt-1 text-[13px]">
          <span className="text-muted-foreground">In the exam: </span>
          <RichText text={costsLine} />
        </p>
      )}
    </Callout>
  );
}

/** A structure the reader is about to see before its own article explains it. */
function EarlySighting({ block }: { block: Block }) {
  return (
    <Callout tone="muted" icon={Eye} label="You will meet this again later">
      {block.term_or_structure != null && (
        <p className="font-medium">
          <RichText text={String(block.term_or_structure)} />
        </p>
      )}
      {block.one_line != null && (
        <p className="mt-0.5">
          <RichText text={String(block.one_line)} />
        </p>
      )}
    </Callout>
  );
}

/** Rows arrive either as a bare array of cells, or as `{cells, weight}`. */
function cellsOf(row: unknown): string[] {
  if (Array.isArray(row)) return row.map(String);
  if (row != null && typeof row === "object") {
    const cells = (row as Block).cells;
    if (Array.isArray(cells)) return cells.map(String);
    // Older drafts wrote a plain object per row; its values are the cells.
    return Object.values(row as object).map(String);
  }
  return [String(row ?? "")];
}

function TableBlock({ block }: { block: Block }) {
  const headers = (Array.isArray(block.headers) ? block.headers : []).map(String);
  const rawRows = Array.isArray(block.rows) ? (block.rows as unknown[]) : [];
  // `weight` marks how much a row matters and is not part of the table. Reading a row with
  // `Object.values` printed "high" as a visible extra column and collapsed the real cells
  // into one comma-separated blob.
  const rows = rawRows.map(cellsOf);
  const caption = block.caption ?? block.label ?? block.title;
  const footnotes = (Array.isArray(block.footnotes) ? block.footnotes : []).map(String);
  return (
    <figure className="space-y-1.5">
      {caption != null && (
        <figcaption className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          <RichText text={String(caption)} />
        </figcaption>
      )}
      {/* Paradigm tables are wide; the page must never scroll sideways because of one. */}
      <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-[13px]">
          {headers.length > 0 && (
            <thead>
              <tr className="bg-muted/60">
                {headers.map((cell, i) => (
                  <th key={i} scope="col" className="border-b border-border px-3 py-2 text-left font-semibold">
                    <RichText text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-border last:border-0">
                {row.map((cell, c) => (
                  <td key={c} className={cn("px-3 py-2 align-top", c === 0 && "font-medium")}>
                    <RichText text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnotes.length > 0 && (
        <ul className="space-y-0.5 text-[12px] text-muted-foreground">
          {footnotes.map((note, i) => (
            <li key={i}>
              <RichText text={note} />
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/**
 * A full form table: how the structure is built, the table itself, the odd shapes that sit
 * beside it, the holes in the pattern, worked examples and the notes.
 *
 * Everything but the table was being thrown away by rendering this as a plain table.
 */
function Paradigm({ block }: { block: Block }) {
  const subTables = Array.isArray(block.sub_tables) ? (block.sub_tables as Block[]) : [];
  const gaps = Array.isArray(block.gaps) ? (block.gaps as Block[]) : [];
  const notes = (Array.isArray(block.notes) ? block.notes : []).map(String);
  const examples = Array.isArray(block.examples) ? (block.examples as Block[]) : [];
  const models = (Array.isArray(block.model_verbs) ? block.model_verbs : []).map(String);
  return (
    <div className="space-y-3">
      {block.form_line != null && (
        <p className="text-[14px]">
          <span className="text-muted-foreground">How it is built: </span>
          <RichText text={String(block.form_line)} />
        </p>
      )}
      {models.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          The table uses {models.map((m) => `“${m}”`).join(" and ")} as its example verbs.
        </p>
      )}
      <TableBlock block={block} />
      {subTables.map((table, i) => (
        <TableBlock key={i} block={table} />
      ))}
      {gaps.length > 0 && (
        <ul className="space-y-1 text-[13px] text-muted-foreground">
          {gaps.map((gap, i) => (
            <li key={i}>
              <span className="font-medium text-foreground/90">
                <RichText text={String(gap.cell ?? "")} />:{" "}
              </span>
              <RichText text={String(gap.note ?? "")} />
            </li>
          ))}
        </ul>
      )}
      {examples.length > 0 && <Examples block={{ items: examples }} />}
      {notes.length > 0 && (
        <ul className="space-y-0.5 text-[13px] text-muted-foreground">
          {notes.map((note, i) => (
            <li key={i}>
              <RichText text={note} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Contrast({ block }: { block: Block }) {
  const options = Array.isArray(block.options) ? (block.options as Block[]) : [];
  const question = block.question ?? block.deciding_question;
  const pairs = Array.isArray(block.minimal_pairs) ? (block.minimal_pairs as Block[]) : [];
  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      {question != null && (
        <p className="text-[14px] font-medium">
          <span className="text-muted-foreground">Ask yourself: </span>
          <RichText text={String(question)} />
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[14px] font-semibold">
              <RichText text={String(option.label ?? option.form ?? "")} />
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              <RichText
                text={String(option.use_it_when ?? option.when ?? option.meaning ?? option.text ?? "")}
              />
            </p>
            {option.example != null && (
              <p className="mt-1.5 text-[13px] italic">
                <RichText text={String(option.example)} />
              </p>
            )}
          </div>
        ))}
      </div>
      {pairs.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            One word changes, and the meaning moves
          </p>
          {pairs.map((pair, i) => {
            // Authors write each side as {text, means, span}; older drafts wrote a bare
            // string. Reading only the string form printed "[object Object]" on the page
            // and dropped `only_difference`, which is the line that does the teaching.
            const side = (raw: unknown, markKey: string) => {
              if (raw != null && typeof raw === "object") {
                const s = raw as Record<string, unknown>;
                return {
                  text: String(s.text ?? ""),
                  mark: s.span != null ? String(s.span) : undefined,
                  means: s.means != null ? String(s.means) : null,
                };
              }
              const mark = (pair as Record<string, unknown>)[markKey];
              return {
                text: String(raw ?? ""),
                mark: mark != null ? String(mark) : undefined,
                means: null,
              };
            };
            const a = side(pair.a, "a_mark");
            const b = side(pair.b, "b_mark");
            const difference = pair.only_difference ?? pair.difference;
            return (
              <div key={i} className="rounded-lg bg-card p-2 text-[13px]">
                <p>
                  <Marked text={a.text} mark={a.mark} />
                </p>
                {a.means && (
                  <p className="text-muted-foreground">
                    <RichText text={a.means} />
                  </p>
                )}
                <p className="mt-0.5">
                  <Marked text={b.text} mark={b.mark} />
                </p>
                {b.means && (
                  <p className="text-muted-foreground">
                    <RichText text={b.means} />
                  </p>
                )}
                {difference != null && (
                  <p className="mt-1 text-muted-foreground">
                    Only difference: <RichText text={String(difference)} />
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {block.deciding_factor != null && (
        <p className="pt-1 text-[13px] text-foreground/90">
          <span className="text-muted-foreground">How to decide: </span>
          <RichText text={String(block.deciding_factor)} />
        </p>
      )}
      {block.trap != null && (
        <p className="text-[13px] text-foreground/90">
          <span className="text-muted-foreground">Why it catches people out: </span>
          <RichText text={String(block.trap)} />
        </p>
      )}
      {block.register_note != null && (
        <p className="text-[13px] text-muted-foreground">
          <RichText text={String(block.register_note)} />
        </p>
      )}
    </div>
  );
}

/**
 * Ask a question, follow the answer.
 *
 * Each step's answers live in `branches`, and each branch either ends in a `verdict` (use
 * this form, here is a sentence, here is why) or sends the reader to another step. Reading
 * `yes`/`no` off the step found neither, so all thirteen trees rendered as a list of
 * questions with no answers under them — the one shape where a missing half is invisible.
 */
function DecisionTree({ block }: { block: Block }) {
  const steps = Array.isArray(block.steps) ? (block.steps as Block[]) : [];
  const numberOf = new Map(steps.map((step, i) => [String(step.id ?? ""), i + 1]));
  return (
    <div className="space-y-2">
      {block.intro != null && (
        <p className="text-[14px] leading-relaxed text-foreground/90">
          <RichText text={String(block.intro)} />
        </p>
      )}
      <ol className="space-y-2">
        {steps.map((step, i) => {
          const branches = Array.isArray(step.branches) ? (step.branches as Block[]) : [];
          const legacy = [
            step.yes != null ? { answer: "Yes", verdict: { use: String(step.yes) } } : null,
            step.no != null ? { answer: "No", verdict: { use: String(step.no) } } : null,
          ].filter(Boolean) as Block[];
          const shown = branches.length > 0 ? branches : legacy;
          return (
            <li key={i} className="flex gap-2.5 rounded-xl border border-border bg-card p-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 text-[14px] leading-relaxed">
                <p className="font-medium">
                  <RichText text={String(step.question ?? step.ask ?? step.text ?? "")} />
                </p>
                <div className="mt-1 space-y-1.5">
                  {shown.map((branch, b) => {
                    const verdict = (branch.verdict ?? {}) as Block;
                    const goto = branch.goto != null ? numberOf.get(String(branch.goto)) : undefined;
                    return (
                      <div key={b} className="flex gap-1.5 text-[13px]">
                        <CornerDownRight
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold">
                            <RichText text={String(branch.answer ?? "")} />
                          </span>
                          {goto ? (
                            <span className="text-muted-foreground">: go to question {goto}.</span>
                          ) : (
                            <>
                              {verdict.use != null && (
                                <span>
                                  : use <RichText text={String(verdict.use)} />.
                                </span>
                              )}
                              {verdict.example != null && (
                                <span className="block italic">
                                  <RichText text={String(verdict.example)} />
                                </span>
                              )}
                              {verdict.why != null && (
                                <span className="block text-muted-foreground">
                                  <RichText text={String(verdict.why)} />
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------- visuals ---

/**
 * A diagram. `kind` picks the shape, `spec` holds it, `caption` says what it shows.
 *
 * Each shape falls back to a plain labelled list if its spec is not the expected one: a
 * diagram that cannot be drawn still has words in it, and words are what the reader needs.
 */
function VisualBlock({ block }: { block: Block }) {
  const kind = String(block.kind ?? block.type ?? "");
  const spec = ((block.spec ?? block) as Block) ?? {};
  const caption = block.caption ?? spec.caption;
  let figure: ReactNode = null;

  switch (kind) {
    case "two_box":
      figure = <TwoBox spec={spec} />;
      break;
    case "slot_frame":
      figure = <SlotFrame spec={spec} />;
      break;
    case "timeline":
      figure = <TimelineFigure spec={spec} />;
      break;
    case "cline":
      figure = <Cline spec={spec} />;
      break;
    case "ladder":
      figure = <Ladder spec={spec} />;
      break;
    case "axis":
      figure = <Axis spec={spec} />;
      break;
    default:
      figure = null;
  }

  if (!figure && caption == null) return null;
  return (
    <figure className="space-y-1.5">
      {figure}
      {caption != null && (
        <figcaption className="text-[13px] text-muted-foreground">
          <RichText text={String(caption)} />
        </figcaption>
      )}
    </figure>
  );
}

function TwoBox({ spec }: { spec: Block }) {
  const left = (spec.left ?? {}) as Block;
  const right = (spec.right ?? {}) as Block;
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      {[left, right].map((box, i) => (
        <div key={i} className="flex-1 rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {String(box.role ?? box.label ?? "")}
          </p>
          <p className="mt-1 text-[14px] font-medium">
            <RichText text={String(box.text ?? box.filler ?? "")} />
          </p>
        </div>
      ))}
    </div>
  );
}

function SlotFrame({ spec }: { spec: Block }) {
  const slots = Array.isArray(spec.slots) ? (spec.slots as Block[]) : [];
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {slots.map((slot, i) => (
        <div
          key={i}
          className="min-w-[6rem] flex-1 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2 text-center"
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {String(slot.role ?? slot.label ?? "")}
          </p>
          <p className="mt-0.5 text-[14px] font-medium">
            <RichText text={String(slot.filler ?? slot.text ?? slot.example ?? "")} />
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * A time line: a track with now marked on it, and every mark named underneath.
 *
 * The names go in a legend rather than on the track, because two labels at neighbouring
 * positions overlap into mush on a narrow window, and the words are the part that teaches.
 */
function TimelineFigure({ spec }: { spec: Block }) {
  const marks = Array.isArray(spec.marks) ? (spec.marks as Block[]) : [];
  if (marks.length === 0) return null;
  const values = marks.flatMap((m) => [Number(m.at ?? 0), Number(m.span_to ?? m.at ?? 0)]).concat(0);
  const low = Math.min(...values) - 1;
  const high = Math.max(...values) + 1;
  const at = (v: number) => ((v - low) / (high - low || 1)) * 100;
  const nowLabel = spec.now_label != null ? String(spec.now_label) : "now";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-4 h-0.5 bg-border" aria-hidden="true" />
        <div
          className="absolute top-1 h-7 w-px bg-foreground/50"
          style={{ left: `${at(0)}%` }}
          aria-hidden="true"
        />
        <span
          className="absolute top-0 -translate-x-1/2 text-[10px] uppercase tracking-wide text-muted-foreground"
          style={{ left: `${at(0)}%` }}
        >
          {nowLabel}
        </span>
        {marks.map((mark, i) => {
          const from = Number(mark.at ?? 0);
          const to = mark.span_to != null ? Number(mark.span_to) : from;
          const style = String(mark.style ?? "point");
          const left = at(Math.min(from, to));
          const width = Math.abs(at(to) - at(from));
          if (style === "bar" || style === "arrow") {
            return (
              <div
                key={i}
                className={cn(
                  "absolute top-[13px] h-2 rounded-full bg-primary/70",
                  style === "arrow" && "bg-primary/40",
                )}
                style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                aria-hidden="true"
              />
            );
          }
          return (
            <span
              key={i}
              className={cn(
                "absolute top-3 -translate-x-1/2 text-[12px] font-semibold leading-none",
                style === "x" ? "text-destructive" : "text-primary",
              )}
              style={{ left: `${at(from)}%` }}
              aria-hidden="true"
            >
              {style === "x" ? "✕" : "●"}
            </span>
          );
        })}
      </div>
      <ul className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
        {marks.map((mark, i) => (
          <li key={i}>
            <RichText text={String(mark.label ?? "")} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A scale from one extreme to the other — how sure, how often, how strong. */
function Cline({ spec }: { spec: Block }) {
  const steps = Array.isArray(spec.steps) ? (spec.steps as Block[]) : [];
  if (steps.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      {spec.label != null && (
        <p className="mb-1.5 text-[13px] font-semibold">
          <RichText text={String(spec.label)} />
        </p>
      )}
      <ol className="space-y-1 border-l-2 border-primary/40 pl-3">
        {steps.map((step, i) => (
          <li key={i} className="text-[14px] leading-relaxed">
            <span className="font-medium">
              <RichText text={String(step.text ?? "")} />
            </span>
            {step.gloss != null && (
              <span className="text-muted-foreground">: <RichText text={String(step.gloss)} /></span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The same thing said at rising formality, bottom rung first. */
function Ladder({ spec }: { spec: Block }) {
  const rungs = Array.isArray(spec.rungs) ? (spec.rungs as Block[]) : [];
  if (rungs.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      {spec.bottom_label != null && (
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {String(spec.bottom_label)}
        </p>
      )}
      <ol className="my-1 space-y-1 border-l-2 border-primary/40 pl-3">
        {rungs.map((rung, i) => (
          <li key={i} className="text-[14px] leading-relaxed">
            <RichText text={String(rung.text ?? "")} />
            <RegisterTag register={rung.register} />
          </li>
        ))}
      </ol>
      {spec.top_label != null && (
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {String(spec.top_label)}
        </p>
      )}
    </div>
  );
}

/** A line between two opposites, with the examples placed along it. */
function Axis({ spec }: { spec: Block }) {
  const ends = (Array.isArray(spec.ends) ? spec.ends : []).map(String);
  const marks = Array.isArray(spec.marks) ? (spec.marks as Block[]) : [];
  if (ends.length === 0 && marks.length === 0) return null;
  const positions = marks.map((m) => Number(m.pos ?? 0));
  const low = Math.min(0, ...positions);
  const high = Math.max(10, ...positions);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{ends[0] ?? ""}</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{ends[1] ?? ""}</span>
      </div>
      <div className="relative mt-1.5 h-3" aria-hidden="true">
        <div className="absolute inset-x-0 top-1.5 h-0.5 bg-border" />
        {marks.map((mark, i) => (
          <span
            key={i}
            className="absolute top-0 -translate-x-1/2 text-[12px] leading-none text-primary"
            style={{ left: `${((Number(mark.pos ?? 0) - low) / (high - low || 1)) * 100}%` }}
          >
            ●
          </span>
        ))}
      </div>
      <ul className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
        {marks.map((mark, i) => (
          <li key={i}>
            <RichText text={String(mark.label ?? "")} />
          </li>
        ))}
      </ul>
    </div>
  );
}

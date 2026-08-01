import { useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, HelpCircle, Lightbulb, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Renders one theory article's body.
 *
 * A reference is read two ways — straight through, and looked up mid-panic — so every block
 * has to be legible on its own. The block types are the authoring contract
 * (staging-theory/DESIGN-THEORY.md); an unknown one renders its text rather than vanishing,
 * because a silently dropped block is a hole the reader cannot even see.
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

//: Authors write example sentences as *emphasis* and terms as **bold**, which is how the
//: reference reads on the page — and printed raw it shows the asterisks instead. The same
//: defect the listening answer sheet had: authoring syntax is never learner-facing.
const EMPHASIS = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

/** Render a string with `**bold**` and `*italic*` resolved rather than printed. */
function RichText({ text }: { text: string }) {
  if (!text.includes("*")) return <>{text}</>;
  return (
    <>
      {text.split(EMPHASIS).map((chunk, i) => {
        if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
          return (
            <strong key={i} className="font-semibold">
              {chunk.slice(2, -2)}
            </strong>
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

//: `l1_note.lang` is an ISO code; a learner should see their language's name.
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
      return (
        <Tag
          id={str("anchor") || undefined}
          className={cn(
            "scroll-mt-20 font-semibold tracking-tight",
            level <= 2 ? "pt-2 text-[17px]" : "text-[15px]",
          )}
        >
          {str("text")}
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
        <Callout tone="destructive" icon={X} label="You may have been taught this — it is not true">
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

    case "summary":
      return (
        <Callout tone="success" icon={Check} label={str("label") || "In short"}>
          {arr("points").length > 0 ? (
            <ul className="ml-4 list-disc space-y-1">
              {arr("points").map((p, i) => (
                <li key={i}>
                  <RichText text={String(p)} />
                </li>
              ))}
            </ul>
          ) : (
            <p>
              <RichText text={str("text")} />
            </p>
          )}
        </Callout>
      );

    case "examples":
      return <Examples block={block} />;

    case "paradigm":
    case "table":
      return <TableBlock block={block} />;

    case "contrast":
      return <Contrast block={block} />;

    case "two_box":
      return <TwoBox block={block} />;

    case "decision_tree":
      return <DecisionTree block={block} />;

    case "timeline":
      return <Timeline block={block} />;

    case "slot_frame":
      return <SlotFrame block={block} />;

    case "bre_ame":
      return <BreAme block={block} />;

    case "quick_check":
      return <QuickCheck block={block} />;

    default:
      // Never drop a block: an unknown type still has text worth reading.
      return str("text") ? (
        <p className="text-[14px] leading-relaxed text-foreground/90">{str("text")}</p>
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
        {label}
      </p>
      {children}
    </div>
  );
}

/** Highlights the marked span inside an example, so the pattern is visible not described. */
function Marked({ text, mark }: { text: string; mark?: string }) {
  if (!mark || !text.includes(mark)) return <RichText text={text} />;
  const at = text.indexOf(mark);
  return (
    <>
      <RichText text={text.slice(0, at)} />
      <mark className="rounded bg-primary/20 px-0.5 font-medium text-foreground">
        <RichText text={mark} />
      </mark>
      <RichText text={text.slice(at + mark.length)} />
    </>
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
        <span className="text-[15px] font-semibold">{term}</span>
        {alsoCalled && (
          <Badge tone="outline" className="text-[11px]">
            also called {alsoCalled}
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
              <Marked text={String(ex.text ?? "")} mark={ex.mark ? String(ex.mark) : undefined} />
            </li>
          ))}
        </ul>
      )}
      {block.name_line != null && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          <RichText text={String(block.name_line)} />
        </p>
      )}
    </div>
  );
}

function Examples({ block }: { block: Block }) {
  const items = Array.isArray(block.items) ? (block.items as Block[]) : [];
  const label = block.label ? String(block.label) : null;
  return (
    <div className="space-y-1.5">
      {label && <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>}
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
                />
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
    </div>
  );
}

function TableBlock({ block }: { block: Block }) {
  const headers = (Array.isArray(block.headers) ? block.headers : []).map(String);
  const rawRows = Array.isArray(block.rows) ? (block.rows as unknown[]) : [];
  const rows = rawRows.map((row) =>
    Array.isArray(row) ? row.map(String) : Object.values(row as object).map(String),
  );
  const caption = block.caption ?? block.label ?? block.title;
  return (
    <figure className="space-y-1.5">
      {caption != null && (
        <figcaption className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {String(caption)}
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
                    {cell}
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
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
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
          {String(question)}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[14px] font-semibold">{String(option.label ?? option.form ?? "")}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {String(option.when ?? option.meaning ?? option.text ?? "")}
            </p>
            {option.example != null && (
              <p className="mt-1.5 text-[13px] italic">{String(option.example)}</p>
            )}
          </div>
        ))}
      </div>
      {pairs.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            One word changes, and the meaning moves
          </p>
          {pairs.map((pair, i) => (
            <div key={i} className="rounded-lg bg-card p-2 text-[13px]">
              <p>
                <Marked text={String(pair.a ?? "")} mark={pair.a_mark ? String(pair.a_mark) : undefined} />
              </p>
              <p className="mt-0.5">
                <Marked text={String(pair.b ?? "")} mark={pair.b_mark ? String(pair.b_mark) : undefined} />
              </p>
              {pair.difference != null && (
                <p className="mt-1 text-muted-foreground">{String(pair.difference)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TwoBox({ block }: { block: Block }) {
  const spec = (block.spec ?? block) as Block;
  const left = (spec.left ?? {}) as Block;
  const right = (spec.right ?? {}) as Block;
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      {[left, right].map((box, i) => (
        <div key={i} className="flex-1 rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {String(box.role ?? "")}
          </p>
          <p className="mt-1 text-[14px] font-medium">{String(box.text ?? "")}</p>
        </div>
      ))}
    </div>
  );
}

function DecisionTree({ block }: { block: Block }) {
  const steps = Array.isArray(block.steps) ? (block.steps as Block[]) : [];
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-2.5 rounded-xl border border-border bg-card p-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {i + 1}
          </span>
          <div className="min-w-0 text-[14px] leading-relaxed">
            <p className="font-medium">{String(step.question ?? step.ask ?? step.text ?? "")}</p>
            {step.yes != null && (
              <p className="mt-0.5 flex gap-1.5 text-[13px]">
                <span className="font-semibold text-success">Yes</span>
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                {String(step.yes)}
              </p>
            )}
            {step.no != null && (
              <p className="mt-0.5 flex gap-1.5 text-[13px]">
                <span className="font-semibold text-destructive">No</span>
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                {String(step.no)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Timeline({ block }: { block: Block }) {
  const points = Array.isArray(block.points) ? (block.points as Block[]) : [];
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      {block.caption != null && (
        <p className="mb-2 text-[13px] text-muted-foreground">{String(block.caption)}</p>
      )}
      <div className="relative flex items-start justify-between gap-2 border-t-2 border-border pt-3">
        {points.map((point, i) => (
          <div key={i} className="relative flex-1 text-center">
            <span
              className="absolute -top-[19px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary"
              aria-hidden="true"
            />
            <p className="text-[12px] font-medium">{String(point.label ?? "")}</p>
            {point.text != null && (
              <p className="text-[12px] text-muted-foreground">{String(point.text)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotFrame({ block }: { block: Block }) {
  const slots = Array.isArray(block.slots) ? (block.slots as Block[]) : [];
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {slots.map((slot, i) => (
        <div key={i} className="min-w-[6rem] flex-1 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2 text-center">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {String(slot.role ?? slot.label ?? "")}
          </p>
          <p className="mt-0.5 text-[14px] font-medium">{String(slot.text ?? slot.example ?? "")}</p>
        </div>
      ))}
    </div>
  );
}

function BreAme({ block }: { block: Block }) {
  const bre = String(block.british ?? block.bre ?? "");
  const ame = String(block.american ?? block.ame ?? "");
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 text-[14px]">
      <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        British and American differ here
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <p>
          <span className="font-semibold">British: </span>
          {bre}
        </p>
        <p>
          <span className="font-semibold">American: </span>
          {ame}
        </p>
      </div>
      {block.note != null && (
        <p className="mt-1.5 text-[13px] text-muted-foreground">{String(block.note)}</p>
      )}
    </div>
  );
}

/**
 * Two self-test items with their answers a click away.
 *
 * Deliberately not gated. Theory is reference: someone checking whether they understood a
 * paradigm should not have to prove anything to see the answer.
 */
function QuickCheck({ block }: { block: Block }) {
  const items = Array.isArray(block.items) ? (block.items as Block[]) : [];
  const [shown, setShown] = useState<Record<number, boolean>>({});

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Check yourself
      </p>
      <ol className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="text-[14px] leading-relaxed">
            <p>{String(item.question ?? item.prompt ?? item.text ?? "")}</p>
            {shown[i] ? (
              <div className="mt-1 rounded-lg bg-success/10 p-2">
                <p className="font-medium">{String(item.answer ?? "")}</p>
                {item.why != null && (
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{String(item.why)}</p>
                )}
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-7 px-2 text-[13px]"
                onClick={() => setShown((s) => ({ ...s, [i]: true }))}
              >
                Show the answer
              </Button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

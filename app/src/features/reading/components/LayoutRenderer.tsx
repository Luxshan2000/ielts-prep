import { useEffect, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { splitGaps } from "../qtypes";
import type { QuestionLayout } from "../types";

export type GapRenderer = (number: number | null, ordinal: number) => ReactNode;

/**
 * Resolve a pack-relative asset (`assets/foo.svg`) to a ticket-signed media URL.
 * Absolute and data URLs pass straight through. `null` while resolving.
 */
function usePackImage(path: string | null | undefined): {
  src: string | null;
  failed: boolean;
  markFailed: () => void;
} {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const raw = (path ?? "").trim();
    setSrc(null);
    setFailed(false);
    if (!raw) return;
    if (/^(https?:|data:|file:)/i.test(raw)) {
      setSrc(raw);
      return;
    }
    let alive = true;
    const rel = raw.replace(/^\/+/, "");
    api
      .mediaUrl(`/api/v1/media/packs/${rel}`)
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  return { src, failed, markFailed: () => setFailed(true) };
}

/** Split one skeleton string into text runs and gap controls. */
function Line({
  source,
  renderGap,
  counter,
}: {
  source: string;
  renderGap: GapRenderer;
  counter: { value: number };
}) {
  return (
    <>
      {splitGaps(source).map((token, index) => {
        if (token.kind === "text") {
          return <span key={index}>{token.value}</span>;
        }
        const ordinal = counter.value;
        counter.value += 1;
        return <span key={index}>{renderGap(token.number, ordinal)}</span>;
      })}
    </>
  );
}

export interface LayoutRendererProps {
  layout: QuestionLayout | null | undefined;
  /** Used when the group ships its skeleton as a plain string instead. */
  fallbackText?: string | null;
  renderGap: GapRenderer;
  /** Rendered when the layout carries no gaps at all. */
  children?: ReactNode;
}

/**
 * Renders the 06 §3 `layout` skeletons — note, table, flow chart, form, summary
 * and diagram — inlining an answer control at each `{{n}}` marker. Anything it
 * does not recognise degrades to the paragraph/line form, and a diagram whose
 * image cannot be served still exposes every numbered gap.
 */
export function LayoutRenderer({
  layout,
  fallbackText,
  renderGap,
  children,
}: LayoutRendererProps) {
  const counter = { value: 0 };
  const kind = (layout?.kind ?? "").toLowerCase();
  const { src, failed, markFailed } = usePackImage(
    kind === "diagram" || kind === "map" ? layout?.image : null,
  );

  if (kind === "table" && layout?.rows?.length) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-[13px]">
          {layout.columns?.length ? (
            <thead>
              <tr className="bg-muted/60">
                {layout.columns.map((column, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="border-b border-border px-3 py-2 text-left font-semibold"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {layout.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 align-middle">
                    <Line source={String(cell ?? "")} renderGap={renderGap} counter={counter} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (kind === "flow_chart" && layout?.steps?.length) {
    return (
      <ol className="space-y-1">
        {layout.steps.map((step, index) => (
          <li key={index}>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] leading-relaxed">
              <Line source={String(step ?? "")} renderGap={renderGap} counter={counter} />
            </div>
            {index < (layout.steps?.length ?? 0) - 1 && (
              <div className="flex justify-center py-0.5" aria-hidden="true">
                <span className="text-muted-foreground">↓</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    );
  }

  if ((kind === "diagram" || kind === "map") && (layout?.labels?.length || layout?.image)) {
    const labels = layout?.labels ?? [];
    return (
      <div className="space-y-3">
        {layout?.image && !failed && src && (
          <div className="relative overflow-hidden rounded-lg border border-border bg-background">
            <img
              src={src}
              alt={layout.alt ?? "Diagram to label"}
              className="block w-full"
              onError={markFailed}
            />
            {labels.map((label) => (
              <span
                key={label.number}
                // Authored coordinates are already 0-100 (DESIGN §diagram: "0-100
                // viewBox coordinates"), so they map straight to percentages. An
                // earlier version multiplied by 100 on the assumption they were
                // fractions, which put every callout at 5000% — invisible until the
                // bank actually contained a diagram to render.
                style={{ left: `${label.x}%`, top: `${label.y}%` }}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-primary",
                  "bg-background/95 px-1.5 py-0.5 text-[11px] font-semibold tabular text-primary",
                )}
              >
                {label.number}
              </span>
            ))}
          </div>
        )}
        {layout?.image && failed && (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            The diagram image is not available offline. Answer using the numbered gaps below.
          </p>
        )}
        <div className="space-y-2">
          {labels.map((label) => (
            <div key={label.number} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-[13px] font-semibold tabular">{label.number}</span>
              {renderGap(label.number, counter.value++)}
            </div>
          ))}
        </div>
        {labels.length === 0 && children}
      </div>
    );
  }

  const lines =
    layout?.lines?.length
      ? layout.lines
      : String(layout?.text ?? fallbackText ?? "")
          .split(/\n+/)
          .filter((line) => line.trim().length > 0);

  if (lines.length > 0) {
    return (
      <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-[13px] leading-relaxed">
        {layout?.title && <p className="font-semibold">{layout.title}</p>}
        {lines.map((line, index) => (
          <p key={index}>
            <Line source={String(line)} renderGap={renderGap} counter={counter} />
          </p>
        ))}
      </div>
    );
  }

  return <>{children}</>;
}

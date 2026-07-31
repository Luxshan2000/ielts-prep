/**
 * The five diagrams (DESIGN §2.3.1).
 *
 * The content owns the data and the renderer owns the drawing — the pack ships
 * `{kind, spec}` and never an SVG, an image or a unicode picture, so a diagram
 * can be restyled, made dark-mode-correct and made accessible in one place.
 *
 * All five are CSS, not canvas: they have to survive a theme switch, a font-size
 * change and a screen reader, and each one carries a text caption that says the
 * same thing the picture does. An unknown `kind`, or a spec missing the fields
 * its kind needs, renders nothing at all rather than a broken box.
 */

import type { ReactElement } from "react";
import { cn } from "@/lib/cn";
import type { Visual as VisualPayload } from "../types";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Abstract −10..+10 positions map onto 0–100% of the track. */
function pct(at: number): number {
  return Math.max(0, Math.min(100, ((at + 10) / 20) * 100));
}

function Caption({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{text}</p>;
}

// ------------------------------------------------------------- timeline ----

function Timeline({ spec }: { spec: Record<string, unknown> }) {
  const marks = arr(spec.marks)
    .map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>) : null))
    .filter((m): m is Record<string, unknown> => !!m);
  const nowLabel = str(spec.now_label) ?? "now";

  return (
    <div>
      <div className="relative h-24 rounded-lg bg-muted/60 px-4 py-3">
        {/* the axis */}
        <div className="absolute inset-x-4 top-1/2 h-px bg-border" />
        {/* now */}
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${pct(0)}%` }}>
          <span className="block h-8 w-px -translate-x-1/2 bg-primary" />
          <span className="absolute left-0 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-primary">
            {nowLabel}
          </span>
        </div>
        {marks.map((mark, i) => {
          const at = num(mark.at, 0);
          const spanTo = typeof mark.span_to === "number" ? mark.span_to : null;
          const style = str(mark.style) ?? "point";
          const left = pct(at);
          const right = spanTo === null ? left : pct(spanTo);
          const from = Math.min(left, right);
          const width = Math.abs(right - left);
          return (
            <div key={i} className="absolute inset-x-4 top-1/2" style={{ transform: "translateY(-50%)" }}>
              {style === "bar" || style === "arrow" ? (
                <span
                  className={cn(
                    "absolute h-2 rounded-full",
                    style === "arrow" ? "bg-primary/70" : "bg-primary/50",
                  )}
                  style={{ left: `${from}%`, width: `${Math.max(width, 2)}%` }}
                />
              ) : (
                <span
                  className={cn(
                    "absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full",
                    style === "x" ? "bg-destructive" : "bg-primary",
                  )}
                  style={{ left: `${left}%` }}
                />
              )}
              <span
                className="absolute bottom-3 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
                style={{ left: `${from + width / 2}%` }}
              >
                {str(mark.label) ?? ""}
              </span>
            </div>
          );
        })}
      </div>
      <Caption text={str(spec.caption)} />
    </div>
  );
}

// -------------------------------------------------------------- two box ----

function TwoBox({ spec }: { spec: Record<string, unknown> }) {
  const left = (spec.left ?? null) as Record<string, unknown> | null;
  const right = (spec.right ?? null) as Record<string, unknown> | null;
  const reversed = str(spec.arrow) === "right_to_left";
  if (!left && !right) return null;

  const box = (side: Record<string, unknown> | null) =>
    side ? (
      <div className="flex-1 rounded-lg border border-border bg-muted/50 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {str(side.role) ?? ""}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground">{str(side.text) ?? ""}</p>
      </div>
    ) : (
      <div className="flex-1" />
    );

  return (
    <div>
      <div className="flex items-stretch gap-2">
        {box(left)}
        <div className="flex w-8 shrink-0 items-center justify-center text-lg text-muted-foreground" aria-hidden="true">
          {reversed ? "←" : "→"}
        </div>
        {box(right)}
      </div>
      <Caption text={str(spec.caption)} />
    </div>
  );
}

// ----------------------------------------------------------------- axis ----

function Axis({ spec }: { spec: Record<string, unknown> }) {
  const ends = arr(spec.ends).map((e) => str(e) ?? "");
  const marks = arr(spec.marks)
    .map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>) : null))
    .filter((m): m is Record<string, unknown> => !!m);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[11px] font-medium text-muted-foreground">
        <span>{ends[0] ?? ""}</span>
        <span className="text-right">{ends[1] ?? ""}</span>
      </div>
      <div className="relative mt-2 h-16">
        <div className="absolute inset-x-0 top-3 h-1 rounded-full bg-gradient-to-r from-success/50 to-destructive/50" />
        {marks.map((mark, i) => {
          const pos = Math.max(0, Math.min(1, num(mark.pos, 0.5))) * 100;
          return (
            <div key={i} className="absolute top-0" style={{ left: `${pos}%` }}>
              <span className="block h-7 w-px -translate-x-1/2 bg-foreground/40" />
              <span className="absolute left-0 top-8 max-w-[9rem] -translate-x-1/2 text-center text-[10px] leading-tight text-muted-foreground">
                {str(mark.label) ?? ""}
              </span>
            </div>
          );
        })}
      </div>
      <Caption text={str(spec.caption)} />
    </div>
  );
}

// ---------------------------------------------------------------- cline ----

function Cline({ spec }: { spec: Record<string, unknown> }) {
  const steps = arr(spec.steps)
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : null))
    .filter((s): s is Record<string, unknown> => !!s);
  if (!steps.length) return null;

  return (
    <div>
      {str(spec.label) && (
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {str(spec.label)}
        </p>
      )}
      <ol className="space-y-1.5">
        {steps.map((step, i) => {
          const share = ((steps.length - i) / steps.length) * 100;
          return (
            <li key={i} className="flex items-center gap-3">
              <span className="w-24 shrink-0 font-mono text-[13px] text-foreground">
                {str(step.text) ?? ""}
              </span>
              <span className="h-2 rounded-full bg-primary/40" style={{ width: `${share}%` }} />
              <span className="min-w-0 flex-1 text-[12px] text-muted-foreground">
                {str(step.gloss) ?? ""}
              </span>
            </li>
          );
        })}
      </ol>
      <Caption text={str(spec.caption)} />
    </div>
  );
}

// --------------------------------------------------------------- ladder ----

function Ladder({ spec }: { spec: Record<string, unknown> }) {
  const rungs = arr(spec.rungs)
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => !!r);
  if (!rungs.length) return null;

  return (
    <div>
      {str(spec.top_label) && (
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {str(spec.top_label)}
        </p>
      )}
      <ol className="space-y-1 border-l-2 border-border pl-3">
        {rungs.map((rung, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="text-[13px] leading-relaxed text-foreground">{str(rung.text) ?? ""}</span>
            {str(rung.register) && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {str(rung.register)}
              </span>
            )}
          </li>
        ))}
      </ol>
      {str(spec.bottom_label) && (
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {str(spec.bottom_label)}
        </p>
      )}
      <Caption text={str(spec.caption)} />
    </div>
  );
}

// --------------------------------------------------------------- switch ----

export function Visual({ visual, className }: { visual: VisualPayload | null | undefined; className?: string }) {
  if (!visual || !visual.kind) return null;
  const spec = (visual.spec ?? {}) as Record<string, unknown>;

  let body: ReactElement | null = null;
  switch (visual.kind) {
    case "timeline":
      body = <Timeline spec={spec} />;
      break;
    case "two_box":
      body = <TwoBox spec={spec} />;
      break;
    case "axis":
      body = <Axis spec={spec} />;
      break;
    case "cline":
      body = <Cline spec={spec} />;
      break;
    case "ladder":
      body = <Ladder spec={spec} />;
      break;
    default:
      body = null;
  }
  if (!body) return null;

  return <div className={cn("rounded-lg border border-border bg-background p-4", className)}>{body}</div>;
}

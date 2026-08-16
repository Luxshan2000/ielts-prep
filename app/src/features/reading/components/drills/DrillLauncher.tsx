import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { qtypeLabel } from "../../qtypes";
import { fetchCatalogue, fetchTraps, type RunnerParams } from "./api";
import { FAMILY_LABEL, FAMILY_ORDER } from "./labels";
import type { Catalogue, TrapCatalogue } from "./types";

const DEFAULT_SIZE = 6;

/**
 * Choosing what to drill — from what the learner has actually been losing, first.
 *
 * The order of this screen is an argument. A learner opening a practice menu will pick
 * the thing that sounds interesting; a learner shown *"you have lost nine marks to
 * phantom contradictions"* with a button under it picks the thing that is costing them.
 * So the trap profile is the top block and everything else is below it, and each trap
 * line is itself the button — the taxonomy is only worth carrying if it selects practice.
 *
 * Nothing undrillable is offered. The catalogue counts what the pack really contains, so a
 * trap with two items in the bank is shown greyed with its count rather than opened and
 * then apologised for.
 */
export function DrillLauncher({
  onStart,
  format,
}: {
  onStart: (params: RunnerParams) => void;
  format?: "academic" | "general_training" | null;
}) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [traps, setTraps] = useState<TrapCatalogue | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [bounded, setBounded] = useState(false);
  const [twoStage, setTwoStage] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([fetchCatalogue(format), fetchTraps()])
      .then(([cat, trapDoc]) => {
        if (!live) return;
        setCatalogue(cat);
        setTraps(trapDoc);
        setError(null);
      })
      .catch((err) => live && setError(err))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [format]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-[13px] text-muted-foreground">
        <Spinner /> Reading the bank…
      </div>
    );
  }
  if (error || !catalogue || !traps) {
    return (
      <ErrorState
        error={error}
        title="Drills are unavailable"
        fallback="The sidecar could not describe what this pack can drill."
      />
    );
  }

  if (catalogue.questions === 0) {
    return (
      <EmptyState
        title="No reading questions in the pack"
        description="Import a content pack and the drills will fill themselves in from it."
      />
    );
  }

  const base: RunnerParams = { kind: "trap", size, format: format ?? null, bounded, two_stage: twoStage };
  const profile = traps.profile.filter((row) => row.drillable && row.lost > 0);
  const drillableTraps = traps.traps.filter((row) => row.drillable);
  const noPayload = catalogue.passages_with_payload === 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-[13px] leading-relaxed">
          A test you do not review is a measurement, not practice. These four kinds are what
          a review turns into.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SizePicker value={size} onChange={setSize} />
          <Toggle
            label="Bounded search"
            hint="Show the paragraph band the answer must be in, not the paragraph it is in."
            checked={bounded}
            onChange={setBounded}
          />
          <Toggle
            label="Two-stage TFNG"
            hint="Decide GIVEN vs NOT GIVEN first, then TRUE vs FALSE on the survivors."
            checked={twoStage}
            onChange={setTwoStage}
          />
        </div>
      </div>

      {/* 1 — What you have actually been losing. */}
      {profile.length > 0 && (
        <Section
          title="Your traps"
          note="Counted across every test, passage and drill you have submitted."
        >
          <ul className="space-y-1.5">
            {profile.map((row) => (
              <li key={row.slug}>
                <button
                  type="button"
                  onClick={() => onStart({ ...base, kind: "trap", trap: row.slug })}
                  className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="mt-0.5 w-8 shrink-0 text-[15px] font-semibold tabular text-destructive">
                    {row.lost}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{row.name}</span>
                    <span className="block text-[12px] leading-relaxed text-muted-foreground">
                      {row.what}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {noPayload && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-[12px] leading-relaxed">
          This pack predates the teaching payload, so trap and paraphrase drills have nothing
          to select on. Type and skim drills still work, and every reveal will show the
          explanation the pack does carry.
        </p>
      )}

      {/* 2 — Every trap the bank can teach. */}
      {drillableTraps.length > 0 && (
        <Section title="Trap drills" note="TRUE / FALSE / NOT GIVEN, one named trap at a time.">
          {FAMILY_ORDER.filter((family) => family !== "form").map((family) => {
            const rows = drillableTraps.filter((row) => row.family === family);
            if (rows.length === 0) return null;
            return (
              <div key={family} className="mb-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {FAMILY_LABEL[family]}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {rows.map((row) => (
                    <button
                      key={row.slug}
                      type="button"
                      title={row.what}
                      onClick={() => onStart({ ...base, kind: "trap", trap: row.slug })}
                      className="rounded-md border border-border px-2.5 py-1.5 text-[12px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.name}
                      <span className="ml-1.5 text-muted-foreground tabular">{row.count}</span>
                      {row.thin && <span className="ml-1 text-warning">·</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onStart({ ...base, kind: "trap", trap: null })}
          >
            Mixed judgement drill
          </Button>
        </Section>
      )}

      {/* 3 — One type at a time. */}
      <Section title="Type drills" note="One question type, pulled from across the pack.">
        <div className="flex flex-wrap gap-1.5">
          {catalogue.types
            .filter((row) => row.drillable)
            .map((row) => (
              <button
                key={row.qtype}
                type="button"
                onClick={() => onStart({ ...base, kind: "type", qtype: row.qtype })}
                className="rounded-md border border-border px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {qtypeLabel(row.qtype)}
                <span className="ml-1.5 text-muted-foreground tabular">{row.count}</span>
                {row.order_badge && (
                  <Badge tone="outline" className="ml-1.5">
                    {row.order_badge}
                  </Badge>
                )}
              </button>
            ))}
        </div>
      </Section>

      {/* 4 — Paraphrase, which costs no authored content at all. */}
      <Section
        title="Paraphrase gym"
        note="One question phrasing, four extracts, one that means the same thing."
      >
        {catalogue.paraphrase.drillable > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onStart({ ...base, kind: "paraphrase" })}
          >
            Start · {catalogue.paraphrase.links} pairs in the bank
          </Button>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Needs authored paraphrase links: four in one passage before an item can be built.
          </p>
        )}
      </Section>

      {/* 5 — Speed, with the passage taken away. */}
      <Section
        title="Timed skim"
        note="A passage, a short window, then questions that only gist can answer."
      >
        {catalogue.skim.length > 0 ? (
          <ul className="space-y-1.5">
            {catalogue.skim.slice(0, 8).map((target) => (
              <li key={target.passage_id}>
                <button
                  type="button"
                  onClick={() =>
                    onStart({ ...base, kind: "skim", passage_id: target.passage_id })
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 truncate text-[13px]">{target.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular">
                    {target.window_s}s · {target.items} questions
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Needs a passage with an authored skim plan or gist-tagged questions.
          </p>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <p className="mb-2 text-[12px] text-muted-foreground">{note}</p>
      {children}
    </section>
  );
}

function SizePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px] text-muted-foreground">Questions</span>
      {[4, 6, 10].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={cn(
            "rounded-md border px-2 py-1 text-[12px] tabular transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === n
              ? "border-primary bg-primary/12 text-primary"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={hint}
      onClick={() => onChange(!checked)}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked
          ? "border-primary bg-primary/12 text-primary"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

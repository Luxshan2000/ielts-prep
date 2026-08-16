import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fetchCatalogue, fetchKinds, fetchProfile, type RunnerParams } from "./api";
import { BUCKET_SHORT } from "./labels";
import type { BucketProfile, Catalogue, DrillKind, KindsDoc } from "./types";

const DEFAULT_SIZE = 6;

/**
 * Choosing what to drill — from what the learner has actually been losing, first.
 *
 * The order of this screen is an argument. A learner opening a practice menu picks whatever
 * sounds interesting; a learner shown *"weak forms are most of everything you drop"* with a
 * button under it picks the thing that is costing them. So the bucket profile is the top
 * block when there is one, and the four kinds sit below it.
 *
 * **Nothing undrillable is offered.** The catalogue counts what this pack really contains,
 * so a kind with two items in the bank is shown greyed with its count rather than opened and
 * then apologised for. The same goes for the recording: a script that has never been
 * synthesized is still offered for the prediction drill, because that one needs no audio,
 * and is marked as needing preparation for the other three.
 */
export function DrillLauncher({
  onStart,
  scriptId,
}: {
  onStart: (params: RunnerParams) => void;
  /** Pin the whole launcher to one part — what the review screen passes. */
  scriptId?: string | null;
}) {
  const [kinds, setKinds] = useState<KindsDoc | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [profile, setProfile] = useState<BucketProfile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [chosenScript, setChosenScript] = useState<string | null>(scriptId ?? null);
  const [size, setSize] = useState(DEFAULT_SIZE);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([fetchKinds(), fetchCatalogue(), fetchProfile()])
      .then(([kindDoc, cat, prof]) => {
        if (!live) return;
        setKinds(kindDoc);
        setCatalogue(cat);
        setProfile(prof);
        setError(null);
      })
      .catch((err) => live && setError(err))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-[13px] text-muted-foreground">
        <Spinner /> Reading the script bank…
      </div>
    );
  }
  if (error || !kinds || !catalogue) {
    return (
      <ErrorState
        error={error}
        title="Drills are unavailable"
        fallback="The sidecar could not describe what this pack can drill."
      />
    );
  }
  if (catalogue.n_scripts === 0) {
    return (
      <EmptyState
        title="No listening scripts in the pack"
        description="Import a content pack and the drills will fill themselves in from it."
      />
    );
  }

  const scripts = scriptId
    ? catalogue.scripts.filter((s) => s.script_id === scriptId)
    : catalogue.scripts;
  const active = chosenScript
    ? (scripts.find((s) => s.script_id === chosenScript) ?? null)
    : null;
  const counts = (kind: DrillKind) =>
    active ? active.counts[kind] : (catalogue.kinds.find((k) => k.kind === kind)?.items ?? 0);
  const losses = (profile?.buckets ?? []).filter((row) => row.count > 0).slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-[13px] leading-relaxed">{kinds.why}</p>
      </div>

      {losses.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold">What you have been dropping</p>
          <div className="flex flex-wrap gap-1.5">
            {losses.map((row) => (
              <Badge key={row.bucket} tone={row.bucket === "spelling" ? "warning" : "destructive"}>
                {row.count} {BUCKET_SHORT[row.bucket] ?? row.bucket}
                {row.share > 0 && ` · ${Math.round(row.share * 100)}%`}
              </Badge>
            ))}
          </div>
          <p className="text-[12px] text-muted-foreground">{profile?.note}</p>
        </div>
      )}

      {!scriptId && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium">Recording</span>
            <Select
              value={chosenScript}
              onChange={setChosenScript}
              aria-label="Listening script"
              options={[
                { value: "", label: "Surprise me (any part)" },
                ...scripts.map((s) => ({
                  value: s.script_id,
                  label: `Part ${s.part}: ${s.title}${s.audio_ready ? "" : " (no audio yet)"}`,
                })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium">Items</span>
            <Select
              value={String(size)}
              onChange={(value) => setSize(Number(value) || DEFAULT_SIZE)}
              aria-label="Set size"
              options={[3, 5, 6, 8, 10].map((n) => ({ value: String(n), label: `${n} items` }))}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {kinds.kinds.map((info) => {
          const available = counts(info.kind);
          const usable = available >= kinds.sizes.min;
          // `optional` is the honest case that a boolean would get wrong: the numbers
          // drill has a mode that needs no recording, so an unrendered part narrows it
          // rather than closing it.
          const unrendered = active != null && !active.audio_ready;
          const blocked = unrendered && info.audio === "required";
          const narrowed = unrendered && info.audio === "optional";
          const modes = narrowed ? info.modes.filter((m) => m.mode === "form") : info.modes;
          const base: RunnerParams = {
            kind: info.kind,
            script_id: chosenScript || null,
            size: Math.min(size, info.max_size),
          };
          return (
            <div
              key={info.kind}
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-4",
                usable ? "border-border" : "border-border/60 opacity-60",
              )}
            >
              <div>
                <p className="text-[14px] font-semibold">{info.title}</p>
                <p className="text-[12px] text-muted-foreground">{info.subtitle}</p>
              </div>
              <p className="flex-1 text-[13px] leading-relaxed">{info.trains}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                <Badge tone="outline">{available} available</Badge>
                {info.audio === "never" && <Badge tone="success">Works with no audio</Badge>}
                {blocked && <Badge tone="warning">Needs the audio prepared</Badge>}
                {narrowed && <Badge tone="warning">Only the no-audio mode until this part is prepared</Badge>}
                <span>· marked by {info.graded_by}</span>
              </div>

              {modes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {modes.map((mode) => (
                    <Button
                      key={mode.mode}
                      variant={mode.mode === modes[0].mode ? "primary" : "outline"}
                      disabled={!usable || blocked}
                      onClick={() => onStart({ ...base, mode: mode.mode })}
                      title={mode.what}
                    >
                      {mode.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <Button disabled={!usable || blocked} onClick={() => onStart(base)}>
                  Start
                </Button>
              )}

              {!usable && (
                <p className="text-[12px] text-muted-foreground">
                  {info.needs}. This pack has {available}, and a set needs {kinds.sizes.min}.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="rounded-lg border border-border/60 p-3 text-[12px] leading-relaxed text-muted-foreground">
        {kinds.honesty}
      </p>
    </div>
  );
}

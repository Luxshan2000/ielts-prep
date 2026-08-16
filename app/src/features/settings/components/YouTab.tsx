import { useEffect, useRef, useState } from "react";
import { Check, Clock, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Field } from "@/components/ui";
import { useSettingsStore } from "@/stores";
import { cn } from "@/lib/cn";
import { patchSettingsOptimistic } from "../store";
import { Slider, type SliderProps } from "./Slider";

/**
 * The learner's own preferences, which until now could only be set once.
 *
 * Exam format, target band, how long a day, which days — every one of these is collected
 * during onboarding, written to `settings.study`, and then has no screen. A learner who moves
 * their exam, raises their goal after a good week, or starts a job and can only manage twenty
 * minutes had nowhere to say so, and the plan on Home kept pacing them against a promise they
 * made in their first five minutes with the app.
 *
 * Saves on change, like Appearance: every control here has a visible effect on the study plan
 * and none of them can be half-set, so a Save button would only add a step to forget.
 */

const FORMATS: { id: "academic" | "general_training"; label: string; who: string }[] = [
  {
    id: "academic",
    label: "Academic",
    who: "For university study, and for most professional registration.",
  },
  {
    id: "general_training",
    label: "General Training",
    who: "For migration, and for work or training below degree level.",
  },
];

const DAYS: { id: string; label: string; short: string }[] = [
  { id: "mon", label: "Monday", short: "M" },
  { id: "tue", label: "Tuesday", short: "T" },
  { id: "wed", label: "Wednesday", short: "W" },
  { id: "thu", label: "Thursday", short: "T" },
  { id: "fri", label: "Friday", short: "F" },
  { id: "sat", label: "Saturday", short: "S" },
  { id: "sun", label: "Sunday", short: "S" },
];

/** Bands are awarded in half steps, so the control moves in half steps. */
const BANDS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

/**
 * A slider that moves freely and saves once you stop.
 *
 * A range input fires on every frame of a drag, so writing straight through would send a PATCH
 * per pixel and race its own responses — the last one to land wins, which is not necessarily
 * the last one you chose. The thumb follows the finger from local state; the write happens a
 * beat after it stops.
 */
function SettledSlider({
  value,
  onSettle,
  ...rest
}: Omit<SliderProps, "value" | "onChange"> & { value: number; onSettle: (v: number) => void }) {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  const timer = useRef<number | null>(null);

  // The stored value wins whenever it changes underneath us — unless a drag is in flight,
  // in which case snapping the thumb back mid-gesture is worse than being briefly stale.
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return (
    <Slider
      {...rest}
      value={local}
      onChange={(next) => {
        setLocal(next);
        dragging.current = true;
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          dragging.current = false;
          onSettle(next);
        }, 400);
      }}
    />
  );
}

export function YouTab() {
  const doc = useSettingsStore((s) => s.doc);
  const [error, setError] = useState<string | null>(null);

  const study = (doc?.study ?? {}) as Record<string, unknown>;
  const format = study.exam_format === "general_training" ? "general_training" : "academic";
  const target = typeof study.target_band === "number" ? study.target_band : 7;
  const minutes = typeof study.daily_minutes === "number" ? study.daily_minutes : 60;
  const days = Array.isArray(study.study_days) ? (study.study_days as string[]) : [];
  const showTimer = study.show_timer !== false;
  const newPerDay = typeof study.srs_new_per_day === "number" ? study.srs_new_per_day : 10;

  const save = async (patch: Record<string, unknown>, what: string) => {
    setError(null);
    const ok = await patchSettingsOptimistic({ study: patch });
    if (!ok) setError(`${what} could not be saved. Check the Providers tab for a connection problem.`);
  };

  const toggleDay = (id: string) => {
    const next = days.includes(id) ? days.filter((d) => d !== id) : [...days, id];
    // Ordering matters to anything that renders the week, and a toggled-off-then-on day
    // would otherwise jump to the end of the list.
    const ordered = DAYS.filter((d) => next.includes(d.id)).map((d) => d.id);
    void save({ study_days: ordered }, "Your study days");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Which exam are you taking?</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            This changes the Writing Task 1 you are given and which reading passages you see.
            Listening and Speaking are the same in both.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {FORMATS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={format === option.id}
              onClick={() => void save({ exam_format: option.id }, "Your exam format")}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                format === option.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-2 text-[14px] font-medium text-foreground">
                {option.label}
                {format === option.id && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
              </span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">{option.who}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            The band you are aiming for
          </CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Everything in the app is measured against this — what Home says you still need, and
            which practice it puts in front of you first. Move it whenever your goal moves.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {BANDS.map((band) => (
              <button
                key={band}
                type="button"
                aria-pressed={target === band}
                onClick={() => void save({ target_band: band }, "Your target band")}
                className={cn(
                  "tabular min-w-[3.25rem] rounded-lg border px-2.5 py-1.5 text-[14px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  target === band
                    ? "border-primary bg-primary/10 font-semibold text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {band.toFixed(1)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            How much time you have
          </CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            An honest number beats an ambitious one — the daily plan is built to fit it, so a
            figure you cannot keep produces a plan you fall behind.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettledSlider
            label="Minutes a day"
            value={minutes}
            min={10}
            max={180}
            step={5}
            decimals={0}
            unit="min"
            onSettle={(next) => void save({ daily_minutes: next }, "Your daily minutes")}
          />

          <Field label="Days you study" hint="Rest days are not counted against your streak.">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day) => {
                const on = days.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={day.label}
                    onClick={() => toggleDay(day.id)}
                    className={cn(
                      "h-9 w-9 rounded-full border text-[13px] font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                    title={day.label}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          </Field>

          <SettledSlider
            label="New words and grammar points a day"
            value={newPerDay}
            min={0}
            max={40}
            step={1}
            decimals={0}
            onSettle={(next) => void save({ srs_new_per_day: next }, "Your daily new-card limit")}
          />
          <p className="-mt-2 text-[13px] text-muted-foreground">
            Reviews of what you already know are on top of this and are not capped by it. Set it
            to zero for a week if the reviews have piled up.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>During practice</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
              checked={showTimer}
              onChange={(e) => void save({ show_timer: e.target.checked }, "The timer setting")}
            />
            <span>
              <span className="block text-[14px] font-medium text-foreground">Show the timer</span>
              <span className="block text-[13px] text-muted-foreground">
                The real exam is timed, so this is on by default. Turning it off does not add
                time — the paper is still marked against the exam's limit — it only hides the
                clock, which helps if watching it is what makes you rush.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}

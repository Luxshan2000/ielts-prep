import { useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { Radar as RadarIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  SkeletonChart,
  Tabs,
} from "@/components/ui";
import { formatBand } from "@/lib/format";
import { useChartTheme } from "../chartTheme";
import {
  CRITERION_LABELS,
  QTYPE_LABELS,
  SKILL_KEYS,
  SKILL_LABELS,
  type CriteriaDoc,
  type SkillKey,
} from "../types";

interface Props {
  criteria: Partial<Record<SkillKey, CriteriaDoc>>;
  /** The thrown value, so the panel can name an offline service or a bad provider. */
  error?: unknown;
  onSelect: (skill: SkillKey) => void;
}

function criterionLabel(key: string): string {
  return CRITERION_LABELS[key] ?? key;
}

function qtypeLabel(key: string): string {
  return QTYPE_LABELS[key] ?? key.replace(/[_-]+/g, " ");
}

/** Radar for Writing and Speaking; question-type accuracy bars for Reading and Listening (10 §7). */
export function CriteriaPanel({ criteria, error, onSelect }: Props) {
  const theme = useChartTheme();
  const [skill, setSkill] = useState<SkillKey>("writing");
  const doc = criteria[skill];

  const select = (next: SkillKey) => {
    setSkill(next);
    onSelect(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criterion breakdown</CardTitle>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Where the marks are going inside each skill. Writing and Speaking are scored on four
          criteria; Reading and Listening show accuracy by question type instead.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <Tabs
          aria-label="Criterion breakdown skill"
          value={skill}
          onChange={(value) => select(value as SkillKey)}
          items={SKILL_KEYS.map((key) => ({ value: key, label: SKILL_LABELS[key] }))}
        />

        {error ? (
          <ErrorState
            error={error}
            title="The breakdown could not be loaded"
            fallback="Your criterion scores could not be read."
          />
        ) : !doc ? (
          /* No document is never "nothing scored" — the sidecar answers a skill with
             no attempts with an empty `criteria` / `items` document, and the two
             panels below say so in their own words. `!doc` only ever means the
             request is still in flight, which is what a learner clicking Reading for
             the first time sees; it used to flash "Nothing scored in reading yet" at
             them and then contradict itself a moment later. */
          <SkeletonChart aspect="aspect-square" />
        ) : doc.kind === "criteria_radar" ? (
          <RadarPanel doc={doc} color={theme.series[skill]} theme={theme} skill={skill} />
        ) : (
          <QtypePanel doc={doc} color={theme.series[skill]} />
        )}
      </CardContent>
    </Card>
  );
}

function RadarPanel({
  doc,
  color,
  theme,
  skill,
}: {
  doc: Extract<CriteriaDoc, { kind: "criteria_radar" }>;
  color: string;
  theme: ReturnType<typeof useChartTheme>;
  skill: SkillKey;
}) {
  const entries = Object.entries(doc.criteria ?? {});
  if (entries.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={RadarIcon}
        title={`No ${SKILL_LABELS[skill].toLowerCase()} criterion bands yet`}
        description="Criterion bands come from your scored attempts. One scored attempt is enough to draw the first shape."
      />
    );
  }

  const data = entries.map(([key, band]) => ({
    criterion: key,
    label: criterionLabel(key),
    band,
  }));

  return (
    <div className="space-y-3">
      <div className="scrollbar-thin overflow-x-auto">
        <div className="h-[260px] min-w-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="72%">
              <PolarGrid stroke={theme.grid} />
              <PolarAngleAxis
                dataKey="criterion"
                tick={{ fill: theme.axisText, fontSize: 11 }}
              />
              {/* Ticks are off on purpose: stacked numerals inside a four-axis
                  radar are unreadable, and the exact bands are listed below. */}
              <PolarRadiusAxis
                domain={[4, 9]}
                tickCount={6}
                tick={false}
                axisLine={false}
                stroke={theme.grid}
                angle={90}
              />
              <Radar
                name={`${SKILL_LABELS[skill]} criterion bands`}
                dataKey="band"
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={0.18}
                isAnimationActive={false}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* The axis can only carry the initialism; the list spells every criterion out. */}
      <ul className="space-y-1.5">
        {data.map((row) => (
          <li key={row.criterion} className="flex items-center gap-2 text-[13px]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {row.label} <span className="text-muted-foreground">({row.criterion})</span>
            </span>
            <span className="shrink-0 tabular text-foreground">{formatBand(row.band)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Rings run from band 4 at the centre to band 9 at the edge.{" "}
        {doc.disclaimer || "Estimated band, not a guarantee"}
        {doc.band?.display ? ` · overall ${doc.band.display}` : ""}
      </p>
    </div>
  );
}

function QtypePanel({
  doc,
  color,
}: {
  doc: Extract<CriteriaDoc, { kind: "question_type_accuracy" }>;
  color: string;
}) {
  if (doc.items.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={RadarIcon}
        title="No answered questions yet"
        description="Question-type accuracy appears once you have submitted a passage or a listening part."
      />
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2.5">
        {doc.items.map((item) => {
          const pct = Math.round(item.accuracy * 100);
          return (
            <li key={item.qtype} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-foreground">{qtypeLabel(item.qtype)}</span>
                <span className="shrink-0 tabular text-muted-foreground">
                  {item.correct} / {item.attempted} · {pct} %
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-r-[4px]"
                  style={{ width: `${Math.max(pct, 1)}%`, background: color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Weakest question type first. {doc.band?.display ? `Overall ${doc.band.display}.` : ""}
      </p>
    </div>
  );
}

/**
 * The listening coach — `/listening/coach/:scriptId`.
 *
 * One part, studied. It mirrors the reading, writing and speaking coaches so the app feels
 * like one product, and it gates its key the same way. What it does not mirror is *what*
 * it teaches, because listening is not reading with the lights off.
 *
 * Reading teaches through worked solutions: the text stays on the page, so a solution that
 * says "the answer was in paragraph D" is useful. Listening's audio plays once and then it
 * is gone, so a note saying "the answer was at line 34" is a post-mortem — the learner
 * already knows they missed line 34. What they do not know is why their ear did not stop
 * there. So the payload is organised as the moments around each answer:
 *
 *   BEFORE — what class of word could fill this gap, decided from the printed page
 *   APPROACH — the marker that announced the answer was coming
 *   THE MOMENT — what was actually said, and how far it was from what was printed
 *   THE TRAP — the value the speaker offered and withdrew
 *   AFTER — where to re-anchor, and whether the loss was hearing or spelling
 *
 * **Prediction is the landing tab, not the brief.** It is the only one of the five that is
 * useful before the audio plays, it needs no audio to run, and it is the highest-yield
 * technique in the paper — so it is what the screen opens on rather than something to
 * find. Everything else here is arranged around that: the brief is preparation you read
 * once, the transcript is review you earn.
 *
 * **The gate belongs to the sidecar.** Nothing on this screen computes `unlocked` from a
 * ledger; the transcript and the timelines are simply absent from the response until an
 * attempt covering this script has been submitted, and `gate.message` is what the padlock
 * says. A live mock shuts everything, including a part unlocked last week.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GraduationCap, Headphones, Lock } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
  TabPanel,
  Tabs,
  type TabItem,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { PrepareAudioPanel } from "../PrepareAudioPanel";
import { BriefPanel } from "./BriefPanel";
import { PredictionPanel } from "./PredictionPanel";
import { SignpostPanel } from "./SignpostPanel";
import { GATE_REASON, TranscriptGate, TranscriptStudy } from "./TranscriptStudy";
import { VocabPanel } from "./VocabPanel";
import { useCoachStore } from "./store";
import { hasTeaching } from "./types";

type CoachTab = "prediction" | "brief" | "transcript" | "signposts" | "vocabulary";

export function ListeningCoach() {
  const { scriptId = "" } = useParams<{ scriptId: string }>();
  const navigate = useNavigate();

  const slot = useCoachStore((s) => s.slots[scriptId]);
  const loadScript = useCoachStore((s) => s.loadScript);
  const conditions = useCoachStore((s) => s.conditions);

  // Prediction, not the brief: it is the only tab worth opening before the audio has
  // ever played, and it is the point of the module.
  const [tab, setTab] = useState<CoachTab>("prediction");

  useEffect(() => {
    void loadScript(scriptId);
  }, [loadScript, scriptId]);

  // A screen that failed while the sidecar was down must not stay on its error card.
  useSidecarRecovery(() => void loadScript(scriptId, { force: true }));

  const practise = useCallback(() => {
    navigate(`/listening/part/${encodeURIComponent(scriptId)}?mode=practice`);
  }, [navigate, scriptId]);

  const status = slot?.status ?? "idle";
  const doc = slot?.doc ?? null;
  const examConditions = Boolean(conditions?.active) || Boolean(doc?.exam_conditions?.active);

  const tabs = useMemo<TabItem<CoachTab>[]>(() => {
    const unlocked = doc?.gate.unlocked ?? false;
    return [
      { value: "prediction", label: "Prediction" },
      { value: "brief", label: "The brief" },
      {
        value: "transcript",
        label: "Transcript",
        badge: unlocked ? (
          (doc?.timelines_available ?? 0)
        ) : (
          <Lock className="h-3 w-3" aria-label="Locked" />
        ),
      },
      { value: "signposts", label: "Signposts & traps" },
      { value: "vocabulary", label: "Vocabulary" },
    ];
  }, [doc]);

  // ---------------------------------------------------------------- loading ---

  if (status === "idle" || status === "loading") {
    return (
      <PageShell
        title="Listening coach"
        description="Opening this part and whatever it has to teach with."
      >
        <div className="space-y-4" role="status" aria-live="polite">
          <span className="sr-only">Loading this part.</span>
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </PageShell>
    );
  }

  // ------------------------------------------------------------------ error ---

  if (status === "error" || !doc) {
    return (
      <PageShell title="Listening coach">
        <Card>
          <CardContent className="pt-5">
            <ErrorState
              error={slot?.error}
              title="This part could not be opened"
              onRetry={() => void loadScript(scriptId, { force: true })}
            />
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" onClick={() => navigate("/listening")}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Listening
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const unlocked = doc.gate.unlocked;
  const gateReason = doc.gate.message ?? GATE_REASON;
  const taught = hasTeaching(doc);

  return (
    <PageShell
      maxWidth="max-w-7xl"
      title={`Part ${doc.part} — ${doc.title}`}
      description="What to predict before it plays, what this part is, and — once you have answered it — exactly where every mark was won and lost."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="outline">{doc.accent_set.toUpperCase()}</Badge>
          {unlocked && doc.gate.last_raw_score !== null && (
            <Badge tone="success">{doc.gate.last_raw_score} when you sat it</Badge>
          )}
          {examConditions && <Badge tone="warning">Mock in progress</Badge>}
          <Button size="sm" disabled={examConditions || !doc.audio.ready} onClick={practise}>
            <Headphones className="h-4 w-4" aria-hidden="true" />
            {unlocked ? "Sit it again" : "Sit this part"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/listening")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Listening
          </Button>
        </div>
      }
      toolbar={
        <Tabs
          aria-label="Listening coach sections"
          items={tabs}
          value={tab}
          onChange={(value) => setTab(value)}
        />
      }
    >
      <div className="space-y-4">
        {examConditions && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/8 p-3"
          >
            <p className="text-[13px] leading-6 text-muted-foreground">
              {conditions?.message ??
                "A mock paper is open, so every coaching surface is shut until it is finished. The clock is still running."}
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate("/listening/mock")}>
              Back to the sitting
            </Button>
          </div>
        )}

        {!doc.audio.ready && (
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-[13px] text-muted-foreground">
              This part&rsquo;s audio has not been generated yet, so the replay buttons are switched
              off. It is synthesized on this machine once and then cached.
            </p>
            <PrepareAudioPanel
              targetId={doc.script_id}
              kind="script"
              ready={doc.audio.ready}
              onDone={() => void loadScript(scriptId, { force: true })}
            />
          </div>
        )}

        {!taught && !examConditions && (
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                icon={GraduationCap}
                title="No teaching payload on this part"
                description="This script was authored before the listening teaching payload existed, or this build's content pack predates it. The questions, the audio and the marking all work exactly the same — there is simply nothing here to explain them with yet. The prediction drill still runs off the printed frames, and the brief, the signpost inventory and the paper facts are true of every recording, so they still apply."
                action={
                  <Button disabled={!doc.audio.ready} onClick={practise}>
                    Sit it anyway
                  </Button>
                }
              />
            </CardContent>
          </Card>
        )}

        <TabPanel value="Prediction" active={tab === "prediction"}>
          <PredictionPanel
            scriptId={scriptId}
            doc={slot?.predictions ?? null}
            error={slot?.predictionsError ?? null}
          />
        </TabPanel>

        <TabPanel value="The brief" active={tab === "brief"}>
          <BriefPanel doc={doc} />
        </TabPanel>

        <TabPanel value="Transcript" active={tab === "transcript"}>
          {unlocked && doc.transcript.lines.length > 0 ? (
            <TranscriptStudy doc={doc} />
          ) : (
            <TranscriptGate
              reason={gateReason}
              onPractise={examConditions || !doc.audio.ready ? undefined : practise}
              onMock={examConditions ? undefined : () => navigate("/listening/mock")}
            />
          )}
        </TabPanel>

        <TabPanel value="Signposts & traps" active={tab === "signposts"}>
          <SignpostPanel doc={doc} />
        </TabPanel>

        <TabPanel value="Vocabulary" active={tab === "vocabulary"}>
          <VocabPanel doc={doc} />
        </TabPanel>
      </div>
    </PageShell>
  );
}

export default ListeningCoach;

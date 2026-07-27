/**
 * `/speaking/mock` — the screen that decides whether the mock is taken seriously.
 *
 * A mock test is only worth anything if the candidate sits it under the conditions it
 * claims to reproduce. Nobody does that by accident, so this screen does three things
 * before it will let them in: it states exactly what is about to happen, it states
 * what will NOT happen (no help, no pausing, no retakes), and it makes them prove the
 * microphone works. Then it offers one button.
 *
 * Everything here is honest about cost. The temptation on a screen like this is to
 * reassure — "don't worry, it's just practice" — which is precisely how you get a
 * learner who half-tries and then distrusts the band.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Info,
  Radio,
  ShieldAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Select,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSessionStore } from "@/stores";
import { PreCallCheck } from "../PreCallCheck";
import { useSpeakingStore, type SpeakingCard } from "../../store";
import { MockHistory } from "./MockHistory";
import { BAND_HONESTY, EXPECTATIONS, PART_OUTLINE } from "./script";
import { useMockStore } from "./store";

/** Topic sets, from the card list the practice room already loads. */
function setOptions(cards: SpeakingCard[]) {
  const seen = new Map<string, string>();
  for (const card of cards) {
    if (card.card_set_id && !seen.has(card.card_set_id)) {
      seen.set(card.card_set_id, card.title);
    }
  }
  return [
    { value: "", label: "Choose for me (a set you haven't sat recently)" },
    ...[...seen.entries()].map(([id, title]) => ({ value: id, label: title })),
  ];
}

export function MockPreflight() {
  const navigate = useNavigate();
  const offline = useSessionStore((s) => s.offline);

  const micId = useSpeakingStore((s) => s.micId);
  const setMicId = useSpeakingStore((s) => s.setMicId);
  const engine = useSpeakingStore((s) => s.engine);
  const loadEngine = useSpeakingStore((s) => s.loadEngine);
  const cards = useSpeakingStore((s) => s.cards);
  const loadCards = useSpeakingStore((s) => s.loadCards);

  const cardSetId = useMockStore((s) => s.cardSetId);
  const setCardSetId = useMockStore((s) => s.setCardSetId);
  const starting = useMockStore((s) => s.starting);
  const startError = useMockStore((s) => s.startError);
  const start = useMockStore((s) => s.start);

  const [micReady, setMicReady] = useState(false);

  useEffect(() => {
    void loadEngine();
    void loadCards();
  }, [loadCards, loadEngine]);

  const onReadyChange = useCallback((ready: boolean) => setMicReady(ready), []);

  const options = useMemo(() => setOptions(cards), [cards]);
  const liveElsewhere = engine?.live_session_id ?? null;
  const voiceMissing = engine?.voice_available === false;
  const blocked = offline || voiceMissing || Boolean(liveElsewhere);

  const begin = async () => {
    const session = await start();
    if (session) navigate(`/speaking/mock/sitting/${session.session_id}`);
  };

  return (
    <PageShell
      title="Mock speaking test"
      description="Three parts, 11–14 minutes, one band at the end. No help while it runs."
      actions={<Badge tone="primary">Counts toward your band trend</Badge>}
    >
      <div className="space-y-6">
        {offline && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/8 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-[13px] text-muted-foreground">
              The practice engine isn't responding, so a mock can't start. It may still be
              launching — retry in a few seconds.
            </p>
          </div>
        )}

        {voiceMissing && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/8 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-[13px] text-muted-foreground">
              The voice engine isn't installed in this build, so the examiner can't speak. Mock
              tests are unavailable until it is.
            </p>
          </div>
        )}

        {liveElsewhere && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/8 p-3">
            <p className="flex items-center gap-2 text-[13px] text-foreground">
              <Radio className="h-4 w-4 text-primary" />
              A speaking session is already open. Only one can run at a time.
            </p>
            <Button size="sm" onClick={() => navigate(`/speaking/session/${liveElsewhere}`)}>
              Rejoin it
            </Button>
          </div>
        )}

        {/* ------------------------------------------------ what happens --- */}
        <Card>
          <CardHeader>
            <CardTitle>What is about to happen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="space-y-3">
              {PART_OUTLINE.map((row) => (
                <li key={row.part} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-semibold text-primary">
                    {row.part}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                      {row.title}
                      <span className="inline-flex items-center gap-1 text-[12px] font-normal text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {row.duration}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                      {row.what}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[13px] text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {BAND_HONESTY}
            </p>
          </CardContent>
        </Card>

        {/* -------------------------------------------- the terms of entry --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
              Before you commit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {EXPECTATIONS.map((item) => (
                <li key={item.id} className="rounded-xl border border-border bg-card p-3.5">
                  <p className="text-[13px] font-semibold">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                    {item.detail}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ------------------------------------------------ set + mic check --- */}
        <Card>
          <CardContent className="pt-5">
            <Field
              label="Topic set"
              hint="Leaving this on automatic keeps cue cards from coming round again too soon, which is what makes the trend meaningful."
            >
              <Select
                value={cardSetId ?? ""}
                onChange={(value) => setCardSetId(value || null)}
                options={options}
                aria-label="Topic set for this mock"
              />
            </Field>
          </CardContent>
        </Card>

        <PreCallCheck
          micId={micId}
          onMicChange={setMicId}
          onReadyChange={onReadyChange}
          footer={
            <div className="space-y-3 border-t border-border pt-4">
              {startError && (
                <p role="alert" className="text-[13px] text-destructive">
                  {startError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  loading={starting}
                  disabled={starting || blocked}
                  onClick={() => void begin()}
                >
                  Start the mock test
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="text-[12px] text-muted-foreground">
                  {micReady
                    ? "Part 1 begins as soon as the examiner connects. There is no countdown."
                    : "Test the microphone first — if the examiner hears nothing there is no band to give you."}
                </p>
              </div>
            </div>
          }
        />

        {/* ------------------------------------------------------- history --- */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">Your past mocks</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/speaking/mock/history")}>
              See all
            </Button>
          </div>
          <MockHistory limit={3} />
        </section>
      </div>
    </PageShell>
  );
}

export default MockPreflight;

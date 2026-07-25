import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Globe2, Headphones, Repeat } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Select,
  SkeletonCard,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { playAudio } from "../media";
import { useListeningStore } from "../store";
import type { ScriptSummary } from "../types";
import { PrepareAudioPanel } from "./PrepareAudioPanel";

/**
 * Accent labels as the sidecar reports them (`bandready/audio/tts_render.py`
 * ACCENT_LABELS). The Australian wording is deliberate: Kokoro ships no AU
 * voices, so that render is British voices and the UI must not pretend otherwise.
 */
const ACCENTS: { value: string; label: string }[] = [
  { value: "uk", label: "British" },
  { value: "us", label: "American" },
  { value: "au", label: "Australian (approximated with British voices)" },
];

/** How much of each version the A/B comparison plays. */
const COMPARE_SECONDS = 30;

/**
 * Accent training (07 §8): the same script re-rendered with another accent's
 * voice cast. The questions are unchanged, so the drill is pure ear training.
 */
export function AccentDrill() {
  const navigate = useNavigate();
  const scripts = useListeningStore((s) => s.scripts);
  const loading = useListeningStore((s) => s.scriptsLoading);
  const error = useListeningStore((s) => s.scriptsError);
  const loadLibrary = useListeningStore((s) => s.loadLibrary);
  const prepareScript = useListeningStore((s) => s.prepareScript);
  const prepare = useListeningStore((s) => s.prepare);

  const [scriptId, setScriptId] = useState<string | null>(null);
  const [accent, setAccent] = useState("us");
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const [variantSrc, setVariantSrc] = useState<string | null>(null);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);

  const originalRef = useRef<HTMLAudioElement | null>(null);
  const variantRef = useRef<HTMLAudioElement | null>(null);
  const compareTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const rendered = useMemo(() => scripts?.filter((s) => s.audio.ready) ?? [], [scripts]);
  const script: ScriptSummary | null = useMemo(
    () => scripts?.find((s) => s.id === scriptId) ?? null,
    [scripts, scriptId],
  );

  // Default to the first script whose audio already exists — a drill needs a
  // baseline to compare against.
  useEffect(() => {
    if (scriptId || rendered.length === 0) return;
    setScriptId(rendered[0].id);
  }, [scriptId, rendered]);

  // Freeze the baseline URL: re-rendering in another accent moves the script
  // row's audio_hash, but the original WAV stays in the cache.
  useEffect(() => {
    let cancelled = false;
    setOriginalSrc(null);
    setVariantSrc(null);
    setDrillError(null);
    if (!script?.audio.ready) return undefined;
    void api
      .mediaUrl(script.audio.media_path)
      .then((url) => {
        if (!cancelled) setOriginalSrc(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDrillError(err instanceof ApiError ? err.detail : "the audio link could not be signed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [script?.id, script?.audio.ready, script?.audio.media_path]);

  const clearCompare = useCallback(() => {
    for (const timer of compareTimers.current) clearTimeout(timer);
    compareTimers.current = [];
    originalRef.current?.pause();
    variantRef.current?.pause();
    setComparing(false);
  }, []);

  useEffect(() => clearCompare, [clearCompare]);

  const renderVariant = async () => {
    if (!script) return;
    setDrillError(null);
    setVariantSrc(null);
    const hash = await prepareScript(script.id, accent);
    if (!hash) {
      const key = `script:${script.id}:${accent}`;
      setDrillError(
        useListeningStore.getState().prepare[key]?.error ??
          "that accent could not be rendered",
      );
      return;
    }
    try {
      setVariantSrc(await api.mediaUrl(`/api/v1/media/listening/${hash}.wav`));
    } catch (err) {
      setDrillError(err instanceof ApiError ? err.detail : "the audio link could not be signed");
    }
  };

  /** Play the same 30 s from the baseline, then from the variant. */
  const compare = () => {
    const a = originalRef.current;
    const b = variantRef.current;
    if (!a || !b) return;
    clearCompare();
    const from = a.currentTime;
    setComparing(true);
    b.currentTime = from;
    void playAudio(a).catch(() => setComparing(false));
    compareTimers.current.push(
      setTimeout(() => {
        a.pause();
        void playAudio(b).catch(() => setComparing(false));
      }, COMPARE_SECONDS * 1000),
      setTimeout(() => {
        b.pause();
        setComparing(false);
      }, COMPARE_SECONDS * 2000),
    );
  };

  const header = (
    <Button variant="ghost" onClick={() => navigate("/listening")}>
      <ArrowLeft className="h-4 w-4" />
      Library
    </Button>
  );

  if (loading && !scripts) {
    return (
      <PageShell title="Accent training" description="Loading the script library…">
        <SkeletonCard lines={4} />
      </PageShell>
    );
  }

  // Honest gate: without scripts (or without a sidecar that reports accents)
  // there is nothing to re-render, so no control is offered.
  const accentsSupported = (scripts ?? []).some((s) => Boolean(s.audio.accent_label));
  if (error && !scripts) {
    return (
      <PageShell title="Accent training" actions={header}>
        <EmptyState
          title="The script library could not be loaded"
          description={error}
          action={<Button onClick={() => void loadLibrary(true)}>Try again</Button>}
        />
      </PageShell>
    );
  }
  if (!scripts || scripts.length === 0 || !accentsSupported) {
    return (
      <PageShell title="Accent training" actions={header}>
        <EmptyState
          icon={Globe2}
          title="Accent training needs listening scripts"
          description="Install a content pack with listening parts. Each script can then be re-voiced in another accent — the questions stay the same."
          action={<Button onClick={() => navigate("/listening")}>Back to Listening</Button>}
        />
      </PageShell>
    );
  }
  if (rendered.length === 0) {
    return (
      <PageShell title="Accent training" actions={header}>
        <EmptyState
          icon={Headphones}
          title="Nothing is rendered yet"
          description="Prepare the audio for a listening part first — accent training compares that recording against the same script in another accent."
          action={<Button onClick={() => navigate("/listening")}>Choose a part</Button>}
        />
      </PageShell>
    );
  }

  const variantState = script ? prepare[`script:${script.id}:${accent}`] : undefined;
  const accentLabel = ACCENTS.find((a) => a.value === accent)?.label ?? accent;

  return (
    <PageShell
      title="Accent training"
      description="The same script, re-voiced. IELTS uses several accents, so train your ear on all of them."
      actions={header}
    >
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Choose a part and an accent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="block text-[13px] font-medium">Script</span>
                <Select
                  value={scriptId}
                  onChange={setScriptId}
                  aria-label="Listening script"
                  options={rendered.map((s) => ({
                    value: s.id,
                    label: `Part ${s.part} — ${s.title}`,
                  }))}
                />
              </div>
              <div className="space-y-1.5">
                <span className="block text-[13px] font-medium">Re-voice as</span>
                <Select
                  value={accent}
                  onChange={setAccent}
                  aria-label="Accent"
                  options={ACCENTS}
                />
              </div>
            </div>
            {script && (
              <p className="text-[13px] text-muted-foreground">
                Recorded in{" "}
                <span className="font-medium text-foreground">{script.audio.accent_label}</span>.
                Re-rendering as {accentLabel} generates a second recording locally and caches it —
                the questions and answers do not change.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void renderVariant()} loading={Boolean(variantState?.running)}>
                <Repeat className="h-4 w-4" />
                Render in {accentLabel.split(" (")[0]}
              </Button>
              {variantState?.running && (
                <span className="text-[12px] text-muted-foreground">
                  {variantState.detail || "working…"}
                </span>
              )}
            </div>
            {drillError && (
              <p role="alert" className="text-[13px] font-medium text-destructive">
                {drillError}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <VersionCard
            title="As recorded"
            subtitle={script?.audio.accent_label ?? ""}
            src={originalSrc}
            audioRef={originalRef}
            active={comparing}
          />
          <VersionCard
            title="Re-voiced"
            subtitle={accentLabel}
            src={variantSrc}
            audioRef={variantRef}
            active={comparing}
            empty={
              <div className="space-y-2">
                <p className="text-[13px] text-muted-foreground">
                  Nothing rendered in this accent yet.
                </p>
                {script && (
                  <PrepareAudioPanel
                    targetId={script.id}
                    kind="script"
                    accentSet={accent}
                    ready={false}
                    onDone={() => void renderVariant()}
                  />
                )}
              </div>
            }
          />
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <Button
              variant={comparing ? "outline" : "primary"}
              onClick={comparing ? clearCompare : compare}
              disabled={!originalSrc || !variantSrc}
            >
              <Repeat className="h-4 w-4" />
              {comparing ? "Stop comparing" : `Compare ${COMPARE_SECONDS} seconds`}
            </Button>
            <span className="text-[13px] text-muted-foreground">
              Plays {COMPARE_SECONDS} seconds of the original from wherever you paused it, then the
              same {COMPARE_SECONDS} seconds re-voiced.
            </span>
            {script && (
              <Button
                variant="ghost"
                onClick={() => navigate(`/listening/part/${script.id}?mode=practice`)}
              >
                Answer this part&rsquo;s questions
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function VersionCard({
  title,
  subtitle,
  src,
  audioRef,
  active,
  empty,
}: {
  title: string;
  subtitle: string;
  src: string | null;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  active: boolean;
  empty?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border bg-card p-3",
        active ? "border-primary/50" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <Badge tone="outline">{subtitle}</Badge>
      </div>
      {src ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- ear-training drill; the script text is on the practice screen
        <audio ref={audioRef} src={src} controls preload="metadata" className="w-full" />
      ) : (
        (empty ?? <div className="h-10 animate-pulse rounded-lg bg-muted" aria-hidden="true" />)
      )}
    </div>
  );
}

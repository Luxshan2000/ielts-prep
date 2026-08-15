import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui";
import { PlacementResultView } from "./components/PlacementResultView";
import { PlacementRunner } from "./components/PlacementRunner";
import { WizardChrome } from "./components/WizardChrome";
import {
  StepEngines,
  StepExam,
  StepLevel,
  StepMic,
  StepModels,
  StepPlacementOffer,
  StepWelcome,
  examStepValid,
  levelStepValid,
} from "./components/steps";
import { ESCAPE_HATCH_FROM_INDEX, WIZARD_STEPS, useOnboardingStore } from "./store";

const STEP_TITLES: Record<(typeof WIZARD_STEPS)[number], { title: string; description: string }> = {
  welcome: {
    title: "Welcome to BandReady",
    description: "Local-first IELTS preparation. Let's set up your plan.",
  },
  exam: {
    title: "Which test, and what are you aiming for?",
    description: "The format changes Task 1 and the reading passages; the target band drives the plan.",
  },
  level: {
    title: "Your starting point and your week",
    description: "An honest self-rating and a realistic time budget beat an ambitious one.",
  },
  engines: {
    title: "Marking your writing and speaking",
    description:
      "This is the one thing BandReady cannot do on its own. You can also leave it for later.",
  },
  models: {
    title: "Speaking practice files",
    description: "Downloaded once, verified, and resumable. You can continue while they run.",
  },
  mic: {
    title: "Microphone check",
    description: "Only the Speaking room needs this — everything else works without a mic.",
  },
  "placement-offer": {
    title: "Take the placement test?",
    description: "About 30 minutes, and every section can be skipped on its own.",
  },
};

const STEP_NAMES = WIZARD_STEPS.map((step) => STEP_TITLES[step].title);

/**
 * The first-run wizard (10 §2) and the placement sitting (10 §3).
 *
 * Hidden from the sidebar (no `label` on the route) but always reachable at
 * `/onboarding`, because retaking placement and re-editing the profile are
 * first-class actions, not a one-shot funnel.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const {
    phase,
    stepIndex,
    draft,
    error,
    busy,
    result,
    setDraft,
    next,
    back,
    clearError,
    startPlacement,
    skipPlacement,
    deferEntirely,
  } = useOnboardingStore();

  if (phase === "result" && result) {
    return <PlacementResultView result={result} />;
  }

  if (phase === "placement") {
    return <PlacementRunner />;
  }

  const step = WIZARD_STEPS[stepIndex];
  const copy = STEP_TITLES[step];
  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  const canContinue =
    step === "exam" ? examStepValid(draft) : step === "level" ? levelStepValid(draft) : true;

  // Two escape hatches with opposite consequences, so they must not sound alike:
  // step 1's writes nothing at all, the later one commits the profile and builds
  // a plan from the self-rating.
  const escapeHatch =
    stepIndex >= ESCAPE_HATCH_FROM_INDEX && !isLast ? (
      <Button
        variant="ghost"
        size="sm"
        loading={busy}
        disabled={!canContinue}
        onClick={() => void skipPlacement()}
      >
        Finish now, skip the placement test
      </Button>
    ) : stepIndex === 0 ? (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          deferEntirely();
          navigate("/", { replace: true });
        }}
      >
        Not now — take me to the app
      </Button>
    ) : null;

  return (
    <WizardChrome
      stepIndex={stepIndex}
      stepCount={WIZARD_STEPS.length}
      stepNames={STEP_NAMES}
      title={copy.title}
      description={copy.description}
      error={error}
      onDismissError={clearError}
      escapeHatch={escapeHatch}
      onBack={stepIndex > 0 ? back : undefined}
      onNext={isLast ? undefined : next}
      nextDisabled={!canContinue}
      footer={
        isLast ? (
          <>
            <Button variant="outline" loading={busy} onClick={() => void skipPlacement()}>
              Skip — start from my self-rating
            </Button>
            {/* A failure leaves `phase` on "wizard", so the error banner above
                stays visible — never clear it by re-entering the step. */}
            <Button loading={busy} onClick={() => void startPlacement()}>
              Take the placement test
            </Button>
          </>
        ) : undefined
      }
    >
      {step === "welcome" && <StepWelcome />}
      {step === "exam" && <StepExam draft={draft} setDraft={setDraft} />}
      {step === "level" && <StepLevel draft={draft} setDraft={setDraft} />}
      {step === "engines" && <StepEngines />}
      {step === "models" && <StepModels />}
      {step === "mic" && <StepMic />}
      {step === "placement-offer" && <StepPlacementOffer draft={draft} />}
    </WizardChrome>
  );
}

export default OnboardingPage;

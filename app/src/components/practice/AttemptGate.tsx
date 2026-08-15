import type { ReactNode } from "react";
import { Lock, Timer } from "lucide-react";
import { EmptyState } from "@/components/ui";

/**
 * The gate, drawn once.
 *
 * Model answers, transcripts and worked solutions stay shut until a real attempt exists, and
 * the coach is shut for the length of a mock. Both are enforced on the sidecar — this component
 * is only the door the learner meets, and the reason it lives here is that the door had grown
 * four different faces: a centred `Card` with its own heading in the reading coach, an
 * `EmptyState` in the speaking teaching pane, a muted paragraph in the writing hub, an inline
 * line in the listening transcript. Same rule, four shapes, four wordings — so it read as four
 * unrelated restrictions rather than one promise the app keeps everywhere.
 *
 * The wording of the *title* belongs to this component so it cannot drift. The `reason` belongs
 * to the screen, because only the screen knows what the learner has to do to open it, and "what
 * to do next" is the part a learner acts on.
 *
 * Nothing here decides whether the gate is shut. Pass `locked` from the server's own answer —
 * a client-side guess about an attempt is how a gate quietly stops holding.
 */
export interface AttemptGateProps {
  /** From the server. When false the children render with no wrapper of any kind. */
  locked: boolean;
  /**
   * `attempt` — hidden until this learner has had a go (the default, and the common case).
   * `mock` — hidden for the duration of a mock, and back afterwards.
   */
  variant?: "attempt" | "mock";
  /**
   * Why it is shut and how to open it, in one sentence a learner can act on:
   * "Answer this passage — three questions is enough — and the worked solutions open here."
   */
  reason: string;
  /** The way to earn it: one button, the thing that produces the attempt. */
  action?: ReactNode;
  /**
   * What the learner can still read right now. The gate is narrow on purpose and saying so is
   * what stops it reading as a paywall: "The map, the strategy and the vocabulary stay open."
   */
  stillOpen?: string;
  children: ReactNode;
  className?: string;
}

const TITLES = {
  attempt: "Have a go first",
  mock: "Closed while the mock is running",
} as const;

/**
 * Why the gate exists, in the learner's terms rather than the product's. Shown under the
 * screen's own reason so every locked panel gives the same account of itself.
 */
const RATIONALE = {
  attempt:
    "A model answer read before your own attempt becomes a script to memorise, and memorised language is the one thing the band descriptors refuse to credit.",
  mock: "A mock is only worth sitting if it measures you alone. Everything here reopens the moment you finish.",
} as const;

export function AttemptGate({
  locked,
  variant = "attempt",
  reason,
  action,
  stillOpen,
  children,
  className,
}: AttemptGateProps) {
  if (!locked) return <>{children}</>;

  return (
    <div className={className}>
      <EmptyState
        icon={variant === "mock" ? Timer : Lock}
        title={TITLES[variant]}
        description={reason}
        action={
          <div className="flex flex-col items-center gap-3">
            {action}
            <p className="max-w-md text-[12px] leading-5 text-muted-foreground">
              {RATIONALE[variant]}
              {stillOpen ? ` ${stillOpen}` : ""}
            </p>
          </div>
        }
      />
    </div>
  );
}

export default AttemptGate;

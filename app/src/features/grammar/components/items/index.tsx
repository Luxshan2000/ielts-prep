/**
 * One item, whichever of the fourteen kinds it is.
 *
 * `discover` is deliberately not a session card: it is a screen inside the first
 * meeting of a point (`teach.discovery`), so if the queue ever hands one over,
 * the learner gets the honest version — the prompt, and a way past it — rather
 * than a broken card. Same for a kind this build has never heard of: show what
 * we have, let them continue, and never trap a session on a renderer.
 */

import { Button } from "@/components/ui";
import {
  BothOkItem,
  ChooseFormItem,
  ContrastPairItem,
  InterpretItem,
  JudgeItem,
} from "./ChoiceItems";
import { CombineItem, ProduceItem, SpeakingDrillItem } from "./ProduceItems";
import { DictationItem, ErrorFixItem, GapFillItem, OrderItem, TransformItem } from "./TextItems";
import type { ItemViewProps } from "./shared";

export type { ItemViewProps } from "./shared";

export interface ItemDispatchProps extends ItemViewProps {
  /** Logged, never punished — a replay is evidence about the item, not the learner. */
  onReplay: () => void;
}

export function ItemView({ onReplay, ...props }: ItemDispatchProps) {
  switch (props.item.kind) {
    case "interpret":
      return <InterpretItem {...props} />;
    case "choose_form":
      return <ChooseFormItem {...props} />;
    case "judge":
      return <JudgeItem {...props} />;
    case "both_ok":
      return <BothOkItem {...props} />;
    case "contrast_pair":
      return <ContrastPairItem {...props} />;
    case "gap_fill":
      return <GapFillItem {...props} />;
    case "transform":
      return <TransformItem {...props} />;
    case "error_fix":
      return <ErrorFixItem {...props} />;
    case "order":
      return <OrderItem {...props} />;
    case "dictation":
      return <DictationItem {...props} onReplay={onReplay} />;
    case "produce":
      return <ProduceItem {...props} />;
    case "combine":
      return <CombineItem {...props} />;
    case "speaking_drill":
      return <SpeakingDrillItem {...props} />;
    case "discover":
    default:
      return (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            {props.item.payload.prompt_text ??
              props.item.payload.question ??
              "This one belongs on the lesson screen rather than in a practice set."}
          </p>
          {!props.attempt.revealed && (
            <Button size="sm" variant="outline" disabled={props.disabled} onClick={() => props.onAnswer(null)}>
              Continue
            </Button>
          )}
        </div>
      );
  }
}

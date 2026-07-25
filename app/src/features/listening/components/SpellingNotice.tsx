import { SpellCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 07 §5 makes this a product requirement, not decoration: listening answers are
 * marked spelling-strict, so the learner must be told before they type.
 */
export function SpellingNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3",
        className,
      )}
    >
      <SpellCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-[13px] leading-relaxed text-foreground">
        <span className="font-semibold">Spelling is marked.</span>{" "}
        <span className="text-muted-foreground">
          A misspelled answer is wrong, exactly as in the real exam. British and American
          spellings are both accepted, and so is a digit in place of a written number.
        </span>
      </p>
    </div>
  );
}

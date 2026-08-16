import { cn } from "@/lib/cn";

/**
 * Where you are in a set of questions.
 *
 * The same fact was written three ways and put in three places: the listening drills buried it
 * third in a row of badges, reading pushed it to the right edge beside Stop, and speaking put
 * it in the far corner. It is the first thing you look for when a question appears, so it goes
 * first, and it looks the same in every room.
 *
 * `index` is zero based, which is what every caller already has.
 */
export function StepCount({
  index,
  total,
  className,
}: {
  index: number;
  total: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md bg-muted px-2 py-0.5 text-[12px] font-medium tabular text-foreground",
        className,
      )}
      // Read as a sentence rather than as "one of ten", which a screen reader
      // otherwise says as a fraction.
      aria-label={`Question ${index + 1} of ${total}`}
    >
      {index + 1} of {total}
    </span>
  );
}

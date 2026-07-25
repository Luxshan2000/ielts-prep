import { cn } from "@/lib/cn";

/**
 * 12 §9: page loads use skeletons, never spinners. The shimmer is an absolutely
 * positioned gradient child so the block itself keeps its final size.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative overflow-hidden rounded-md bg-muted", className)}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/** Keeps the chart's final aspect ratio so nothing shifts when data lands. */
export function SkeletonChart({
  className,
  aspect = "aspect-[16/9]",
}: {
  className?: string;
  aspect?: string;
}) {
  return <Skeleton className={cn("w-full rounded-xl", aspect, className)} />;
}

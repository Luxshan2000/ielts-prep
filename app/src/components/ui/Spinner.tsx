import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden="true" />
      <span className={label ? "text-[13px] text-muted-foreground" : "sr-only"}>
        {label ?? "Loading"}
      </span>
    </span>
  );
}

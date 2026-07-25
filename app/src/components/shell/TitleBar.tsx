import { Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { WindowControlAction } from "@/vite-env";

export interface TitleBarProps {
  /** Defaults to "BandReady"; mock-exam mode passes "Mock Test — do not close". */
  title?: string;
  /** Called instead of closing directly — lets a timed test guard the close. */
  onRequestClose?: () => void;
  className?: string;
}

function platform(): "darwin" | "win32" | "linux" {
  if (typeof window === "undefined") return "darwin";
  if (window.bandready?.platform) return window.bandready.platform;
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "win32";
  if (ua.includes("Mac")) return "darwin";
  return "linux";
}

function control(action: WindowControlAction): void {
  window.bandready?.windowControl?.(action);
}

/**
 * 12 §5. macOS uses `titleBarStyle: 'hiddenInset'` — no bar, just a 36px drag
 * strip whose left padding clears the traffic lights. Windows/Linux use
 * `frame: false` plus these custom buttons.
 */
export function TitleBar({ title = "BandReady", onRequestClose, className }: TitleBarProps) {
  const os = platform();
  const mac = os === "darwin";

  return (
    <div
      className={cn(
        "titlebar flex h-9 shrink-0 select-none items-center border-b border-border bg-sidebar",
        mac ? "pl-[76px] pr-3" : "pl-3 pr-0",
        className,
      )}
      onDoubleClick={() => control("maximize-toggle")}
    >
      <span className="truncate text-[11px] font-medium text-muted-foreground">{title}</span>

      {!mac && (
        <div className="no-drag ml-auto flex h-full items-stretch">
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => control("minimize")}
            className="flex h-9 w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Maximize"
            onClick={() => control("maximize-toggle")}
            className="flex h-9 w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => (onRequestClose ? onRequestClose() : control("close"))}
            className="flex h-9 w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

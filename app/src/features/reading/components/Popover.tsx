import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface PopoverProps {
  open: boolean;
  /** Viewport rect the popover points at (a selection or a marker button). */
  anchor: DOMRect | null;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  title?: ReactNode;
  width?: number;
  className?: string;
  children: ReactNode;
}

const MARGIN = 8;

/**
 * A small anchored dialog for the passage tools (dictionary, note, selection
 * toolbar). Portalled so the passage pane's `overflow-y: auto` can't clip it;
 * Escape closes, an outside pointer-down closes, and focus moves inside on open
 * and returns to the previously focused element on close.
 */
export function Popover({
  open,
  anchor,
  onClose,
  label,
  title,
  width = 320,
  className,
  children,
}: PopoverProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const place = useCallback(() => {
    if (!anchor || !panel.current) return;
    const rect = panel.current.getBoundingClientRect();
    const height = rect.height || 160;
    const belowSpace = window.innerHeight - anchor.bottom;
    const top =
      belowSpace > height + MARGIN
        ? anchor.bottom + MARGIN
        : Math.max(MARGIN, anchor.top - height - MARGIN);
    const left = Math.min(
      Math.max(MARGIN, anchor.left + anchor.width / 2 - width / 2),
      Math.max(MARGIN, window.innerWidth - width - MARGIN),
    );
    setPosition({ top, left });
  }, [anchor, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // `open` alone is not enough: the render below bails out when there is no
  // anchor, so an "open but unanchored" popover would install document-level
  // handlers while showing nothing — and its Escape handler (which stops
  // propagation) would then swallow the keypress meant for the popover the
  // learner can actually see. Both effects therefore track `open && anchor`,
  // exactly the condition under which the panel exists.
  const mounted = open && Boolean(anchor);

  useEffect(() => {
    if (!mounted) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const focusable = node?.querySelector<HTMLElement>(
      "button:not([disabled]), textarea, input, [href], select, [tabindex]:not([tabindex='-1'])",
    );
    (focusable ?? node)?.focus({ preventScroll: true });
    return () => {
      restoreTo.current?.focus?.({ preventScroll: true });
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) onClose();
    };
    const onScrollOrResize = () => place();
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [mounted, onClose, place]);

  if (!open || !anchor || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={{ top: position.top, left: position.left, width }}
      className={cn(
        "fixed z-[70] rounded-xl border border-border bg-card text-card-foreground shadow-xl",
        "animate-fade-in focus:outline-none",
        className,
      )}
    >
      {title !== undefined && (
        <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0 text-[13px] font-semibold">{title}</div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </header>
      )}
      {children}
    </div>,
    document.body,
  );
}

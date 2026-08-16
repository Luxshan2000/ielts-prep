import { Fragment, type MutableRefObject, type ReactNode } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  // Wide enough for a dialog that holds a rail beside its content. Settings is the one
  // of those, and at max-w-3xl its provider cards lost a third of their width.
  "2xl": "max-w-4xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  onBack?: () => void;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
  initialFocus?: MutableRefObject<HTMLElement | null>;
  /**
   * Classes for the body wrapper, merged over its defaults. The body scrolls as one
   * column by default; a dialog that puts a fixed rail next to a scrolling pane has to
   * turn that off, or the rail scrolls away with the content beside it.
   */
  bodyClassName?: string;
}

/**
 * The single dialog primitive — HeadlessUI `Dialog` + `Transition` gives focus
 * trap, Escape, scroll-lock and a11y. No hand-rolled overlays anywhere.
 */
export function Modal({
  open,
  onClose,
  title,
  onBack,
  size = "md",
  footer,
  children,
  initialFocus,
  bodyClassName,
}: ModalProps) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} initialFocus={initialFocus} className="relative z-50">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0 scale-[0.98]"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-[0.98]"
          >
            <DialogPanel
              className={cn(
                "flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl",
                SIZES[size],
              )}
            >
              {title !== undefined && (
                <header className="flex items-center justify-between gap-3 border-b border-border p-5">
                  <div className="flex min-w-0 items-center gap-2">
                    {onBack && (
                      <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    )}
                    <DialogTitle className="truncate text-sm font-semibold">{title}</DialogTitle>
                  </div>
                  <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                    <X className="h-4 w-4" />
                  </Button>
                </header>
              )}

              <div
                className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto", bodyClassName)}
              >
                {children}
              </div>

              {footer && (
                <footer className="flex items-center justify-end gap-2 border-t border-border p-5">
                  {footer}
                </footer>
              )}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}

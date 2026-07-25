import { Fragment, type ReactNode } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Tailwind max-width class. */
  width?: string;
  side?: "left" | "right";
  footer?: ReactNode;
  children: ReactNode;
}

/** Slide-over panel for inspectors and side panes that shouldn't take the screen. */
export function Drawer({
  open,
  onClose,
  title,
  width = "max-w-md",
  side = "right",
  footer,
  children,
}: DrawerProps) {
  const closed = side === "right" ? "translate-x-full" : "-translate-x-full";
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        </TransitionChild>

        <div
          className={cn("fixed inset-0 flex", side === "right" ? "justify-end" : "justify-start")}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom={closed}
            enterTo="translate-x-0"
            leave="ease-in duration-150"
            leaveFrom="translate-x-0"
            leaveTo={closed}
          >
            <DialogPanel
              className={cn(
                "flex h-full w-full flex-col bg-card shadow-xl",
                side === "right" ? "border-l border-border" : "border-r border-border",
                width,
              )}
            >
              {title !== undefined && (
                <header className="flex items-center justify-between gap-3 border-b border-border p-4">
                  <DialogTitle className="truncate text-sm font-semibold">{title}</DialogTitle>
                  <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                    <X className="h-4 w-4" />
                  </Button>
                </header>
              )}
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
              {footer && (
                <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
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

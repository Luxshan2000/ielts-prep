import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface ConfirmOptions {
  title?: string;
  /** Body text (or nodes) explaining the consequence. */
  message?: ReactNode;
  /** Verb-first, per 12 §9 ("Delete profile", never "OK"). */
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export type ConfirmFn = (opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based confirmation dialog replacing window.confirm().
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "End your mock test?", destructive: true }))) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  // `opts` goes null the instant the dialog is settled, but HeadlessUI keeps the panel
  // mounted through its leave transition. Rendering `opts` directly made the dialog
  // visibly swap to the generic fallback ("Are you sure?" / "Confirm") on the way out,
  // so keep showing the copy the caller asked for until it is actually gone.
  const lastOpts = useRef<ConfirmOptions>({});
  if (opts !== null) lastOpts.current = opts;
  const shown = opts ?? lastOpts.current;

  const confirm = useCallback<ConfirmFn>(
    (options = {}) =>
      new Promise<boolean>((resolve) => {
        // A second confirm() while one is still open would otherwise overwrite the
        // pending resolver, leaving the first caller awaiting a promise that can never
        // settle. Decline it instead, so `if (!(await confirm(...))) return;` unwinds.
        resolver.current?.(false);
        resolver.current = resolve;
        setOpts(options);
      }),
    [],
  );

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={opts !== null}
        onClose={() => settle(false)}
        title={shown.title ?? "Are you sure?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>
              {shown.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={shown.destructive ? "destructive" : "primary"}
              onClick={() => settle(true)}
            >
              {shown.confirmLabel ?? (shown.destructive ? "Delete" : "Confirm")}
            </Button>
          </>
        }
      >
        <div className="p-5 text-sm text-muted-foreground">
          {shown.message ?? "This action cannot be undone."}
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

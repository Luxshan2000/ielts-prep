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

  const confirm = useCallback<ConfirmFn>(
    (options = {}) =>
      new Promise<boolean>((resolve) => {
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
        title={opts?.title ?? "Are you sure?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>
              {opts?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={opts?.destructive ? "destructive" : "primary"}
              onClick={() => settle(true)}
            >
              {opts?.confirmLabel ?? (opts?.destructive ? "Delete" : "Confirm")}
            </Button>
          </>
        }
      >
        <div className="p-5 text-sm text-muted-foreground">
          {opts?.message ?? "This action cannot be undone."}
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

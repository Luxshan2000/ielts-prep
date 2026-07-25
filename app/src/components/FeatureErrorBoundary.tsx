import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

export interface FeatureErrorBoundaryProps {
  /** Shown in the heading, e.g. "reading test" → "The reading test hit an error". */
  feature: string;
  /**
   * Called when the learner chooses "Reload this screen". Use it to reset the
   * feature's store so the retry starts from a clean slate; when omitted the
   * boundary just re-renders its children.
   */
  onReset?: () => void;
  /** Extra guidance specific to the feature (e.g. "your answers were saved"). */
  hint?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A boundary for the heavy test players (reading, listening, live speaking).
 *
 * The app-level boundary in `App.tsx` catches these too, but it replaces the whole
 * routed area, so a crash in a question renderer looks like the app broke. Wrapping
 * each player keeps the shell, the sidebar and the learner's bearings intact, and
 * scopes the retry to just the player.
 */
export class FeatureErrorBoundary extends Component<FeatureErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[BandReady] ${this.props.feature} crashed`,
      error,
      info.componentStack,
    );
  }

  private handleReset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div
          role="alert"
          className="w-full max-w-lg space-y-4 rounded-2xl border border-destructive/40 bg-card p-6"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                The {this.props.feature} hit an error
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {this.props.hint ??
                  "Your progress is saved on the local sidecar, so nothing is lost. Reloading this screen usually clears it."}
              </p>
            </div>
          </div>

          <details className="rounded-lg border border-border bg-muted/40 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Technical details
            </summary>
            <pre className="scrollbar-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-destructive">
              {error.stack ?? `${error.name}: ${error.message}`}
            </pre>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button onClick={this.handleReset}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload this screen
            </Button>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go back
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default FeatureErrorBoundary;

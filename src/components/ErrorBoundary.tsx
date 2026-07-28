import { Component, type ErrorInfo, type ReactNode } from "react";
import { logEvent } from "../logging";

/**
 * Render-prop signature for a custom fallback. Receives the captured error
 * and a reset callback the fallback can invoke (in addition to the built-in
 * Retry button) when it has its own recovery affordance.
 */
export interface ErrorBoundaryFallbackProps {
  error: Error;
  scope: string;
  reset: () => void;
}

interface ErrorBoundaryProps {
  /**
   * Human-readable identifier for where this boundary sits (e.g.
   * `"app-shell"`, `"screen:dreamscape"`, `"overlay:card-source"`). Included
   * in the `error_boundary_caught` log entry and surfaced on
   * `window.__caps.errors` so browser-QA can tell which boundary caught what.
   */
  scope: string;
  children: ReactNode;
  /**
   * When this value changes between renders, the boundary clears its error
   * state and attempts to render `children` again. The per-screen boundary
   * passes `state.screen.type` so that navigating away resets the boundary
   * automatically.
   */
  resetKey?: unknown;
  /**
   * Optional render-prop fallback. When provided, it replaces the default
   * dark-theme fallback panel. The default fallback is sufficient for most
   * boundaries; pass a custom one when an overlay needs to use its own
   * sizing/positioning.
   */
  fallback?: (props: ErrorBoundaryFallbackProps) => ReactNode;
  /**
   * Invoked when the user clicks the built-in Retry button. The boundary
   * always clears its internal error state on Retry; `onRetry` is for the
   * parent to additionally re-fetch data, close an overlay, etc.
   */
  onRetry?: () => void;
  /**
   * Invoked when the user clicks the built-in Close button (only shown when
   * this prop is supplied). The boundary still clears its internal error
   * state so the consumer can decide whether to unmount or just dismiss.
   */
  onClose?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

interface CapsBuffer {
  errors: Array<{ msg: string; src?: string; scope?: string }>;
  rejections: unknown[];
  consoleErrors: unknown[];
}

function pushToCaps(scope: string, error: Error, info: ErrorInfo): void {
  if (typeof window === "undefined") {
    return;
  }
  const win = window as typeof window & { __caps?: CapsBuffer };
  if (!win.__caps) {
    win.__caps = { errors: [], rejections: [], consoleErrors: [] };
  }
  // First line of the React component stack identifies the failing element.
  const src = (info.componentStack ?? "").trim().split("\n")[0]?.trim() ?? "";
  win.__caps.errors.push({
    msg: `[ErrorBoundary:${scope}] ${error.message}`,
    src,
    scope,
  });
}

/**
 * React error boundary used at three levels of the app. Its default fallback is
 * the sole emergency-fallback presentation exemption: it deliberately imports
 * no Cumulus UI so it can still render when Cumulus itself has failed.
 *
 * 1. **App shell** (`scope="app-shell"`) wraps everything inside `App`. A
 *    crash here still produces a contained fallback panel rather than a
 *    blank `#root`.
 * 2. **Per-screen** (`scope="screen:<type>"`) wraps the `ScreenRouter`
 *    output and resets on `state.screen.type` change.
 * 3. **Per-overlay** (`scope="overlay:<name>"`) wraps each major overlay
 *    component (deck viewer, debug screen, card-source overlay) so an
 *    overlay crash leaves the underlying screen interactive.
 *
 * Boundaries only catch render-time errors. Event-handler and async errors
 * still need defensive try/catch at the call site.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // If the parent rotates `resetKey` (e.g. on screen change), clear any
    // captured error so the new children get a fresh render attempt.
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Funnel the failure through `logEvent` so it appears alongside other
    // journey events in `logs/journey-log.jsonl`. Browser-QA additionally reads
    // `window.__caps.errors`, so mirror the message there.
    logEvent("error_boundary_caught", {
      scope: this.props.scope,
      message: error.message,
      name: error.name,
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
    });
    pushToCaps(this.props.scope, error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  private readonly handleRetry = (): void => {
    this.reset();
    this.props.onRetry?.();
  };

  private readonly handleClose = (): void => {
    this.reset();
    this.props.onClose?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }

    if (this.props.fallback !== undefined) {
      return this.props.fallback({
        error,
        scope: this.props.scope,
        reset: this.reset,
      });
    }

    return (
      <div
        data-testid="error-boundary-fallback"
        data-error-boundary-scope={this.props.scope}
        role="alert"
        style={{
          margin: "1.5rem auto",
          maxWidth: "44rem",
          padding: "1.5rem",
          borderRadius: "0.75rem",
          border: "1px solid rgba(239, 68, 68, 0.55)",
          background: "rgba(30, 10, 12, 0.85)",
          color: "#fee2e2",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h2
          style={{
            margin: 0,
            marginBottom: "0.5rem",
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "#fecaca",
          }}
        >
          Something went wrong
        </h2>
        <p style={{ margin: 0, marginBottom: "1rem", opacity: 0.85 }}>
          This part of the screen hit an unexpected error. The rest of the app
          is still working. Try again, or close this and return to where you
          were.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            data-testid="error-boundary-retry"
            onClick={this.handleRetry}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              background: "#dc2626",
              color: "#fff",
              border: "none",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
          {this.props.onClose !== undefined && (
            <button
              type="button"
              data-testid="error-boundary-close"
              onClick={this.handleClose}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                background: "transparent",
                color: "#fecaca",
                border: "1px solid rgba(254, 202, 202, 0.45)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }
}

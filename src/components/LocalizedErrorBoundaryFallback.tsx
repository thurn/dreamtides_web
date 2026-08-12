import type { ReactNode } from "react";
import { meaning, tx } from "@trox/runtime";
import { useLocalizer } from "../runtime/localization/use-localizer";

export function LocalizedErrorBoundaryFallback({
  scope,
  onRetry,
  onClose,
}: {
  readonly scope: string;
  readonly onRetry: () => void;
  readonly onClose?: () => void;
}): ReactNode {
  const resolve = useLocalizer();
  return (
    <div
      data-testid="error-boundary-fallback"
      data-error-boundary-scope={scope}
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
        {resolve(
          tx(
            "Something went wrong",
            "Heading for an unexpected render failure caught by an application error boundary.",
          ),
        )}
      </h2>
      <p style={{ margin: 0, marginBottom: "1rem", opacity: 0.85 }}>
        {resolve(
          tx(
            "This part of the screen hit an unexpected error. The rest of the app is still working. Try again, or close this and return to where you were.",
            "Explanation for an unexpected render failure; technical details appear separately when available.",
          ),
        )}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="error-boundary-retry"
          onClick={onRetry}
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
          {resolve(
            tx(
              "Retry",
              "Command that retries the failed application operation represented by the current error surface.",
            ),
          )}
        </button>
        {onClose !== undefined && (
          <button
            type="button"
            data-testid="error-boundary-close"
            onClick={onClose}
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
            {resolve(
              tx(
                meaning("error-boundary-close", "Close"),
                "Action that closes an application error boundary and returns to the previous surface.",
              ),
            )}
          </button>
        )}
      </div>
    </div>
  );
}

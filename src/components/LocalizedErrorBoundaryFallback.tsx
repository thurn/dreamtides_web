import type { ReactNode } from "react";

export function LocalizedErrorBoundaryFallback({
  scope,
  onRetry,
  onClose,
  onRecover,
}: {
  readonly scope: string;
  readonly onRetry: () => void;
  readonly onClose?: () => void;
  readonly onRecover?: () => void;
}): ReactNode {
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
        {"Something went wrong"}
      </h2>
      <p style={{ margin: 0, marginBottom: "1rem", opacity: 0.85 }}>
        {
          "This part of the screen hit an unexpected error. The rest of the app is still working. Try again, or close this and return to where you were."
        }
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
          {"Retry"}
        </button>
        {onRecover !== undefined && (
          <button
            type="button"
            data-testid="error-boundary-recover"
            onClick={onRecover}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {"Recover Game"}
          </button>
        )}
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
            {"Close"}
          </button>
        )}
      </div>
    </div>
  );
}

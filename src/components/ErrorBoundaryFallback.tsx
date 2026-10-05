import { useState, type CSSProperties, type ReactNode } from "react";
import { useLocalGameControls } from "../session/game-controls";

type ExportState = "idle" | "exporting" | "exported" | "failed";

const EXPORT_STATUS_COPY: Record<ExportState, string | null> = {
  idle: null,
  exporting: "Exporting the game log…",
  exported: "Game log downloaded.",
  failed: "The game log could not be exported.",
};

const SECONDARY_BUTTON_STYLE: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  background: "transparent",
  color: "#fecaca",
  border: "1px solid rgba(254, 202, 202, 0.45)",
  fontWeight: 500,
  cursor: "pointer",
};

/**
 * The error boundary's default fallback. Inside a local game it also offers
 * Export Log, which downloads the game's journey log, and Recover Game, which
 * reloads the game from storage.
 */
export function DefaultErrorBoundaryFallback({
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
  const controls = useLocalGameControls();
  const [exportState, setExportState] = useState<ExportState>("idle");
  const recover =
    onRecover ??
    (controls === null
      ? undefined
      : () => void controls.recover({ source: "error_boundary", scope }));
  const exportLog =
    controls === null
      ? undefined
      : () => {
          setExportState("exporting");
          controls.exportLog({ source: "error_boundary", scope }).then(
            () => setExportState("exported"),
            () => setExportState("failed"),
          );
        };
  const exportStatus = EXPORT_STATUS_COPY[exportState];
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
        {recover !== undefined && (
          <button
            type="button"
            data-testid="error-boundary-recover"
            onClick={recover}
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
        {exportLog !== undefined && (
          <button
            type="button"
            data-testid="error-boundary-export-log"
            onClick={exportLog}
            disabled={exportState === "exporting"}
            style={SECONDARY_BUTTON_STYLE}
          >
            {"Export Log"}
          </button>
        )}
        {onClose !== undefined && (
          <button
            type="button"
            data-testid="error-boundary-close"
            onClick={onClose}
            style={SECONDARY_BUTTON_STYLE}
          >
            {"Close"}
          </button>
        )}
      </div>
      {exportStatus !== null && (
        <p
          data-testid="error-boundary-export-status"
          data-export-state={exportState}
          role="status"
          style={{ margin: 0, marginTop: "0.75rem", opacity: 0.85 }}
        >
          {exportStatus}
        </p>
      )}
    </div>
  );
}

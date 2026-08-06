import type { ReactElement } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { Pressable } from "../../primitives/Pressable";
import { SAFE_AREA_INSET_PROPERTIES } from "../../primitives/safe-area";
import { token } from "../../primitives/tokens";

/** Semantic severity for a short-lived player status. */
export type TransientStatusVariant = "notice" | "warning" | "error";

/** Structured text for a transient status; presentation owns its layout. */
export interface TransientStatusCopy {
  readonly title?: string;
  readonly message: string;
}

export interface TransientStatusToastProps {
  /** Semantic severity for the status material and assistive announcement. */
  readonly variant: TransientStatusVariant;
  /** Structured player-facing copy. */
  readonly copy: TransientStatusCopy;
  /** Optional dismissal callback; lifecycle ownership remains outside Cumulus. */
  readonly onDismiss?: () => void;
}

/**
 * Fixed-position Cumulus transient status. Its placement, safe-area clearance,
 * press feedback, and visual material are internal; controllers only select a
 * semantic severity, structured copy, and optional dismissal callback.
 */
export function TransientStatusToast({
  variant,
  copy,
  onDismiss,
}: TransientStatusToastProps): ReactElement {
  const alertRole = variant === "notice" ? "status" : "alert";
  return (
    <Pressable
      as="button"
      data-transient-status-toast={variant}
      data-coop-bounce-toast={variant === "warning" ? "" : undefined}
      aria-live={variant === "notice" ? "polite" : "assertive"}
      aria-label={onDismiss === undefined ? undefined : "Dismiss status"}
      disabled={onDismiss === undefined}
      onClick={onDismiss}
      style={{
        ...glassSurfaceStyle({ radius: token("--radius-panel") }),
        position: "fixed",
        zIndex: 60,
        bottom: `max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${token("--space-l")})`,
        left: "50%",
        width: "min(90vw, 416px)",
        boxSizing: "border-box",
        padding: token("--space-m"),
        color: variant === "error" ? token("--danger") : token("--text-on-glass"),
        textAlign: "center",
        transform: "translateX(-50%)",
      }}
    >
      <span role={alertRole} style={{ display: "grid", gap: token("--space-xs") }}>
        {copy.title !== undefined && (
          <strong style={{ font: token("--t-button") }}>{copy.title}</strong>
        )}
        <span style={{ font: token("--t-body-sm") }}>{copy.message}</span>
      </span>
    </Pressable>
  );
}

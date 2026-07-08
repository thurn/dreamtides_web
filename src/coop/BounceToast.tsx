import type { ReactNode } from "react";

/**
 * Transient notice shown when THIS client's own optimistic intent bounced: a
 * partner's event committed first, so the board the player acted against has
 * changed and their action was discarded. The optimistic echo has already
 * rolled back (rollback IS recomputation in the LogClient); this toast makes
 * the rollback legible instead of silent (spec §Client layer, Bounce UX).
 *
 * Plain styling; the CoopProvider owns the show/auto-dismiss lifecycle and
 * renders this alongside `children`.
 */
export function BounceToast({ onDismiss }: { onDismiss?: () => void }): ReactNode {
  return (
    <div
      data-coop-bounce-toast
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        maxWidth: "min(90vw, 26rem)",
        padding: "0.75rem 1.25rem",
        borderRadius: "0.75rem",
        background: "rgba(24, 14, 38, 0.95)",
        border: "1px solid rgba(192, 132, 252, 0.5)",
        boxShadow: "0 8px 28px rgba(10, 6, 18, 0.55)",
        color: "#f1e9ff",
        fontSize: "0.95rem",
        fontWeight: 500,
        textAlign: "center",
        cursor: onDismiss ? "pointer" : "default",
      }}
    >
      Your partner acted first &mdash; the board has changed.
    </div>
  );
}

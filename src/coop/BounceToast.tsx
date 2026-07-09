import type { ReactNode } from "react";

/** Default copy: THIS client's own optimistic intent bounced (a partner acted first). */
export const BOUNCE_MESSAGE = "Your partner acted first — the board has changed.";
/** Copy for an intent whose append never reached the log. */
export const APPEND_FAILED_MESSAGE = "Action failed to send — try again.";
/** Copy for a reconnect that discarded unconfirmed intents on a full refold. */
export const PENDING_DROPPED_MESSAGE =
  "Connection recovered — unconfirmed actions were discarded.";

/**
 * Transient notice shown for a client-local coop hiccup: THIS client's own
 * optimistic intent bounced (a partner committed first), an append failed to
 * send, or a reconnect discarded unconfirmed intents. The optimistic echo has
 * already rolled back (rollback IS recomputation in the LogClient); this toast
 * makes the rollback legible instead of silent (spec §Client layer, Bounce UX).
 * The `message` selects the copy for the specific event.
 *
 * Plain styling; the CoopProvider owns the show/auto-dismiss lifecycle and
 * renders this alongside `children`.
 */
export function BounceToast({
  onDismiss,
  message = BOUNCE_MESSAGE,
}: {
  onDismiss?: () => void;
  message?: string;
}): ReactNode {
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
      {message}
    </div>
  );
}

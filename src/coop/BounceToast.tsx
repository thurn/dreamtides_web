import type { ReactNode } from "react";
import type { BounceReason } from "../eventlog/types";

/** Copy for a confirmed cross-client compare-and-swap conflict. */
export const PARTNER_CONFLICT_MESSAGE =
  "Action not applied: your partner changed the game first.";
/** Copy for an action rejected by its domain rules in the current state. */
export const INVALID_ACTION_MESSAGE =
  "Action not applied: it is not valid for the current game state.";
/** Copy for an intent whose append never reached the log. */
export const APPEND_FAILED_MESSAGE = "Action failed to send — try again.";
/** Copy for a reconnect that discarded unconfirmed intents on a full refold. */
export const PENDING_DROPPED_MESSAGE =
  "Connection recovered — unconfirmed actions were discarded.";

/** Select player-facing copy from the reducer's machine-readable bounce cause. */
export function bounceMessageForReason(reason: BounceReason | undefined): string {
  switch (reason) {
    case "partner_conflict":
      return PARTNER_CONFLICT_MESSAGE;
    case "prompt_pending":
      return "Action not applied: finish the current choice first.";
    case "unknown_conflict":
      return "Action not applied: the game changed before it was received. Try again.";
    case "fold_error":
    case "malformed_event":
      return "Action not applied because of an internal error. Please try again.";
    case "invalid_action":
    default:
      return INVALID_ACTION_MESSAGE;
  }
}

/**
 * Transient notice shown when this client's intent bounces, an append fails,
 * or a reconnect discards unconfirmed intents. The optimistic echo has already
 * rolled back (rollback IS recomputation in the LogClient); this toast names
 * the cause so the player knows whether to retry or finish another choice.
 *
 * Plain styling; the CoopProvider owns the show/auto-dismiss lifecycle and
 * renders this alongside `children`.
 */
export function BounceToast({
  onDismiss,
  message = INVALID_ACTION_MESSAGE,
}: {
  onDismiss?: () => void;
  message?: string;
}): ReactNode {
  return (
    <div
      data-coop-bounce-toast
      role="alert"
      aria-live="assertive"
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

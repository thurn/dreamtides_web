import type { ReactNode } from "react";
import { TransientStatusToast } from "../cumulus/components/status/TransientStatusToast";
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

/** Controller bridge from coop outcomes to Cumulus's transient status surface. */
export function BounceToast({
  onDismiss,
  message = INVALID_ACTION_MESSAGE,
}: {
  onDismiss?: () => void;
  message?: string;
}): ReactNode {
  return (
    <TransientStatusToast
      variant="warning"
      copy={{ message }}
      onDismiss={onDismiss}
    />
  );
}

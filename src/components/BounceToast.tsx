import type { ReactNode } from "react";
import { TransientStatusToast } from "../cumulus/components/status/TransientStatusToast";
import type { BounceReason } from "../eventlog/types";

/** Copy for an action rejected by its domain rules in the current state. */
export const INVALID_ACTION_MESSAGE: string =
  "Action not applied: it is not valid for the current game state.";
/** Copy for an action built against a game state that has since changed. */
export const STALE_ACTION_MESSAGE: string =
  "Action not applied: the game changed before it was received. Try again.";

/** Select player-facing copy from the reducer's machine-readable bounce cause. */
export function bounceMessageForReason(
  reason: BounceReason | undefined,
): string {
  switch (reason) {
    case "partner_conflict":
    case "unknown_conflict":
      return STALE_ACTION_MESSAGE;
    case "prompt_pending":
      return "Action not applied: finish the current choice first.";
    case "fold_error":
    case "malformed_event":
      return "Action not applied because of an internal error. Please try again.";
    case "invalid_action":
    default:
      return INVALID_ACTION_MESSAGE;
  }
}

/** Shows a bounced intent's outcome on Cumulus's transient status surface. */
export function BounceToast({
  onDismiss,
  message = INVALID_ACTION_MESSAGE,
}: {
  onDismiss?: () => void;
  message?: string;
}): ReactNode {
  return <TransientStatusToast copy={{ message }} onDismiss={onDismiss} />;
}

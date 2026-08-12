import type { ReactNode } from "react";
import { tx, type LocalizedString } from "@trox/runtime";
import { TransientStatusToast } from "../cumulus/components/status/TransientStatusToast";
import type { BounceReason } from "../eventlog/types";

/** Copy for a confirmed cross-client compare-and-swap conflict. */
export const PARTNER_CONFLICT_MESSAGE: LocalizedString = tx(
  "Action not applied: your partner changed the game first.",
  "Transient status after another player wins a compare-and-swap race for shared game state.",
);
/** Copy for an action rejected by its domain rules in the current state. */
export const INVALID_ACTION_MESSAGE: LocalizedString = tx(
  "Action not applied: it is not valid for the current game state.",
  "Transient status after the shared-game rules reject the player's action in the current state.",
);
/** Copy for an intent whose append never reached the log. */
export const APPEND_FAILED_MESSAGE: LocalizedString = tx(
  "Action failed to send — try again.",
  "Transient status after a shared-game action could not be appended to the room log.",
);
/** Copy for a reconnect that discarded unconfirmed intents on a full refold. */
export const PENDING_DROPPED_MESSAGE: LocalizedString = tx(
  "Connection recovered — unconfirmed actions were discarded.",
  "Transient status after reconnection discards shared-game actions that were never confirmed.",
);

/** Select player-facing copy from the reducer's machine-readable bounce cause. */
export function bounceMessageForReason(
  reason: BounceReason | undefined,
): LocalizedString {
  switch (reason) {
    case "partner_conflict":
      return PARTNER_CONFLICT_MESSAGE;
    case "prompt_pending":
      return tx(
        "Action not applied: finish the current choice first.",
        "Transient status when another shared-game choice must be resolved before this action.",
      );
    case "unknown_conflict":
      return tx(
        "Action not applied: the game changed before it was received. Try again.",
        "Transient status after an unclassified shared-game state conflict rejects the player's action.",
      );
    case "observer_read_only":
      return tx(
        "Action not applied: this playtest is controlled from another browser.",
        "Transient status when a read-only playtest observer attempts a player action.",
      );
    case "fold_error":
    case "malformed_event":
      return tx(
        "Action not applied because of an internal error. Please try again.",
        "Transient status after an internal fold or malformed shared-game event prevents the player's action.",
      );
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
  message?: LocalizedString;
}): ReactNode {
  return <TransientStatusToast copy={{ message }} onDismiss={onDismiss} />;
}

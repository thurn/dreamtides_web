import type { ReactNode } from "react";
import { TransientStatusToast } from "../cumulus/components/status/TransientStatusToast";
import type { BounceReason } from "../eventlog/types";

/** Copy for an action rejected by its domain rules in the current state. */
export const INVALID_ACTION_MESSAGE: string =
  "Action not applied: it is not valid for the current game state.";

/** Select player-facing copy from the reducer's machine-readable bounce cause. */
export function bounceMessageForReason(
  reason: BounceReason | undefined,
): string {
  switch (reason) {
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

/**
 * Shows a bounced intent's outcome on Cumulus's transient status surface.
 * `LocalGameProvider` mounts it beside the routed app tree, outside every
 * screen's `.cumulus` subtree, so it carries its own token scope; the scope
 * element generates no box, and the toast places itself.
 */
export function BounceToast({
  onDismiss,
  message = INVALID_ACTION_MESSAGE,
}: {
  onDismiss?: () => void;
  message?: string;
}): ReactNode {
  return (
    <div className="cumulus" data-bounce-toast="" style={{ display: "contents" }}>
      <TransientStatusToast copy={{ message }} onDismiss={onDismiss} />
    </div>
  );
}

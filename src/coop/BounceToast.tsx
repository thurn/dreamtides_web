import type { ReactNode } from "react";
import { TransientStatusToast } from "../cumulus/components/status/TransientStatusToast";
import type { BounceReason } from "../eventlog/types";
import { createMessageDescriptor } from "../data/localization-descriptors";
import type { FluentMessageDescriptor } from "../data/localization-messages";
import { formatMessageDescriptor, useMessages } from "../cumulus/hooks/use-messages";

/** Copy for a confirmed cross-client compare-and-swap conflict. */
export const PARTNER_CONFLICT_MESSAGE: FluentMessageDescriptor = createMessageDescriptor(
  "coop-bounce-partner-conflict",
);
/** Copy for an action rejected by its domain rules in the current state. */
export const INVALID_ACTION_MESSAGE: FluentMessageDescriptor = createMessageDescriptor(
  "coop-bounce-invalid-action",
);
/** Copy for an intent whose append never reached the log. */
export const APPEND_FAILED_MESSAGE: FluentMessageDescriptor = createMessageDescriptor(
  "coop-bounce-append-failed",
);
/** Copy for a reconnect that discarded unconfirmed intents on a full refold. */
export const PENDING_DROPPED_MESSAGE: FluentMessageDescriptor = createMessageDescriptor(
  "coop-bounce-pending-dropped",
);

/** Select player-facing copy from the reducer's machine-readable bounce cause. */
export function bounceMessageForReason(
  reason: BounceReason | undefined,
): FluentMessageDescriptor {
  switch (reason) {
    case "partner_conflict":
      return PARTNER_CONFLICT_MESSAGE;
    case "prompt_pending":
      return createMessageDescriptor("coop-bounce-prompt-pending");
    case "unknown_conflict":
      return createMessageDescriptor("coop-bounce-unknown-conflict");
    case "observer_read_only":
      return createMessageDescriptor("coop-bounce-observer-read-only");
    case "fold_error":
    case "malformed_event":
      return createMessageDescriptor("coop-bounce-internal-error");
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
  message?: FluentMessageDescriptor;
}): ReactNode {
  const t = useMessages();
  return (
    <TransientStatusToast
      copy={{ message: formatMessageDescriptor(t, message) }}
      onDismiss={onDismiss}
    />
  );
}

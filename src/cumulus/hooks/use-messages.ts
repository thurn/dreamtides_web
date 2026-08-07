import { useCallback } from "react";
import { useLocalization } from "@fluent/react";
import type {
  FluentMessageArguments,
  FluentMessageId,
} from "../../data/localization-messages";

export type MessageFormatter = <Id extends FluentMessageId>(
  id: Id,
  ...arguments_: FluentMessageArguments<Id>
) => string;

/** Returns the app's concise, message-ID-safe Fluent formatter. */
export function useMessages(): MessageFormatter {
  const { l10n } = useLocalization();

  return useCallback(
    <Id extends FluentMessageId>(
      id: Id,
      ...arguments_: FluentMessageArguments<Id>
    ) => l10n.getString(id, arguments_[0]),
    [l10n],
  );
}

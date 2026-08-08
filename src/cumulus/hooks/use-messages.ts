import { useCallback } from "react";
import { useLocalization } from "@fluent/react";
import { appLocalization } from "../../data/localization";
import type {
  FluentMessageArguments,
  FluentMessageId,
} from "../../data/localization-messages";
import {
  isFluentMessageDescriptor,
} from "../../data/localization-descriptors";

export type MessageFormatter = <Id extends FluentMessageId>(
  id: Id,
  ...arguments_: FluentMessageArguments<Id>
) => string;

/** Formats a descriptor at the React presentation boundary. */
export function formatMessageDescriptor(
  t: MessageFormatter,
  descriptor: unknown,
): string {
  if (!isFluentMessageDescriptor(descriptor)) {
    return t("localization-invalid-message-fallback");
  }

  if ("variables" in descriptor) {
    return t(
      descriptor.id,
      descriptor.variables,
    );
  }
  return t(descriptor.id);
}

/** Returns the app's concise, message-ID-safe Fluent formatter. */
export function useMessages(): MessageFormatter {
  // A few low-level Cumulus primitives are intentionally renderable in
  // isolation (SSR, emergency fallbacks, and focused component tests). The
  // application provider remains authoritative when mounted; the app bundle
  // is the safe same-catalog fallback when that provider is absent.
  let l10n = appLocalization;
  try {
    l10n = useLocalization().l10n;
  } catch {
    // The fallback bundle above is complete for the current application locale.
  }

  return useCallback(
    <Id extends FluentMessageId>(
      id: Id,
      ...arguments_: FluentMessageArguments<Id>
    ) => l10n.getString(id, arguments_[0]),
    [l10n],
  );
}

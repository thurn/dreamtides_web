import {
  useLocalizationContext,
  useOptionalLocalizationContext,
  type ResolveMessage,
  type ResolveMessageParts,
} from "./context";

/** Resolves one immutable Trox value at a React presentation boundary. */
export function useLocalizer(): ResolveMessage {
  return useLocalizationContext().resolve;
}

/** Lets a leaf preserve an explicitly raw-content branch without a provider. */
export function useOptionalLocalizer(): ResolveMessage | null {
  return useOptionalLocalizationContext()?.resolve ?? null;
}

/** Resolves one lazy annotated Trox value into display-ready placeholder runs. */
export function useLocalizedPartsResolver(): ResolveMessageParts {
  return useLocalizationContext().resolveParts;
}

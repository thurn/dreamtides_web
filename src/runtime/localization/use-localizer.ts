import {
  useLocalizationContext,
  useOptionalLocalizationContext,
  type ResolveMessage,
} from "./context";

/** Resolves one immutable Trox value at a React presentation boundary. */
export function useLocalizer(): ResolveMessage {
  return useLocalizationContext().resolve;
}

/** Lets a leaf preserve an explicitly raw-content branch without a provider. */
export function useOptionalLocalizer(): ResolveMessage | null {
  return useOptionalLocalizationContext()?.resolve ?? null;
}

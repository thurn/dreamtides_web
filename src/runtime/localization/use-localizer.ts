import { useLocalizationContext, type ResolveMessage } from "./context";

/** Resolves one immutable Trox value at a React presentation boundary. */
export function useLocalizer(): ResolveMessage {
  return useLocalizationContext().resolve;
}

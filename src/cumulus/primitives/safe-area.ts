import { token, type TokenName } from "./tokens";

/** Physical safe-area custom properties published on the document root. */
export const SAFE_AREA_INSET_PROPERTIES = Object.freeze({
  top: "--safe-area-inset-top",
  right: "--safe-area-inset-right",
  bottom: "--safe-area-inset-bottom",
  left: "--safe-area-inset-left",
} as const);

export type SafeAreaEdge = keyof typeof SAFE_AREA_INSET_PROPERTIES;

/** Preserve at least the requested tokenized spacing beyond a physical edge. */
export function safeAreaInsetAtLeast(
  edge: SafeAreaEdge,
  minimum: TokenName,
): string {
  return `max(${token(SAFE_AREA_INSET_PROPERTIES[edge])}, ${token(minimum)})`;
}

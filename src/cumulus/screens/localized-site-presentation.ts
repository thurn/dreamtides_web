import type { LocalizedString, SourceMessage } from "@trox/runtime";
import { bindSourceTransport } from "../../runtime/localization/runtime";

/** Convert every player-facing string field while preserving the discriminant. */
export type LocalizedSitePresentation<
  T extends { readonly kind: string },
> = {
  readonly [K in keyof T]: K extends "kind"
    ? T[K]
    : T[K] extends string | LocalizedString | SourceMessage
      ? LocalizedString
      : T[K];
};

export function localizedSitePresentation<
  T extends { readonly kind: string },
>(presentation: T): LocalizedSitePresentation<T> {
  return Object.fromEntries(
    Object.entries(presentation).map(([key, value]) => [
      key,
      key === "kind"
        ? value
        : bindSourceTransport(value),
    ]),
  ) as LocalizedSitePresentation<T>;
}

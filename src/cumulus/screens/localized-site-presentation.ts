import type { LocalizedString, SourceMessage } from "@trox/runtime";
import {
  bindSourceTransport,
  hydrateSourceTransport,
} from "../../runtime/localization/runtime";
import type { SitePresentation } from "../../types/sites-data";

/** Convert every player-facing string field while preserving the discriminant. */
export type LocalizedSitePresentation<
  T extends SitePresentation,
> = {
  readonly [K in keyof T]: K extends "kind"
    ? T[K]
    : T[K] extends string | LocalizedString | SourceMessage
      ? LocalizedString
      : T[K];
};

export function localizedSitePresentation<
  T extends SitePresentation,
>(presentation: T): LocalizedSitePresentation<T> {
  return Object.fromEntries(
    Object.entries(presentation).map(([key, value]) => [
      key,
      key === "kind"
        ? value
        : bindSourceTransport(
            hydrateSourceTransport(value, `site presentation ${key}`),
          ),
    ]),
  ) as LocalizedSitePresentation<T>;
}

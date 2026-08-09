import type { SiteState } from "../types/journey";
import { DEFAULT_DRAFT_DATA } from "../data/draft-data";

/** Default number of player picks represented by a Draft site. */
export const DEFAULT_DRAFT_SITE_PICK_COUNT =
  DEFAULT_DRAFT_DATA.offers.picksPerSite;

export function draftSiteData(pickCount: number): Record<string, unknown> {
  return { draftPickCount: pickCount };
}

export function draftSitePickCount(
  site: Pick<SiteState, "data">,
  fallback: number,
): number {
  const rawCount = site.data?.draftPickCount;
  if (
    typeof rawCount === "number" &&
    Number.isInteger(rawCount) &&
    rawCount > 0
  ) {
    return rawCount;
  }
  return fallback;
}

import type { SiteState } from "../types/journey";

/** Default number of player picks represented by a Draft site. */
export const DEFAULT_DRAFT_SITE_PICK_COUNT = 5;

export function draftSiteData(
  pickCount: number = DEFAULT_DRAFT_SITE_PICK_COUNT,
): Record<string, unknown> {
  return { draftPickCount: pickCount };
}

export function draftSitePickCount(site: Pick<SiteState, "data">): number {
  const rawCount = site.data?.draftPickCount;
  if (
    typeof rawCount === "number" &&
    Number.isInteger(rawCount) &&
    rawCount > 0
  ) {
    return rawCount;
  }
  return DEFAULT_DRAFT_SITE_PICK_COUNT;
}

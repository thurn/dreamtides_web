import type { SiteState } from "../types/journey";

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

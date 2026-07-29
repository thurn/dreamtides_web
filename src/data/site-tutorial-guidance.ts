import type { JourneyState, SiteState, SiteType } from "../types/journey";

export type FirstVisitTutorialSiteType = "Draft" | "DreamsignRevelation";

export interface FirstVisitTutorialSite {
  readonly siteId: string;
  readonly siteType: FirstVisitTutorialSiteType;
}

function allSites(state: JourneyState): readonly SiteState[] {
  return Object.values(state.atlas.nodes).flatMap((node) => node.sites);
}

function isFirstVisitTutorialSiteType(
  siteType: SiteType,
): siteType is FirstVisitTutorialSiteType {
  return siteType === "Draft" || siteType === "DreamsignRevelation";
}

/**
 * Resolve the active first-visit site tutorial from shared journey progress.
 *
 * A site type remains eligible throughout its first visit, including every
 * persisted Draft offer and a reload before completion. Completing that site
 * marks it visited in the atlas, which suppresses the tutorial on every later
 * site of the same type across dreamscape travel.
 */
export function activeFirstVisitTutorialSite(
  state: JourneyState,
): FirstVisitTutorialSite | null {
  if (state.screen.type !== "site") return null;
  const currentSiteId = state.screen.siteId;
  const sites = allSites(state);
  const current = sites.find((site) => site.id === currentSiteId);
  if (
    current === undefined ||
    !isFirstVisitTutorialSiteType(current.type)
  ) {
    return null;
  }
  const visitedSiteIds = new Set(state.visitedSites);
  const alreadyVisitedType = sites.some(
    (site) =>
      site.id !== current.id &&
      site.type === current.type &&
      (site.isVisited || visitedSiteIds.has(site.id)),
  );
  return alreadyVisitedType
    ? null
    : { siteId: current.id, siteType: current.type };
}

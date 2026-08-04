import type { JourneyState, SiteState, SiteType } from "../types/journey";

export type FirstVisitTutorialSiteType =
  "Draft" | "Purge" | "DreamsignRevelation";

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
  return (
    siteType === "Draft" ||
    siteType === "Purge" ||
    siteType === "DreamsignRevelation"
  );
}

/**
 * Resolve the active first-visit site tutorial from shared journey progress.
 *
 * Draft guidance remains eligible through the initial offer and retires with
 * the first persisted pick. Purge and Dreamsign Revelation remain eligible
 * throughout their first visits. Completing a site marks it visited in the
 * atlas, which suppresses the tutorial on later sites of the same type across
 * travel.
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
  if (
    current.type === "Draft" &&
    state.draftState?.activeSiteId === current.id &&
    state.draftState.sitePicksCompleted > 0
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

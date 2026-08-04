import type {
  DreamscapeNode,
  JourneyState,
  SiteState,
  SiteType,
} from "../types/journey";

/** The current dreamscape node and a site whose persisted type is verified. */
export interface CurrentSiteSelection<Type extends SiteType> {
  node: DreamscapeNode;
  site: SiteState & { type: Type };
}

/** Select a typed site only when it belongs to the journey's current dreamscape. */
export function selectCurrentSite<Type extends SiteType>(
  state: JourneyState,
  siteId: string,
  expectedType: Type,
): CurrentSiteSelection<Type> | null {
  if (state.currentDreamscape === null) return null;
  const node = state.atlas.nodes[state.currentDreamscape];
  if (node === undefined) return null;
  const site = node.sites.find((candidate) => candidate.id === siteId);
  if (site === undefined || site.type !== expectedType) return null;
  return { node, site: site as SiteState & { type: Type } };
}

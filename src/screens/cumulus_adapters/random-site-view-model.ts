import {
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../../data/sites-data";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import { glyph } from "../../cumulus/primitives/glyph";
import type { RandomSiteView } from "../../cumulus/screens/RandomSiteScreen";
import type { DreamGuideContent } from "../../types/content";
import type { SitesData } from "../../types/sites-data";
import type {
  DreamscapeNode,
  RandomSiteRuntime,
  SiteState,
} from "../../types/journey";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

export function buildRandomSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "RandomSite" };
  runtime: RandomSiteRuntime;
  guide: DreamGuideContent;
  sitesData: SitesData;
  guideLine: string;
}): RandomSiteView {
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  const guideId = params.guide.id;
  return {
    siteId: params.site.id,
    scene,
    guide: {
      id: guideId,
      name: params.guide.name,
      line: params.guideLine,
      art: artRef.dreamGuide(guideId),
    },
    choices: params.runtime.offeredSiteTypes.map((siteType) => ({
      siteType,
      label: siteTypeName(params.sitesData, siteType),
      blurb: siteTypeDescription(params.sitesData, siteType),
      icon: glyph(siteTypeIcon(params.sitesData, siteType)),
    })),
  };
}

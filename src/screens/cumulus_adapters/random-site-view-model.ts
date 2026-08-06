import { siteTypeDescription, siteTypeIcon, siteTypeName } from "../../data/atlas-data";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import { glyph } from "../../cumulus/primitives/glyph";
import type { RandomSiteView } from "../../cumulus/screens/RandomSiteScreen";
import type { DreamGuideContent } from "../../types/content";
import type { AtlasData } from "../../types/atlas-data";
import type { DreamscapeNode, RandomSiteRuntime, SiteState } from "../../types/journey";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

export function buildRandomSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "RandomSite" };
  runtime: RandomSiteRuntime;
  guide: DreamGuideContent;
  atlasData: AtlasData;
}): RandomSiteView {
  const scene: ArtRef | null = params.sceneNode === null
    ? null
    : dreamscapeSceneRef(params.sceneNode);
  const guideId = params.guide.id;
  return {
    siteId: params.site.id,
    scene,
    guide: {
      id: guideId,
      name: params.guide.name,
      line: params.atlasData.randomSite.guideLine,
      art: artRef.dreamGuide(guideId),
    },
    choices: params.runtime.offeredSiteTypes.map((siteType) => ({
      siteType,
      label: siteTypeName(params.atlasData, siteType),
      blurb: siteTypeDescription(params.atlasData, siteType),
      icon: glyph(siteTypeIcon(params.atlasData, siteType)),
    })),
  };
}

import { siteTypeDescription, siteTypeIcon, siteTypeName } from "../../atlas/atlas-generator";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import { glyph } from "../../cumulus/primitives/glyph";
import type { RandomSiteView } from "../../cumulus/screens/RandomSiteScreen";
import type { DreamGuideContent } from "../../types/content";
import type { DreamscapeNode, RandomSiteRuntime, SiteState } from "../../types/journey";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

export function buildRandomSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "RandomSite" };
  runtime: RandomSiteRuntime;
  guide: DreamGuideContent | null;
}): RandomSiteView {
  const scene: ArtRef | null = params.sceneNode === null
    ? null
    : dreamscapeSceneRef(params.sceneNode);
  const guideId = params.guide?.id ?? "maddox";
  return {
    siteId: params.site.id,
    scene,
    guide: {
      id: guideId,
      name: params.guide?.name ?? "Maddox",
      line: "Three roads. Pick your poison.",
      art: artRef.dreamGuide(guideId),
    },
    choices: params.runtime.offeredSiteTypes.map((siteType) => ({
      siteType,
      label: siteTypeName(siteType),
      blurb: siteTypeDescription(siteType),
      icon: glyph(siteTypeIcon(siteType)),
    })),
  };
}

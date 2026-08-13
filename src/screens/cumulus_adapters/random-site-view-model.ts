import {
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../../data/sites-data";
import type { ArtRef } from "../../cumulus/primitives/art";
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
import { projectGuideView } from "./guide-view-model";
import { bindSourceTransport, localizedSourceText } from "../../runtime/localization/runtime";

export function buildRandomSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "RandomSite" };
  runtime: RandomSiteRuntime;
  guide: DreamGuideContent;
  sitesData: SitesData;
  guideLine: LocalizedString;
}): RandomSiteView {
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  return {
    title: bindSourceTransport(
      (
        params.sitesData.siteTypes.RandomSite.presentation as Extract<
          import("../../types/sites-data").SitePresentation,
          { kind: "random-site" }
        >
      ).title,
    ),
    siteId: params.site.id,
    scene,
    guide: projectGuideView(params.guide, params.guideLine),
    choices: params.runtime.offeredSiteTypes.map((siteType) => ({
      siteType,
      label: localizedSourceText(siteTypeName(params.sitesData, siteType)),
      blurb: localizedSourceText(
        siteTypeDescription(params.sitesData, siteType),
      ),
      icon: glyph(siteTypeIcon(params.sitesData, siteType)),
    })),
  };
}
import type { LocalizedString } from "@trox/runtime";

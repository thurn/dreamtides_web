// Pure view-model builder for the Cumulus Dreamsign Revelation screen.

import type { LocalizedString } from "@trox/runtime";
import { requireGuideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type {
  DreamscapeNode,
  Dreamsign,
  JourneyState,
} from "../../types/journey";
import type { TutorialSiteConfiguration } from "../../types/tutorial";
import type { SitesData } from "../../types/sites-data";
import type { ArtRef } from "../../cumulus/primitives/art";
import type {
  DreamsignRevelationGuideView,
  DreamsignRevelationView,
} from "../../cumulus/screens/DreamsignRevelationScreen";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { buildFirstVisitSiteTutorialView } from "./site-tutorial-view-model";
import { projectGuideView } from "./guide-view-model";
import { localizedSitePresentation } from "../../cumulus/screens/localized-site-presentation";
import { localizedDreamsign } from "../../cumulus/components/hud/localized-dreamsign";

/** Resolve Sigrun, the resident guide for Dreamsign Revelation. */
export function resolveDreamsignRevelationGuide(
  guides: readonly DreamGuideContent[],
  guideIdOverride?: string,
): DreamGuideContent {
  return requireGuideForSiteType(
    guides,
    "DreamsignRevelation",
    guideIdOverride,
  );
}

/** Build the guide slice shown beside the offer. */
export function buildDreamsignRevelationGuideView(
  guide: DreamGuideContent,
  guideLine: LocalizedString,
): DreamsignRevelationGuideView {
  return projectGuideView(guide, guideLine);
}

/** Build the complete Cumulus Dreamsign Revelation view-model. */
export function buildDreamsignRevelationView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  guide: DreamGuideContent;
  guideLine: LocalizedString;
  offeredDreamsigns: readonly Dreamsign[] | null;
  pendingPurgeDreamsign: Dreamsign | null;
  tutorialConfiguration?: TutorialSiteConfiguration;
  sitesData: SitesData;
}): DreamsignRevelationView {
  const scene: ArtRef | null =
    params.sceneNode !== null ? dreamscapeSceneRef(params.sceneNode) : null;
  return {
    presentation: localizedSitePresentation(
      params.sitesData.siteTypes.DreamsignRevelation.presentation as Extract<
        import("../../types/sites-data").SitePresentation,
        { kind: "dreamsign-revelation" }
      >,
    ),
    scene,
    guide: buildDreamsignRevelationGuideView(params.guide, params.guideLine),
    offer: (params.offeredDreamsigns ?? []).map((dreamsign) =>
      localizedDreamsign(dreamsign, "Dreamsign Revelation offer"),
    ),
    offerReady: params.offeredDreamsigns !== null,
    tutorial: buildFirstVisitSiteTutorialView(
      params.state,
      "DreamsignRevelation",
      params.tutorialConfiguration,
    ),
    purge:
      params.pendingPurgeDreamsign === null
        ? null
        : {
            pendingDreamsign: localizedDreamsign(
              params.pendingPurgeDreamsign,
              "Dreamsign Revelation pending reward",
            ),
            currentDreamsigns: params.state.dreamsigns.map((dreamsign) =>
              localizedDreamsign(
                dreamsign,
                "Dreamsign Revelation held collection",
              ),
            ),
            maxDreamsigns: params.state.maxDreamsigns,
          },
  };
}

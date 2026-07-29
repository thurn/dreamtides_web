// Pure view-model builder for the Cumulus Dreamsign Revelation screen.

import { guideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type { DreamscapeNode, Dreamsign, JourneyState } from "../../types/journey";
import type { TutorialSiteConfiguration } from "../../types/tutorial";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  DreamsignRevelationGuideView,
  DreamsignRevelationView,
} from "../../cumulus/screens/DreamsignRevelationScreen";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { buildFirstVisitSiteTutorialView } from "./site-tutorial-view-model";

const FALLBACK_GUIDE_ID = "sigrun";
const FALLBACK_GUIDE_NAME = "Sigrún";
const FALLBACK_GUIDE_LINE =
  "The frost reveals what is hidden. Pick one sign to claim.";

/** Resolve Sigrun, the resident guide for Dreamsign Revelation. */
export function resolveDreamsignRevelationGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "DreamsignRevelation");
}

/** Build the guide slice shown beside the offer. */
export function buildDreamsignRevelationGuideView(
  guide: DreamGuideContent | null,
  guideLine: string | null,
): DreamsignRevelationGuideView {
  const id = guide?.id ?? FALLBACK_GUIDE_ID;
  return {
    id,
    name: guide?.name ?? FALLBACK_GUIDE_NAME,
    line: guideLine ?? guide?.dialog[0] ?? FALLBACK_GUIDE_LINE,
    art: artRef.dreamGuide(id),
  };
}

/** Build the complete Cumulus Dreamsign Revelation view-model. */
export function buildDreamsignRevelationView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  guide: DreamGuideContent | null;
  guideLine: string | null;
  offeredDreamsigns: readonly Dreamsign[] | null;
  pendingPurgeDreamsign: Dreamsign | null;
  tutorialConfiguration?: TutorialSiteConfiguration;
}): DreamsignRevelationView {
  const scene: ArtRef | null =
    params.sceneNode !== null ? dreamscapeSceneRef(params.sceneNode) : null;
  return {
    scene,
    guide: buildDreamsignRevelationGuideView(params.guide, params.guideLine),
    offer: params.offeredDreamsigns ?? [],
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
            pendingDreamsign: params.pendingPurgeDreamsign,
            currentDreamsigns: params.state.dreamsigns,
            maxDreamsigns: params.state.maxDreamsigns,
          },
  };
}

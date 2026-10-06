// Pure view-model builder for the Cumulus Dreamsign Revelation screen.

import { requireGuideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type { Dreamsign, JourneyState } from "../../types/journey";
import type { TutorialSiteConfiguration } from "../../types/tutorial";
import type { ArtRef } from "../../cumulus/primitives/art";
import type {
  DreamsignRevelationGuideView,
  DreamsignRevelationView,
} from "../../cumulus/screens/DreamsignRevelationScreen";
import { buildFirstVisitSiteTutorialView } from "./site-tutorial-view-model";
import { projectGuideView } from "./guide-view-model";
import { toDreamsignView } from "../../cumulus/components/hud/dreamsign-view";
import type { GuideId } from "../../types/identifiers";

/** Resolve Sigrun, the resident guide for Dreamsign Revelation. */
export function resolveDreamsignRevelationGuide(
  guides: readonly DreamGuideContent[],
  presentingGuideId?: GuideId,
): DreamGuideContent {
  return requireGuideForSiteType(
    guides,
    "DreamsignRevelation",
    presentingGuideId,
  );
}

/** Build the guide slice shown beside the offer. */
export function buildDreamsignRevelationGuideView(
  guide: DreamGuideContent,
  guideLine: string,
): DreamsignRevelationGuideView {
  return projectGuideView(guide, guideLine);
}

/** Build the complete Cumulus Dreamsign Revelation view-model. */
export function buildDreamsignRevelationView(params: {
  state: JourneyState;
  scene: ArtRef | null;
  guide: DreamGuideContent;
  guideLine: string;
  offeredDreamsigns: readonly Dreamsign[] | null;
  pendingPurgeDreamsign: Dreamsign | null;
  tutorialConfiguration?: TutorialSiteConfiguration;
}): DreamsignRevelationView {
  const { scene } = params;
  return {
    presentation: {
      kind: "dreamsign-revelation",
      loading: "Revealing Dreamsigns...",
      exhausted: "The Dreamsign pool is exhausted.",
    },
    scene,
    guide: buildDreamsignRevelationGuideView(params.guide, params.guideLine),
    offer: (params.offeredDreamsigns ?? []).map((dreamsign) =>
      toDreamsignView(dreamsign),
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
            incoming: toDreamsignView(params.pendingPurgeDreamsign),
            held: params.state.dreamsigns.map((dreamsign) =>
              toDreamsignView(dreamsign),
            ),
            capacity: params.state.maxDreamsigns,
          },
  };
}

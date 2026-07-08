// Pure view-model builder for the Tango Dreamsign Revelation screen.

import { guideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type {
  DreamscapeNode,
  Dreamsign,
  QuestState,
} from "../../types/quest";
import { artRef, type ArtRef } from "../../tango/primitives/art";
import type {
  DreamsignRevelationGuideView,
  DreamsignRevelationView,
} from "../../tango/screens/DreamsignRevelationScreen";
import {
  dreamscapeSceneRef,
  toQsbDreamcaller,
  toQsbDreamsigns,
} from "./dreamscape-view-model";

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

/** Build the complete Tango Dreamsign Revelation view-model. */
export function buildDreamsignRevelationView(params: {
  state: QuestState;
  sceneNode: DreamscapeNode | null;
  guide: DreamGuideContent | null;
  guideLine: string | null;
  offeredDreamsigns: readonly Dreamsign[] | null;
  pendingPurgeDreamsign: Dreamsign | null;
}): DreamsignRevelationView {
  const scene: ArtRef | null =
    params.sceneNode !== null ? dreamscapeSceneRef(params.sceneNode) : null;
  return {
    scene,
    guide: buildDreamsignRevelationGuideView(params.guide, params.guideLine),
    offer: params.offeredDreamsigns ?? [],
    offerReady: params.offeredDreamsigns !== null,
    hud: {
      essence: params.state.essence,
      deck: params.state.deck.length,
      dreamcaller: toQsbDreamcaller(params.state.dreamcaller),
      dreamsigns: toQsbDreamsigns(params.state.dreamsigns),
    },
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

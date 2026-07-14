// Pure view-model builder for the Cumulus Gamble and Temporal Fork placeholders.

import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  WorkInProgressSiteType,
  WorkInProgressSiteView,
} from "../../cumulus/screens/WorkInProgressSiteScreen";
import { guideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type { DreamscapeNode, SiteState, SiteType } from "../../types/quest";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

interface WorkInProgressCopy {
  title: string;
  message: string;
  fallbackGuideId: string;
  fallbackGuideName: string;
  fallbackGuideLine: string;
}

const SITE_COPY: Record<WorkInProgressSiteType, WorkInProgressCopy> = {
  Gamble: {
    title: "Gamble",
    message:
      "The wager is still being shaped. Continue your journey while its stakes and rewards settle into place.",
    fallbackGuideId: "gravok",
    fallbackGuideName: "Gravok",
    fallbackGuideLine: "Fortune favors the bold, traveler.",
  },
  TemporalFork: {
    title: "Temporal Fork",
    message:
      "This fork in time is still being shaped. Continue your journey while its paths settle into place.",
    fallbackGuideId: "layaway",
    fallbackGuideName: '"Layaway"',
    fallbackGuideLine: "Time is just another currency.",
  },
};

/** Whether a site type uses the shared Cumulus work-in-progress screen. */
export function isWorkInProgressSiteType(
  siteType: SiteType,
): siteType is WorkInProgressSiteType {
  return siteType === "Gamble" || siteType === "TemporalFork";
}

/** Resolve the Dream Guide who tends the given placeholder site. */
export function resolveWorkInProgressGuide(
  guides: readonly DreamGuideContent[],
  siteType: WorkInProgressSiteType,
): DreamGuideContent | null {
  return guideForSiteType(guides, siteType);
}

/** Build a complete Cumulus placeholder view for Gamble or Temporal Fork. */
export function buildWorkInProgressSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: WorkInProgressSiteType };
  guide: DreamGuideContent | null;
  guideLine: string | null;
}): WorkInProgressSiteView {
  const copy = SITE_COPY[params.site.type];
  const guideId = params.guide?.id ?? copy.fallbackGuideId;
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  return {
    siteId: params.site.id,
    siteType: params.site.type,
    scene,
    title: copy.title,
    isEnhanced: params.site.isEnhanced,
    message: copy.message,
    guide: {
      id: guideId,
      name: params.guide?.name ?? copy.fallbackGuideName,
      line:
        params.guideLine ??
        params.guide?.dialog[0] ??
        copy.fallbackGuideLine,
      art: artRef.dreamGuide(guideId),
    },
  };
}

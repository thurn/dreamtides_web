// Pure view-model builder for the Cumulus character-led site placeholders.

import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  WorkInProgressSiteType,
  WorkInProgressSiteView,
} from "../../cumulus/screens/WorkInProgressSiteScreen";
import { guideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type { DreamscapeNode, SiteState, SiteType } from "../../types/journey";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

interface WorkInProgressCopy {
  title: string;
  message: string;
  fallbackGuideId: string;
  fallbackGuideName: string;
  fallbackGuideLine: string;
}

const SITE_COPY: Record<WorkInProgressSiteType, WorkInProgressCopy> = {
  TemptingOffer: {
    title: "Tempting Offer",
    message:
      "The offer is still being shaped. Continue your journey while its costs and rewards settle into place.",
    fallbackGuideId: "maddox",
    fallbackGuideName: "Maddox",
    fallbackGuideLine: "Every bargain has a price.",
  },
};

/** Whether a site type uses the shared Cumulus work-in-progress screen. */
export function isWorkInProgressSiteType(
  siteType: SiteType,
): siteType is WorkInProgressSiteType {
  return siteType === "TemptingOffer";
}

/** Resolve the Dream Guide who tends the given placeholder site. */
export function resolveWorkInProgressGuide(
  guides: readonly DreamGuideContent[],
  siteType: WorkInProgressSiteType,
): DreamGuideContent | null {
  return guideForSiteType(guides, siteType);
}

/** Build a complete Cumulus placeholder view for a character-led stub site. */
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
        params.guideLine ?? params.guide?.dialog[0] ?? copy.fallbackGuideLine,
      art: artRef.dreamGuide(guideId),
    },
  };
}

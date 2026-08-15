import { useEffect } from "react";
import { logEventOnce } from "../logging";
import type { GuideId } from "../types/identifiers";
import type { SiteType } from "../types/journey";

export function useGuidePresentedLog(input: {
  enabled: boolean;
  key: string;
  guideId: GuideId;
  siteType: SiteType;
  isEnhanced: boolean;
}): void {
  const { enabled, key, guideId, siteType, isEnhanced } = input;
  useEffect(() => {
    if (!enabled) return;
    logEventOnce(key, "dream_guide_presented", {
      guideId,
      siteType,
      isEnhanced,
    });
  }, [enabled, guideId, isEnhanced, key, siteType]);
}

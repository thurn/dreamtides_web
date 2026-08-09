import { useEffect } from "react";
import { logEventOnce } from "../logging";

export function useGuidePresentedLog(input: {
  enabled: boolean;
  key: string;
  guideId: string;
  siteType: string;
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

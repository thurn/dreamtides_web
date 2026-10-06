import { artRef } from "../../cumulus/primitives/art";
import type { DreamGuideContent } from "../../types/content";
import type { SiteLayoutGuideView } from "../../cumulus/components/layout/SiteLayout";

/** Shared Dream Guide projection used by every guide-bearing site view. */
export function projectGuideView(
  guide: DreamGuideContent,
  line: string,
): SiteLayoutGuideView {
  return {
    id: guide.id,
    name: guide.name,
    line,
    art: artRef.dreamGuide(guide.artKey),
    headTargetX: guide.headTargetX,
  };
}

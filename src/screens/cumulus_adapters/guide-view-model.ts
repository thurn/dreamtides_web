import { artRef } from "../../cumulus/primitives/art";
import type { DreamGuideContent } from "../../types/content";

/** Shared Dream Guide projection used by every guide-bearing site view. */
export function projectGuideView(guide: DreamGuideContent, line: string) {
  return {
    id: guide.id,
    name: guide.name,
    line,
    art: artRef.dreamGuide(guide.id),
  };
}

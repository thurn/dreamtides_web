import { artRef } from "../../cumulus/primitives/art";
import type { LocalizedString } from "@trox/runtime";
import type { DreamGuideContent } from "../../types/content";
import { localizedSourceText } from "../../runtime/localization/runtime";
import type { SiteLayoutGuideView } from "../../cumulus/components/layout/SiteLayout";

/** Shared Dream Guide projection used by every guide-bearing site view. */
export function projectGuideView(
  guide: DreamGuideContent,
  line: LocalizedString,
): SiteLayoutGuideView {
  return {
    id: guide.id,
    name: localizedSourceText(guide.name),
    line,
    art: artRef.dreamGuide(guide.id),
  };
}

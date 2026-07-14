// Wiring-only adapter for Cumulus character-led site placeholders.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { WorkInProgressSiteScreen } from "../../cumulus/screens/WorkInProgressSiteScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useQuest } from "../../state/quest-context";
import {
  buildWorkInProgressSiteView,
  isWorkInProgressSiteType,
  resolveWorkInProgressGuide,
} from "./work-in-progress-site-view-model";

export function WorkInProgressSiteScreenAdapter({
  siteId,
}: {
  siteId: string;
}) {
  const { state, mutations, questContent } = useQuest();
  const node =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const candidate =
    node?.sites.find((site) => site.id === siteId) ?? null;
  const site =
    candidate !== null && isWorkInProgressSiteType(candidate.type)
      ? { ...candidate, type: candidate.type }
      : null;
  const guide =
    site === null
      ? null
      : resolveWorkInProgressGuide(questContent.guides, site.type);
  const guideLineRef = useRef<string | null | undefined>(undefined);
  if (guideLineRef.current === undefined) {
    guideLineRef.current =
      guide === null || guide.dialog.length === 0
        ? null
        : guide.dialog[Math.floor(Math.random() * guide.dialog.length)];
  }

  const view = useMemo(
    () =>
      site === null
        ? null
        : buildWorkInProgressSiteView({
            sceneNode: node,
            site,
            guide,
            guideLine: guideLineRef.current ?? null,
          }),
    [node, site, guide],
  );

  useEffect(() => {
    if (site === null) return;
    logEventOnce(`${site.type}:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      workInProgress: true,
      ui: "cumulus",
    });
    if (guide !== null) {
      logEventOnce(
        `${site.type}:${site.id}:guide:${guide.id}`,
        "dream_guide_presented",
        {
          guideId: guide.id,
          siteType: site.type,
          isEnhanced: site.isEnhanced,
          ui: "cumulus",
        },
      );
    }
  }, [guide, site]);

  const handleContinue = useCallback(() => {
    if (site === null) return;
    logEvent("site_completed", {
      siteId: site.id,
      siteType: site.type,
      outcome: "work_in_progress_continue",
      ui: "cumulus",
    });
    mutations.completeSite(site.id, "stub_site_continue");
  }, [mutations, site]);

  if (site === null || view === null) return null;
  return (
    <WorkInProgressSiteScreen view={view} onContinue={handleContinue} />
  );
}

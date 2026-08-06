import { useCallback, useEffect, useMemo } from "react";
import { RandomSiteScreen } from "../../cumulus/screens/RandomSiteScreen";
import { guideForSite } from "../../data/dreamscapes";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import type { RandomSiteDestinationType } from "../../types/journey";
import { buildRandomSiteView } from "./random-site-view-model";

export function RandomSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, journeyContent } = useJourney();
  const node = state.currentDreamscape === null
    ? null
    : state.atlas.nodes[state.currentDreamscape] ?? null;
  const candidate = node?.sites.find((site) => site.id === siteId) ?? null;
  const site = candidate?.type === "RandomSite"
    ? { ...candidate, type: candidate.type }
    : null;
  const runtimeCandidate = state.siteRuntime[siteId];
  const runtime = runtimeCandidate?.kind === "randomSite" ? runtimeCandidate : null;
  const guide = site === null ? null : guideForSite(journeyContent.guides, site);
  const view = useMemo(
    () => site === null || runtime === null || guide === null
      ? null
      : buildRandomSiteView({
          sceneNode: node,
          site,
          runtime,
          guide,
          atlasData: journeyContent.atlasData,
        }),
    [guide, journeyContent.atlasData, node, runtime, site],
  );

  useEffect(() => {
    if (site === null || runtime !== null) return;
    mutations.ensureRandomSiteRuntime(site.id);
  }, [mutations, runtime, site]);

  useEffect(() => {
    if (site === null || runtime === null) return;
    logEventOnce(`random-site:${site.id}:choices`, "random_site_choices_presented", {
      siteId: site.id,
      candidateSiteTypes: site.randomSite?.candidateSiteTypes ?? [],
      offeredSiteTypes: runtime.offeredSiteTypes,
    });
  }, [runtime, site]);

  const choose = useCallback((siteType: RandomSiteDestinationType) => {
    if (site === null) return;
    logEvent("random_site_selected", { siteId: site.id, siteType });
    mutations.chooseRandomSite(site.id, siteType);
  }, [mutations, site]);

  if (view === null) return null;
  return <RandomSiteScreen view={view} onChoose={choose} />;
}

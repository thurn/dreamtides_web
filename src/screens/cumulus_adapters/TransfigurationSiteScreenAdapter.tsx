// Wiring-only adapter for the standard desktop Cumulus Transfiguration site.

import { useJourney } from "../../state/journey-context";
import { TransfigurationSiteScreen } from "../../cumulus/screens/TransfigurationSiteScreen";
import {
  buildTransfigurationSiteView,
  resolveTransfigurationGuide,
} from "./transfiguration-view-model";
import { useGuideDialogue } from "./guide-dialogue-view-model";
import { useTransfigurationSiteActions } from "../../state/transfiguration-site-actions";

export function TransfigurationSiteScreenAdapter({
  siteId,
}: {
  siteId: string;
}) {
  const { state, journeyContent } = useJourney();
  const node =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const persistedRuntime = state.siteRuntime[siteId];
  const runtime =
    persistedRuntime?.kind === "cardChoice" &&
    persistedRuntime.choiceKind === "transfiguration"
      ? persistedRuntime
      : null;
  const guide = resolveTransfigurationGuide(
    journeyContent.guides,
    site?.randomSite?.presentingGuideId,
  );
  const guideLine = useGuideDialogue(guide, "site");

  const view =
    site === null
      ? null
      : buildTransfigurationSiteView({
          state,
          sceneNode: node,
          site,
          runtime,
          cardDatabase: journeyContent.cardDatabase,
          guide,
          guideLine,
          transfigurationData: journeyContent.transfigurationData,
        });
  const actions = useTransfigurationSiteActions({
    site,
    runtime,
    needsRuntime: persistedRuntime === undefined,
  });

  if (site === null || view === null) return null;
  return (
    <TransfigurationSiteScreen
      view={view}
      onClose={actions.close}
      onTransfigure={actions.transfigure}
    />
  );
}

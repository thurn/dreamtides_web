import { useEffect, useMemo } from "react";
import { GambleSiteScreen } from "../../cumulus/screens/GambleSiteScreen";
import { useJourney } from "../../state/journey-context";
import type { GambleGameId } from "../../types/gamble";
import {
  logGamblePrepared,
  logGambleResolved,
  logGambleSettled,
  logGambleSiteEntered,
} from "./gamble-site-logging-view-model";
import {
  buildGambleSiteView,
  resolveGambleGuide,
} from "./gamble-site-view-model";
import { useGuideDialogue } from "./guide-dialogue-view-model";
import { gambleGameByRulesKind } from "../../data/gamble-data";
import { gambleSiteActions } from "./gamble-site-actions-view-model";
import type { SiteId } from "../../types/identifiers";
export function GambleSiteScreenAdapter({
  siteId,
  gambleGameId,
}: {
  siteId: SiteId;
  gambleGameId: GambleGameId | null;
}) {
  const { state, journeyContent, mutations } = useJourney();
  const gambleData = journeyContent.gambleData;
  if (gambleData === undefined)
    throw new Error("Journey content is missing Gamble data");
  const ladderGame = gambleGameByRulesKind(gambleData, "ladderClimb");
  const node =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const candidate = node?.sites.find((entry) => entry.id === siteId) ?? null;
  const site =
    candidate?.type === "Gamble"
      ? { ...candidate, type: candidate.type }
      : null;
  const runtimeCandidate = state.siteRuntime[siteId];
  const runtime = runtimeCandidate?.kind === "gamble" ? runtimeCandidate : null;
  const guide = resolveGambleGuide(
    journeyContent.guides,
    site?.randomSite?.presentingGuideId,
  );
  const dialogueContext =
    site?.randomSite?.materialized === true
      ? "random-site"
      : runtime?.gameId === "tidemark-ladder-climb"
        ? "gamble-ladder-climb"
        : runtime?.gameId === "starway-stairs"
          ? "gamble-starway-stairs"
          : runtime?.gameId === "four-suit-reprise"
            ? "gamble-four-suit-reprise"
            : runtime?.gameId === "blackjack"
              ? "gamble-blackjack"
              : "gamble-three-gate";
  const guideLine = useGuideDialogue(guide, dialogueContext, {
    win_essence: ladderGame.economy.winEssence,
  });
  const view = useMemo(
    () =>
      site === null
        ? null
        : buildGambleSiteView({
            state,
            sceneNode: node,
            site,
            guide,
            guideLine,
            gambleData,
            transfigurationData: journeyContent.transfigurationData,
          }),
    [
      gambleData,
      guide,
      guideLine,
      journeyContent.transfigurationData,
      node,
      site,
      state,
    ],
  );
  useEffect(() => {
    if (site === null) return;
    mutations.ensureGambleSiteRuntime(site.id, gambleGameId ?? undefined);
    logGambleSiteEntered(site);
  }, [gambleGameId, mutations, site]);
  useEffect(() => {
    if (runtime === null || view === null) return;
    logGamblePrepared(siteId, runtime, view, gambleData);
    logGambleResolved(siteId, runtime, view, gambleData);
    logGambleSettled(siteId, runtime, view, gambleData);
  }, [gambleData, runtime, siteId, view]);
  if (view === null) return null;
  return (
    <GambleSiteScreen
      view={view}
      {...gambleSiteActions(siteId, runtime, mutations)}
    />
  );
}

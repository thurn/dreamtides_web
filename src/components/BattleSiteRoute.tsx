import { useMemo } from "react";
import type { CardData } from "../types/cards";
import type { SiteState } from "../types/journey";
import { useJourney } from "../state/journey-context";
import { useGameState, useActions } from "../coop/hooks";
import { createBattlePreview } from "../coop/providers/battle-init-provider";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { PlayableBattleScreen } from "../battle/components/PlayableBattleScreen";
import { BattleStartScreenAdapter } from "../screens/cumulus_adapters/BattleStartScreenAdapter";
import {
  CumulusJourneyChrome,
  type CumulusJourneyChromeHandlers,
} from "./CumulusJourneyChrome";
import { ApplicationStateScreen } from "../cumulus/screens/ApplicationStateScreen";
import { tx } from "@trox/runtime";

/**
 * Drives the coop event-sourced battle fold. A null folded battle renders the
 * deterministic opposing-DreamAvatar preview; its Begin action appends
 * `BEGIN_BATTLE`. A non-null folded battle renders the playable surface on
 * every client, including after reload.
 */
export function BattleSiteRoute({
  site,
  cardDatabase,
  runtimeConfig,
  cumulusChromeHandlers,
}: {
  site: SiteState;
  cardDatabase: Map<number, CardData>;
  runtimeConfig: RuntimeConfig;
  cumulusChromeHandlers?: CumulusJourneyChromeHandlers;
}) {
  const { state, journeyContent } = useJourney();
  const gameState = useGameState();
  const actions = useActions();
  const battle = gameState.battle;
  const isActiveSite =
    state.screen.type === "site" && state.screen.siteId === site.id;
  const beginBattle = (): void => {
    if (runtimeConfig.seedOverride === null) {
      void actions.beginBattle(site.id);
      return;
    }
    void actions.beginBattle(site.id, runtimeConfig.seedOverride);
  };
  const preview = useMemo(
    () =>
      battle === null && isActiveSite
        ? createBattlePreview(
            journeyContent,
            state,
            site.id,
            runtimeConfig.seedOverride,
          )
        : null,
    [
      battle,
      isActiveSite,
      journeyContent,
      runtimeConfig.seedOverride,
      site.id,
      state,
    ],
  );

  if (battle === null) {
    // AnimatePresence keeps the previous site route mounted while it fades
    // out. END_BATTLE atomically tears down the battle and routes to the Atlas,
    // so that exiting route must not reinterpret the cleared battle as a fresh
    // pre-battle preview.
    if (!isActiveSite) {
      return null;
    }
    if (preview === null) {
      return (
        <ApplicationStateScreen
          view={{
            kind: "recoverableError",
            title: tx(
              "Unable to Prepare Battle",
              "[battle] Recoverable error title when a battle preview cannot be prepared.",
            ),
            message: tx(
              "The battle preview could not be prepared from this game state.",
              "[battle] Recoverable error explanation when a battle preview cannot be prepared from the current game state.",
            ),
          }}
        />
      );
    }
    return (
      <CumulusJourneyChrome handlers={cumulusChromeHandlers}>
        <BattleStartScreenAdapter
          init={preview}
          cardDatabase={cardDatabase}
          isTutorialJourney={state.isTutorialJourney === true}
          tutorialConfiguration={journeyContent.tutorial?.battleStart}
          onBegin={beginBattle}
        />
      </CumulusJourneyChrome>
    );
  }

  return (
    <CumulusJourneyChrome variant="battle">
      <PlayableBattleScreen site={site} aiMode={runtimeConfig.aiMode} />
    </CumulusJourneyChrome>
  );
}

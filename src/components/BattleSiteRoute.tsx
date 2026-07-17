import { useMemo } from "react";
import type { CardData } from "../types/cards";
import type { SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { useGameState, useActions } from "../coop/hooks";
import { createBattlePreview } from "../coop/providers/battle-init-provider";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { PlayableBattleScreen } from "../battle/components/PlayableBattleScreen";
import { BattleStartScreenAdapter } from "../screens/cumulus_adapters/BattleStartScreenAdapter";
import {
  CumulusQuestChrome,
  type CumulusQuestChromeHandlers,
} from "./CumulusQuestChrome";

/**
 * Drives the coop event-sourced battle fold. A null folded battle renders the
 * deterministic opposing-Dreamcaller preview; its Begin action appends
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
  cumulusChromeHandlers?: CumulusQuestChromeHandlers;
}) {
  const { state, questContent } = useQuest();
  const gameState = useGameState();
  const actions = useActions();
  const battle = gameState.battle;
  const beginBattle = (): void => {
    if (runtimeConfig.seedOverride === null) {
      void actions.beginBattle(site.id);
      return;
    }
    void actions.beginBattle(site.id, runtimeConfig.seedOverride);
  };
  const preview = useMemo(
    () =>
      battle === null
        ? createBattlePreview(
            questContent,
            state,
            site.id,
            runtimeConfig.seedOverride,
          )
        : null,
    [battle, questContent, runtimeConfig.seedOverride, site.id, state],
  );

  if (battle === null) {
    if (preview === null) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 p-8">
          <p className="text-lg opacity-80">Unable to prepare battle.</p>
        </div>
      );
    }
    return (
      <CumulusQuestChrome handlers={cumulusChromeHandlers}>
        <BattleStartScreenAdapter
          init={preview}
          cardDatabase={cardDatabase}
          onBegin={beginBattle}
        />
      </CumulusQuestChrome>
    );
  }

  return (
    <CumulusQuestChrome variant="battle">
      <PlayableBattleScreen site={site} aiMode={runtimeConfig.aiMode} />
    </CumulusQuestChrome>
  );
}

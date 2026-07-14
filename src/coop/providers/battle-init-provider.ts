// Real BattleInitProvider: turns quest state into a fresh battle fold slice on
// `BEGIN_BATTLE`. Battle construction is ALREADY fully seeded — `createBattleInit`
// derives all of its randomness from a `BattleRng` stream keyed by
// `deriveBattleSeed(quest.seed:battleEntryKey)`, and `createInitialBattleState`
// is pure — so it needs no `ctx.rng`: given the same quest seed and site, every
// client builds a byte-identical battle. The `battleEntryKey` is derived
// deterministically from `(siteId, completionLevel, dreamscapeId)` so it is
// identical across clients too.

import type { QuestContent } from "../../data/quest-content";
import { createBattleInit } from "../../battle/integration/create-battle-init";
import { createInitialBattleState } from "../../battle/state/create-initial-state";
import { findSite } from "../../rules/quest/sites";
import type { BattleFoldState } from "../../rules/fold-state";
import { emptyDawnFired } from "../../rules/battle/fold";
import type { BattleInitProvider } from "../../rules/battle/battle-events";

/**
 * Replicates `createBattleEntryKey` (which lives in a React module the rules /
 * coop-provider layer must not import). The format is a stable identity, not a
 * secret — a battle at `(siteId, completionLevel, dreamscapeId)` always keys the
 * same, so the derived battle seed is identical on every client.
 */
function battleEntryKeyFor(
  dreamscapeId: string | null,
  siteId: string,
  completionLevel: number,
): string {
  return `${siteId}::${String(completionLevel)}::${dreamscapeId ?? "none"}`;
}

export function createBattleInitProvider(
  content: QuestContent,
): BattleInitProvider {
  return {
    beginBattle: ({ quest, siteId }): BattleFoldState | null => {
      const site = findSite(quest, siteId);
      if (site === null || site.type !== "Battle") return null;

      const battleEntryKey = battleEntryKeyFor(
        quest.currentDreamscape,
        siteId,
        quest.completionLevel,
      );
      const init = createBattleInit({
        battleEntryKey,
        battleInstanceId: `battle:${quest.runId ?? "unscoped"}:${battleEntryKey}`,
        site,
        state: quest,
        cardDatabase: content.cardDatabase,
        dreamcallers: content.dreamcallers,
        dreamscapes: content.dreamscapes,
        affiliations: content.affiliations,
        dreamwellCards: content.dreamwellCards,
        dreamsignTemplates: content.dreamsignTemplates,
        poolContext: content.poolContext,
        knownGoodDecklists: content.knownGoodDecklists,
        dreamsignSignatures: content.dreamsignSignatures,
        fitModel: content.fitModel,
        draftRecords: content.draftRecords,
        // The opponent-reconstruction logs are a display/analytics side effect,
        // not fold state; capture and drop them so folding a `BEGIN_BATTLE` is a
        // pure state transition (the primary client's UI emits them later).
        deferOpponentLog: () => {},
      });
      const board = createInitialBattleState(init);
      return {
        init,
        board,
        effectQueue: [],
        pendingPrompt: null,
        dawnFired: emptyDawnFired(),
      };
    },
  };
}

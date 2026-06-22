import { useEffect, useRef } from "react";
import type { Database } from "firebase/database";
import { ensureBattleSession } from "../multiplayer/battle-service";
import type { SharedBattleState } from "../multiplayer/battle-types";
import { createBattleInit } from "../battle/integration/create-battle-init";
import {
  logOpponentDeckConstructed,
  type OpponentDeckLogArgs,
} from "../battle/integration/opponent-deck";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import type { CardData } from "../types/cards";
import type {
  AffiliationContent,
  DreamcallerContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../types/content";
import type { DreamwellCard } from "../data/dreamwell-database";
import type { RunPoolContext } from "../data/quest-content";
import type { DraftRecord } from "../data/cards-v2-database";
import type { FitModel } from "../draft/replay/fit-model";
import type { QuestState, SiteState } from "../types/quest";

/**
 * Ensures the room's `battleState` exists for the current `battleEntryKey`.
 *
 * - Fires only when `battleState === null` AND the most recent ensure attempt
 *   on this mount was for a different `battleEntryKey`. The tracker latches
 *   on the entry key and is *not* cleared when `battleState` becomes
 *   non-null. That latch is what prevents a re-init race during the defeat
 *   path: when `clearBattleStateInRoom` zeroes the slot before the screen
 *   flip to `questFailed` has been delivered to this client, the route is
 *   still mounted on the same `battleEntryKey`, but the latch keeps us from
 *   re-firing `ensureBattleSession`. Once the screen flip arrives, the route
 *   unmounts and the next mount starts with a fresh ref.
 * - A different `battleEntryKey` (e.g. next dreamscape, next completion
 *   level) bypasses the latch through the second guard below and triggers a
 *   fresh ensure call.
 * - On top of the server-side transactional guard inside
 *   `ensureBattleSession`, the client-side latch makes StrictMode
 *   double-mounting and rapid rerenders idempotent.
 */
export function useEnsureBattleSession(input: {
  database: Database;
  roomId: string;
  clientId: string;
  /**
   * Whether this client is the room's primary client. Only the primary computes
   * and commits the battle init; non-primary clients wait for the synced
   * `battleState`. This is what makes a battle initialize once, from a single
   * authority, instead of every connected client speculatively building its own
   * init (which can diverge — e.g. the opponent deck depends on the local
   * client's `aiMode`). Defaults to `true` so single-client and test callers
   * still initialize.
   */
  isPrimaryClient?: boolean;
  battleState: SharedBattleState | null;
  battleEntryKey: string;
  site: SiteState;
  questState: Pick<
    QuestState,
    | "atlas"
    | "battleModifiers"
    | "completionLevel"
    | "currentDreamscape"
    | "deck"
    | "dreamcaller"
    | "dreamsigns"
    | "resolvedPackage"
    | "seed"
  >;
  cardDatabase: ReadonlyMap<number, CardData>;
  dreamcallers: readonly DreamcallerContent[];
  dreamscapes?: readonly DreamscapeContent[];
  affiliations?: readonly AffiliationContent[];
  dreamwellCards: readonly DreamwellCard[];
  dreamsignTemplates?: readonly DreamsignTemplate[];
  poolContext?: RunPoolContext;
  /** The corpus-trained fit model that drives the opponent's coherent draft. */
  fitModel?: FitModel;
  /** The adapted draft-record corpus supplying the opponent draft's packs. */
  draftRecords?: readonly DraftRecord[];
  seedOverride: number | null;
  aiMode?: boolean;
}): void {
  const inFlightKey = useRef<string | null>(null);

  useEffect(() => {
    if (input.battleState !== null) {
      return;
    }
    // Only the room's primary client builds the battle; everyone else waits for
    // the synced `battleState`. The latch below is left untouched so a client
    // that LATER becomes primary (the prior primary disconnected) still fires.
    if (input.isPrimaryClient === false) {
      return;
    }
    if (inFlightKey.current === input.battleEntryKey) {
      return;
    }
    inFlightKey.current = input.battleEntryKey;

    // Captured rather than logged inline: this client computes an init
    // speculatively, but only the client whose init wins the
    // `ensureBattleSession` transaction should record the opponent deck, so the
    // room holds exactly one `opponent_deck_constructed` per battle.
    let opponentDeckLogArgs: OpponentDeckLogArgs | null = null;
    const init = createBattleInit({
      battleEntryKey: input.battleEntryKey,
      site: input.site,
      state: input.questState,
      cardDatabase: input.cardDatabase,
      dreamcallers: input.dreamcallers,
      dreamscapes: input.dreamscapes,
      affiliations: input.affiliations,
      dreamwellCards: input.dreamwellCards,
      dreamsignTemplates: input.dreamsignTemplates,
      poolContext: input.poolContext,
      fitModel: input.fitModel,
      draftRecords: input.draftRecords,
      seedOverride: input.seedOverride,
      aiMode: input.aiMode,
      onOpponentDeckConstructed: (args) => {
        opponentDeckLogArgs = args;
      },
    });
    const initial = createInitialBattleState(init);

    ensureBattleSession({
      database: input.database,
      roomId: input.roomId,
      init,
      initialMutable: initial,
      actorId: input.clientId,
    })
      .then((committedInit) => {
        if (committedInit && opponentDeckLogArgs !== null) {
          logOpponentDeckConstructed(opponentDeckLogArgs);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to ensure battle session", error);
        inFlightKey.current = null;
      });
  }, [
    input.aiMode,
    input.isPrimaryClient,
    input.battleEntryKey,
    input.battleState,
    input.affiliations,
    input.cardDatabase,
    input.clientId,
    input.database,
    input.dreamcallers,
    input.dreamscapes,
    input.dreamwellCards,
    input.dreamsignTemplates,
    input.poolContext,
    input.fitModel,
    input.draftRecords,
    input.questState,
    input.roomId,
    input.seedOverride,
    input.site,
  ]);
}

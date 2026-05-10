import { useEffect, useRef } from "react";
import type { Database } from "firebase/database";
import { ensureBattleSession } from "../multiplayer/battle-service";
import type { SharedBattleState } from "../multiplayer/battle-types";
import { createBattleInit } from "../battle/integration/create-battle-init";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import { prepareInitialBattleState } from "../battle/engine/turn-flow";
import type { CardData } from "../types/cards";
import type { DreamcallerContent } from "../types/content";
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
  battleState: SharedBattleState | null;
  battleEntryKey: string;
  site: SiteState;
  questState: Pick<
    QuestState,
    | "atlas"
    | "completionLevel"
    | "currentDreamscape"
    | "deck"
    | "dreamcaller"
    | "dreamsigns"
    | "resolvedPackage"
  >;
  cardDatabase: ReadonlyMap<number, CardData>;
  dreamcallers: readonly DreamcallerContent[];
  seedOverride: number | null;
  enableAi: boolean;
}): void {
  const inFlightKey = useRef<string | null>(null);

  useEffect(() => {
    if (input.battleState !== null) {
      return;
    }
    if (inFlightKey.current === input.battleEntryKey) {
      return;
    }
    inFlightKey.current = input.battleEntryKey;

    const init = createBattleInit({
      battleEntryKey: input.battleEntryKey,
      site: input.site,
      state: input.questState,
      cardDatabase: input.cardDatabase,
      dreamcallers: input.dreamcallers,
      seedOverride: input.seedOverride,
      enableAi: input.enableAi,
    });
    const initial = prepareInitialBattleState(
      createInitialBattleState(init),
      init,
    ).state;

    ensureBattleSession({
      database: input.database,
      roomId: input.roomId,
      init,
      initialMutable: initial,
      actorId: input.clientId,
    }).catch((error: unknown) => {
      console.error("Failed to ensure battle session", error);
      inFlightKey.current = null;
    });
  }, [
    input.battleEntryKey,
    input.battleState,
    input.cardDatabase,
    input.clientId,
    input.database,
    input.dreamcallers,
    input.enableAi,
    input.questState,
    input.roomId,
    input.seedOverride,
    input.site,
  ]);
}

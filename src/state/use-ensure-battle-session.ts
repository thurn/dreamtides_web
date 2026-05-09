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
 * - Fires only when `battleState === null` AND no in-flight request matches
 *   the same `battleEntryKey`. This makes StrictMode double-mounting and
 *   rapid rerenders idempotent on the client side, on top of the server-side
 *   transactional guard inside `ensureBattleSession`.
 * - Resets the in-flight tracker once the server confirms by populating
 *   `battleState`.
 */
export function useEnsureBattleSession(input: {
  database: Database;
  roomId: string;
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
      inFlightKey.current = null;
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
    }).catch((error: unknown) => {
      console.error("Failed to ensure battle session", error);
      inFlightKey.current = null;
    });
  }, [
    input.battleEntryKey,
    input.battleState,
    input.cardDatabase,
    input.database,
    input.dreamcallers,
    input.enableAi,
    input.questState,
    input.roomId,
    input.seedOverride,
    input.site,
  ]);
}

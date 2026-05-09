import type { CardData } from "../types/cards";
import type { SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { useMultiplayerBattle } from "../state/multiplayer-battle-context";
import { useEnsureBattleSession } from "../state/use-ensure-battle-session";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { PlayableBattleScreen } from "../battle/components/PlayableBattleScreen";

export function createBattleEntryKey(
  dreamscapeId: string | null,
  siteId: string,
  completionLevel: number,
): string {
  return `${siteId}::${String(completionLevel)}::${dreamscapeId ?? "none"}`;
}

/**
 * Drives the shared room-backed battle session: ensures `battleState` exists
 * for the current `battleEntryKey` via `useEnsureBattleSession`, then renders
 * the playable surface against the shared `init`/`mutable` snapshot.
 */
export function BattleSiteRoute({
  site,
  cardDatabase,
  runtimeConfig,
}: {
  site: SiteState;
  cardDatabase: Map<number, CardData>;
  runtimeConfig: RuntimeConfig;
}) {
  const { state, questContent } = useQuest();
  const { database, roomId, battleState } = useMultiplayerBattle();

  const battleEntryKey = createBattleEntryKey(
    state.currentDreamscape,
    site.id,
    state.completionLevel,
  );

  useEnsureBattleSession({
    database,
    roomId,
    battleState,
    battleEntryKey,
    site,
    questState: state,
    cardDatabase,
    dreamcallers: questContent.dreamcallers,
    seedOverride: runtimeConfig.seedOverride,
    enableAi: runtimeConfig.enableAi,
  });

  if (battleState === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
        <p className="text-lg opacity-80">Preparing battle…</p>
      </div>
    );
  }

  return <PlayableBattleScreen site={site} />;
}

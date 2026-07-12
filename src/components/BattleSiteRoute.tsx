import { useEffect, useRef, useState } from "react";
import type { CardData } from "../types/cards";
import type { SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { useGameState, useActions } from "../coop/hooks";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { PlayableBattleScreen } from "../battle/components/PlayableBattleScreen";
import { BattleStartScreen } from "../battle/components/BattleStartScreen";
import { BattleStartScreenAdapter } from "../screens/tango_adapters/BattleStartScreenAdapter";
import {
  TangoQuestChrome,
  type TangoQuestChromeHandlers,
} from "./TangoQuestChrome";

export function createBattleEntryKey(
  dreamscapeId: string | null,
  siteId: string,
  completionLevel: number,
): string {
  return `${siteId}::${String(completionLevel)}::${dreamscapeId ?? "none"}`;
}

/**
 * Drives the coop event-sourced battle fold: appends `BEGIN_BATTLE` once for
 * the current `battleEntryKey`, then renders the playable surface against
 * `state.battle`.
 *
 * `BattleStartScreen` (the opposing Dreamcaller reveal) needs a full
 * `BattleInit` to render, and `BattleInit` only exists once `BEGIN_BATTLE` has
 * folded — there is no quest-side data to build a pre-battle preview from. So
 * the reveal is NOT truly pre-begin: `BEGIN_BATTLE` is appended (and the board
 * — hands, opening state — is constructed) as soon as this route mounts for a
 * fresh entry key, and the reveal is shown on top of that already-begun battle
 * as a per-client dismissable overlay. This preserves the observable UX (the
 * player sees the reveal before touching the playable surface) without
 * requiring `BattleStartScreen` to render from anything but a `BattleInit`.
 */
export function BattleSiteRoute({
  site,
  cardDatabase,
  runtimeConfig,
  tangoChromeHandlers,
}: {
  site: SiteState;
  cardDatabase: Map<number, CardData>;
  runtimeConfig: RuntimeConfig;
  tangoChromeHandlers?: TangoQuestChromeHandlers;
}) {
  const { state } = useQuest();
  const gameState = useGameState();
  const actions = useActions();
  const battle = gameState.battle;

  const battleEntryKey = createBattleEntryKey(
    state.currentDreamscape,
    site.id,
    state.completionLevel,
  );

  // Whether the player has dismissed the Battle Start reveal and entered the
  // playable battle. This is a per-client UI gate: in coop each player sees the
  // reveal and clicks through independently; the underlying fold state already
  // exists, so dismissing only mounts the playable surface locally. Keyed by
  // `battleEntryKey` so a fresh battle at the same route shows the reveal again.
  const [begunEntryKey, setBegunEntryKey] = useState<string | null>(null);

  // Guards against appending BEGIN_BATTLE more than once for the same entry
  // key (StrictMode double-effects, rapid rerenders). The reducer treats a
  // BEGIN_BATTLE against an already-active battle as a no-op, but this keeps
  // the client from spamming the log.
  const beginRequestedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setBegunEntryKey(null);
    beginRequestedKeyRef.current = null;
  }, [battleEntryKey]);

  useEffect(() => {
    if (battle !== null) {
      return;
    }
    if (beginRequestedKeyRef.current === battleEntryKey) {
      return;
    }
    beginRequestedKeyRef.current = battleEntryKey;
    void actions.beginBattle(site.id);
  }, [battle, battleEntryKey, site.id, actions]);

  if (battle === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
        <p className="text-lg opacity-80">Preparing battle…</p>
      </div>
    );
  }

  // The opposing Dreamcaller is revealed once the battle's init exists. Once
  // the player clicks "Begin Battle", the playable surface mounts against the
  // same fold state.
  if (begunEntryKey !== battleEntryKey) {
    if (runtimeConfig.uiVariant === "tango") {
      return (
        <TangoQuestChrome handlers={tangoChromeHandlers}>
          <BattleStartScreenAdapter
            init={battle.init}
            cardDatabase={cardDatabase}
            onBegin={() => {
              setBegunEntryKey(battleEntryKey);
            }}
          />
        </TangoQuestChrome>
      );
    }
    return (
      <BattleStartScreen
        init={battle.init}
        cardDatabase={cardDatabase}
        onBegin={() => {
          setBegunEntryKey(battleEntryKey);
        }}
      />
    );
  }

  return (
    <PlayableBattleScreen
      site={site}
      aiMode={runtimeConfig.aiMode}
      basicAutomation={runtimeConfig.basicAutomation}
    />
  );
}

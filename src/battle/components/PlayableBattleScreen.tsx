import { getBattleInitProvider } from "../../rules/battle/battle-events";
import { journeyBattleOf } from "../../rules/battle/fold";
import { useGameState } from "../../session/hooks";
import { EngineBattleScreen } from "./EngineBattleScreen";

/**
 * The playable surface of a folded journey battle: its engine battle on the
 * engine the battle-init provider registered. Renders nothing without a
 * journey battle or a registered engine; `BattleSiteRoute` shows the
 * preview until `BEGIN_BATTLE` folds.
 */
export function PlayableBattleScreen() {
  const battle = journeyBattleOf(useGameState().battle);
  const engine = getBattleInitProvider()?.engine ?? null;
  if (battle === null || engine === null) return null;
  return <EngineBattleScreen key={battle.init.battleId} engine={engine} />;
}

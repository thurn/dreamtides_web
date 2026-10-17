import { getBattleInitProvider } from "../../rules/battle/journey-battle";
import { playableBattleOf } from "../../rules/battle/fold";
import { useGameState } from "../../session/hooks";
import { EngineBattleScreen } from "./EngineBattleScreen";

/**
 * The playable surface of a folded journey or D97 battle: its engine battle
 * on the engine the battle-init provider registered. Renders nothing without
 * such a battle or a registered engine; `BattleSiteRoute` shows the journey
 * preview until `BEGIN_BATTLE` folds.
 */
export function PlayableBattleScreen() {
  const battle = playableBattleOf(useGameState().battle);
  const engine = getBattleInitProvider()?.engine ?? null;
  if (battle === null || engine === null) return null;
  return <EngineBattleScreen key={battle.init.battleId} engine={engine} />;
}

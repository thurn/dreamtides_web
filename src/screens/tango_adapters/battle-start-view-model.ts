import {
  opponentCarriesDreamsign,
  resolveRunLayerCount,
} from "../../battle/integration/opponent-deck";
import type { BattleInit } from "../../battle/types";
import type { CardData } from "../../types/cards";
import { artRef } from "../../tango/primitives/art";
import type { BattleStartView } from "../../tango/screens/BattleStartScreen";

export type BattleStartInit = BattleInit;

export function buildBattleStartView(
  init: BattleInit,
  cardDatabase: ReadonlyMap<number, CardData>,
): BattleStartView {
  const enemy = init.enemyDescriptor;
  const node =
    init.dreamscapeId !== null
      ? init.atlasSnapshot.nodes[init.dreamscapeId]
      : undefined;
  return {
    battleId: init.battleId,
    scene:
      node?.dreamscapeId !== null && node?.dreamscapeId !== undefined
        ? artRef.dreamscapeScene(node.dreamscapeId)
        : null,
    dreamcaller: {
      id: enemy.id,
      name: enemy.name,
      title: enemy.subtitle,
      imageNumber: enemy.imageNumber ?? "001",
      ability: enemy.abilityText.trim(),
      abilityActive: opponentCarriesDreamsign(
        init.completionLevelAtStart,
        resolveRunLayerCount(init.atlasSnapshot.layers),
      ),
    },
    dreamsigns: (enemy.dreamsigns ?? []).flatMap((dreamsign) =>
      dreamsign.id === undefined ? [] : [{ ...dreamsign, id: dreamsign.id }],
    ),
    signatureCards: (enemy.signatureCards ?? []).flatMap((summary) => {
      const card = cardDatabase.get(summary.cardNumber);
      return card === undefined
        ? []
        : [{ cardId: card.id, model: { cardId: card.id, displaySnapshot: card } }];
    }),
    pointsToWin: init.scoreToWin,
    essenceReward: init.essenceReward,
  };
}

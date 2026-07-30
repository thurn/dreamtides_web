import { useMemo } from "react";
import {
  BattleForeseeOverlay,
  type BattleForeseeResolution,
  type BattleForeseeView,
} from "../../cumulus/screens/BattleForeseeOverlay";
import type {
  BattleMutableState,
  BattleSide,
  DreamwellCardDefinition,
} from "../types";
import { battleGameCardModel } from "../ui/battle-game-card-model";
import { dreamwellCardModel } from "../ui/dreamwell-card-model";

export interface CumulusBattleForeseeOverlayProps {
  initialCount: number;
  side: BattleSide;
  state: BattleMutableState;
  sourceDreamwellCard?: DreamwellCardDefinition;
  onConfirm: (resolution: BattleForeseeResolution) => void;
}

/** Maps live battle state into the pure Cumulus Foresee modal. */
export function CumulusBattleForeseeOverlay({
  initialCount,
  side,
  state,
  sourceDreamwellCard,
  onConfirm,
}: CumulusBattleForeseeOverlayProps) {
  const view = useMemo<BattleForeseeView>(() => ({
    initialCount,
    cards: state.sides[side].deck
      .flatMap((battleCardId) => {
        const instance = state.cardInstances[battleCardId];
        return instance === undefined
          ? []
          : [{
              battleCardId,
              model: battleGameCardModel(instance),
            }];
      }),
    ...(sourceDreamwellCard === undefined
      ? {}
      : { sourceDreamwellCard: dreamwellCardModel(sourceDreamwellCard) }),
  }), [
    initialCount,
    side,
    sourceDreamwellCard,
    state.cardInstances,
    state.sides,
  ]);

  return (
    <BattleForeseeOverlay
      view={view}
      onConfirm={onConfirm}
    />
  );
}

import { useMemo } from "react";
import {
  BattleForeseeOverlay,
  type BattleForeseeResolution,
  type BattleForeseeView,
} from "../../cumulus/screens/BattleForeseeOverlay";
import type { BattleMutableState, BattleSide } from "../types";
import { battleGameCardModel } from "../ui/battle-game-card-model";

export interface CumulusBattleForeseeOverlayProps {
  initialCount: number;
  side: BattleSide;
  state: BattleMutableState;
  onConfirm: (resolution: BattleForeseeResolution) => void;
}

/** Maps live battle state into the pure Cumulus Foresee modal. */
export function CumulusBattleForeseeOverlay({
  initialCount,
  side,
  state,
  onConfirm,
}: CumulusBattleForeseeOverlayProps) {
  const view = useMemo<BattleForeseeView>(() => ({
    cards: state.sides[side].deck
      .slice(0, Math.max(0, initialCount))
      .flatMap((battleCardId) => {
        const instance = state.cardInstances[battleCardId];
        return instance === undefined
          ? []
          : [{
              battleCardId,
              model: battleGameCardModel(instance),
            }];
      }),
  }), [initialCount, side, state.cardInstances, state.sides]);

  return (
    <BattleForeseeOverlay
      view={view}
      onConfirm={onConfirm}
    />
  );
}

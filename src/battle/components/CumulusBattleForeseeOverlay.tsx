import { useMemo } from "react";
import {
  BattleForeseeOverlay,
  type BattleForeseeResolution,
  type BattleForeseeView,
} from "../../cumulus/screens/BattleForeseeOverlay";
import type { BattleMutableState, BattleSide } from "../types";
import { battleGameCardModel } from "../ui/battle-game-card-model";
import { formatSideLabel } from "../ui/format";

export interface CumulusBattleForeseeOverlayProps {
  initialCount: number;
  side: BattleSide;
  state: BattleMutableState;
  onClose: () => void;
  onConfirm: (resolution: BattleForeseeResolution) => void;
}

/** Maps live battle state into the pure Cumulus Foresee modal. */
export function CumulusBattleForeseeOverlay({
  initialCount,
  side,
  state,
  onClose,
  onConfirm,
}: CumulusBattleForeseeOverlayProps) {
  const view = useMemo<BattleForeseeView>(() => ({
    deckOwnerLabel: side === "player" ? "your" : `${formatSideLabel(side)}'s`,
    cards: state.sides[side].deck
      .slice(0, Math.max(0, initialCount))
      .flatMap((battleCardId) => {
        const instance = state.cardInstances[battleCardId];
        return instance === undefined
          ? []
          : [{
              battleCardId,
              model: battleGameCardModel(instance),
              displayName: instance.definition.name,
            }];
      }),
  }), [initialCount, side, state.cardInstances, state.sides]);

  return (
    <BattleForeseeOverlay
      view={view}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

import { useMemo } from "react";
import {
  BattleForeseeEditor,
  type BattleForeseeResult,
  type BattleForeseeEditorModel,
} from "../../cumulus/components/battle/BattleForeseeEditor";
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
  onConfirm: (resolution: BattleForeseeResult) => void;
}

/** Maps live battle state into the pure Cumulus Foresee modal. */
export function CumulusBattleForeseeOverlay({
  initialCount,
  side,
  state,
  sourceDreamwellCard,
  onConfirm,
}: CumulusBattleForeseeOverlayProps) {
  const model = useMemo<BattleForeseeEditorModel>(
    () => ({
      initialCount,
      allowedCounts: Array.from(
        { length: state.sides[side].deck.length },
        (_, index) => index + 1,
      ),
      cards: state.sides[side].deck.flatMap((battleCardId) => {
        const instance = state.cardInstances[battleCardId];
        return instance === undefined
          ? []
          : [
              {
                battleCardId,
                card: battleGameCardModel(instance),
              },
            ];
      }),
      ...(sourceDreamwellCard === undefined
        ? {}
        : { source: dreamwellCardModel(sourceDreamwellCard) }),
    }),
    [initialCount, side, sourceDreamwellCard, state.cardInstances, state.sides],
  );

  return <BattleForeseeEditor model={model} onConfirm={onConfirm} />;
}

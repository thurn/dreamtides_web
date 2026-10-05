import { useMemo } from "react";
import { BattleDeckOrderOverlay } from "../../cumulus/screens/battle-overlays/BattleDeckOrderOverlay";
import type { BattleMutableState, BattleSide } from "../types";
import type { BattleCardId } from "../../types/identifiers";
import { formatNumber } from "../../runtime/format-number";

export type BattleDeckOrderPickerScope = "top-N" | "full";

export function BattleDeckOrderPicker({
  initialOrder,
  onCancel,
  onConfirm,
  scopeLabel,
  side,
  state,
}: {
  initialOrder: readonly BattleCardId[];
  onCancel: () => void;
  onConfirm: (order: readonly BattleCardId[]) => void;
  scopeLabel: BattleDeckOrderPickerScope;
  side: BattleSide;
  state: BattleMutableState;
}) {
  const itemsById = useMemo(
    () =>
      new Map(
        initialOrder.map((id) => {
          const instance = state.cardInstances[id];
          return [
            id,
            {
              id,
              ...(instance === undefined
                ? {
                    label: "Missing card instance",
                    summary: `${id}`,
                  }
                : {
                    label: instance.definition.name,
                    summary: `${instance.definition.subtype} · Spark ${formatNumber(instance.definition.printedSpark ?? 0)}`,
                  }),
            },
          ] as const;
        }),
      ),
    [initialOrder, state.cardInstances],
  );

  return (
    <BattleDeckOrderOverlay
      title={
        scopeLabel === "full"
          ? side === "player"
            ? "Reorder Player Deck"
            : "Reorder Opponent Deck"
          : side === "player"
            ? "Reorder Revealed Cards of Player Deck"
            : "Reorder Revealed Cards of Opponent Deck"
      }
      label={side === "player" ? "Player deck order" : "Opponent deck order"}
      scope={scopeLabel}
      side={side}
      initialOrder={initialOrder}
      itemsById={itemsById}
      onCancel={onCancel}
      onConfirm={(draftOrder) => {
        onConfirm(
          scopeLabel === "full"
            ? draftOrder
            : [
                ...draftOrder,
                ...state.sides[side].deck.slice(draftOrder.length),
              ],
        );
      }}
    />
  );
}

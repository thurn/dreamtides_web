import { useMemo } from "react";
import { BattleDeckOrderOverlay } from "../../cumulus/screens/battle-overlays/BattleDeckOrderOverlay";
import type { BattleMutableState, BattleSide } from "../types";
import { tx, txa } from "@trox/runtime";
import { localizedSourceText } from "../../runtime/localization/runtime";

export type BattleDeckOrderPickerScope = "top-N" | "full";

export function BattleDeckOrderPicker({
  initialOrder,
  onCancel,
  onConfirm,
  scopeLabel,
  side,
  state,
}: {
  initialOrder: readonly string[];
  onCancel: () => void;
  onConfirm: (order: readonly string[]) => void;
  scopeLabel: BattleDeckOrderPickerScope;
  side: BattleSide;
  state: BattleMutableState;
}) {
  const itemsById = useMemo(
    () =>
      Object.fromEntries(
        initialOrder.map((id) => {
          const instance = state.cardInstances[id];
          return [
            id,
            {
              id,
              ...(instance === undefined
                ? {
                    label: tx(
                      "Missing card instance",
                      "Fallback label in the battle deck-order list when a persisted battle card instance cannot be found.",
                    ),
                    summary: txa(
                      "{card_instance_id}",
                      { card_instance_id: id },
                      "Technical battle card-instance UUID shown as the complete secondary row detail when the corresponding persisted card object is unavailable.",
                    ),
                  }
                : {
                    label: localizedSourceText(instance.definition.name),
                    summary: txa(
                      "{subtype} · Spark {spark}",
                      {
                        subtype: instance.definition.subtype,
                        spark: instance.definition.printedSpark ?? 0,
                      },
                      "Secondary detail beneath one card in the battle deck-order list. subtype is the card's authored subtype and remains grammatically opaque; spark is its non-negative printed Spark value.",
                    ),
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
            ? tx(
                "Reorder Player Deck",
                "Title of the full-deck ordering dialog for the Player side in a locally controlled battle.",
              )
            : tx(
                "Reorder Opponent Deck",
                "Title of the full-deck ordering dialog for the Opponent side in a locally controlled battle.",
              )
          : side === "player"
            ? tx(
                "Reorder Revealed Cards of Player Deck",
                "Title of the partial deck-ordering dialog for revealed cards from the Player side's deck.",
              )
            : tx(
                "Reorder Revealed Cards of Opponent Deck",
                "Title of the partial deck-ordering dialog for revealed cards from the Opponent side's deck.",
              )
      }
      label={
        side === "player"
          ? tx(
              "Player deck order",
              "Accessible name for the ordered Player deck card list.",
            )
          : tx(
              "Opponent deck order",
              "Accessible name for the ordered Opponent deck card list.",
            )
      }
      scope={scopeLabel}
      side={side}
      initialOrder={initialOrder}
      itemsById={itemsById}
      onCancel={onCancel}
      onConfirm={(draftOrder) =>
        onConfirm(
          scopeLabel === "full"
            ? [...draftOrder]
            : [
                ...draftOrder,
                ...state.sides[side].deck.slice(draftOrder.length),
              ],
        )
      }
    />
  );
}

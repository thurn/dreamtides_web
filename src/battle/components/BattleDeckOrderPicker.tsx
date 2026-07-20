import { useMemo } from "react";
import { BattleDeckOrderOverlay } from "../../cumulus/screens/battle-overlays/BattleDeckOrderOverlay";
import type { BattleMutableState, BattleSide } from "../types";
import { formatSideLabel } from "../ui/format";

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
    () => Object.fromEntries(initialOrder.map((id) => {
      const instance = state.cardInstances[id];
      return [id, {
        id,
        label: instance?.definition.name ?? "Missing card instance",
        summary: instance === undefined
          ? id
          : `${instance.definition.subtype} · Spark ${String(instance.definition.printedSpark ?? 0)}`,
      }] as const;
    })),
    [initialOrder, state.cardInstances],
  );

  return (
    <BattleDeckOrderOverlay
      title={scopeLabel === "full"
        ? `Reorder ${formatSideLabel(side)} Deck`
        : `Reorder Revealed Cards of ${formatSideLabel(side)} Deck`}
      label={`${formatSideLabel(side)} deck order`}
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

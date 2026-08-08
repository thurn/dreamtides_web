import { useMemo } from "react";
import { useMessages } from "../../cumulus/hooks/use-messages";
import { createMessageDescriptor } from "../../data/localization-descriptors";
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
  const t = useMessages();
  const itemsById = useMemo(
    () => Object.fromEntries(initialOrder.map((id) => {
      const instance = state.cardInstances[id];
      return [id, {
        id,
        label: instance?.definition.name ?? t("battle-missing-card-instance"),
        summary: instance === undefined
          ? id
          : t("battle-card-order-spark-summary", {
              subtype: instance.definition.subtype,
              spark: instance.definition.printedSpark ?? 0,
            }),
      }] as const;
    })),
    [initialOrder, state.cardInstances],
  );

  return (
    <BattleDeckOrderOverlay
      title={createMessageDescriptor("battle-deck-order-title", {
        scope: scopeLabel === "full" ? "full" : "top",
        side: formatSideLabel(side),
      })}
      label={createMessageDescriptor("battle-deck-order-label", {
        side: formatSideLabel(side),
      })}
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

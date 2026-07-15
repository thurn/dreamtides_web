import { useEffect, useMemo, useRef, useState } from "react";
import { CardOrderEditor } from "../../cumulus/components/controls/CardOrderEditor";
import { GlassButton } from "../../cumulus/components/controls/GlassButton";
import { GlassDialog } from "../../cumulus/components/overlay/GlassDialog";
import { token } from "../../cumulus/primitives/tokens";
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
  const [draftOrder, setDraftOrder] = useState<readonly string[]>(() => [...initialOrder]);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const finalOrder = (): readonly string[] => scopeLabel === "full"
    ? [...draftOrder]
    : [...draftOrder, ...state.sides[side].deck.slice(draftOrder.length)];
  const items = useMemo(
    () => draftOrder.map((id) => {
      const instance = state.cardInstances[id];
      return {
        id,
        label: instance?.definition.name ?? "Missing card instance",
        summary: instance === undefined
          ? id
          : `${instance.definition.subtype} · Spark ${String(instance.definition.printedSpark ?? 0)}`,
      };
    }),
    [draftOrder, state.cardInstances],
  );

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    return () => previouslyFocusedRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  return (
    <GlassDialog
      title={scopeLabel === "full"
        ? `Reorder ${formatSideLabel(side)} Deck`
        : `Reorder Revealed Cards of ${formatSideLabel(side)} Deck`}
      subtitle="Top to bottom. Confirm commits one battle command."
      closeLabel="Cancel deck ordering"
      onClose={onCancel}
    >
      <div
        data-battle-deck-order-picker=""
        data-battle-deck-order-scope={scopeLabel}
        data-battle-deck-order-side={side}
        style={{ display: "grid", gap: token("--space-5") }}
      >
        <CardOrderEditor
          label={`${formatSideLabel(side)} deck order`}
          items={items}
          onOrderChange={setDraftOrder}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: token("--space-3") }}>
          <GlassButton label="Cancel" placement="onGlass" testId="battle-deck-order-cancel" onPress={onCancel} />
          <GlassButton label="Confirm Order" placement="onGlass" variant="accent" testId="battle-deck-order-confirm" onPress={() => onConfirm(finalOrder())} />
        </div>
      </div>
    </GlassDialog>
  );
}

import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  CardOrderEditor,
  type CardOrderEditorItem,
} from "../../components/controls/CardOrderEditor";
import { GlassButton } from "../../components/controls/GlassButton";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { token } from "../../primitives/tokens";

export interface BattleDeckOrderOverlayProps {
  readonly title: string;
  readonly label: string;
  readonly scope: "top-N" | "full";
  readonly side: string;
  readonly initialOrder: readonly string[];
  readonly itemsById: Readonly<Record<string, CardOrderEditorItem>>;
  readonly onCancel: () => void;
  readonly onConfirm: (order: readonly string[]) => void;
}

/** Pure Cumulus presentation for ordering a battle deck selection. */
export function BattleDeckOrderOverlay({
  title,
  label,
  scope,
  side,
  initialOrder,
  itemsById,
  onCancel,
  onConfirm,
}: BattleDeckOrderOverlayProps): ReactElement {
  const [draftOrder, setDraftOrder] = useState<readonly string[]>(() => [
    ...initialOrder,
  ]);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const items = draftOrder.flatMap((id) => {
    const item = itemsById[id];
    return item === undefined ? [] : [item];
  });

  useEffect(() => {
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
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
      title={title}
      subtitle="Top to bottom. Confirm commits one battle command."
      closeLabel="Cancel deck ordering"
      onClose={onCancel}
    >
      <div
        data-battle-deck-order-picker=""
        data-battle-deck-order-scope={scope}
        data-battle-deck-order-side={side}
        style={{ display: "grid", gap: token("--space-m") }}
      >
        <CardOrderEditor
          label={label}
          items={items}
          placement="onGlass"
          onOrderChange={setDraftOrder}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: token("--space-xs"),
          }}
        >
          <GlassButton
            label="Cancel"
            placement="onGlass"
            testId="battle-deck-order-cancel"
            onPress={onCancel}
          />
          <GlassButton
            label="Confirm Order"
            placement="onGlass"
            variant="accent"
            testId="battle-deck-order-confirm"
            onPress={() => onConfirm(draftOrder)}
          />
        </div>
      </div>
    </GlassDialog>
  );
}

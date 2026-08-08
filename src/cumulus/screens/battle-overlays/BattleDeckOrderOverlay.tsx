import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  CardOrderEditor,
  type CardOrderEditorItem,
} from "../../components/controls/CardOrderEditor";
import { GlassButton } from "../../components/controls/GlassButton";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { token } from "../../primitives/tokens";
import { useMessages } from "../../hooks/use-messages";
import type { FluentMessageDescriptor } from "../../../data/localization-messages";
import { formatMessageDescriptor } from "../../hooks/use-messages";

export interface BattleDeckOrderOverlayProps {
  readonly title: string | FluentMessageDescriptor;
  readonly label: string | FluentMessageDescriptor;
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
  const t = useMessages();
  const [draftOrder, setDraftOrder] = useState<readonly string[]>(() => [
    ...initialOrder,
  ]);
  const titleText = typeof title === "string" ? title : formatMessageDescriptor(t, title);
  const labelText = typeof label === "string" ? label : formatMessageDescriptor(t, label);
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
      title={titleText}
      subtitle={t("battle-deck-order-subtitle")}
      closeLabel={t("battle-deck-order-close-action")}
      onClose={onCancel}
    >
      <div
        data-battle-deck-order-picker=""
        data-battle-deck-order-scope={scope}
        data-battle-deck-order-side={side}
        style={{ display: "grid", gap: token("--space-m") }}
      >
        <CardOrderEditor
          label={labelText}
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
            label={t("battle-deck-order-cancel-action")}
            placement="onGlass"
            testId="battle-deck-order-cancel"
            onPress={onCancel}
          />
          <GlassButton
            label={t("battle-deck-order-confirm-action")}
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

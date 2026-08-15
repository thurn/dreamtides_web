import { useState } from "react";
import { assertLocalized, type LocalizedString } from "@trox/runtime";
import {
  CardOrderEditor,
  type CardOrderEditorItem,
} from "../../components/controls/CardOrderEditor";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { CumulusComponent } from "../registry";
import { parseBattleCardId, type BattleCardId } from "../../../types/identifiers";

const INITIAL: CardOrderEditorItem<BattleCardId>[] = [
  { id: parseBattleCardId("instance-1"), label: assertLocalized("First card") },
  { id: parseBattleCardId("instance-2"), label: assertLocalized("Second card") },
];
function Demo({
  label = assertLocalized("Deck order"),
  placement = "onMedia",
}: {
  label?: LocalizedString | string;
  placement?: GlassControlPlacement;
}) {
  const [items, setItems] = useState(INITIAL);
  const localizedLabel =
    typeof label === "string" ? assertLocalized(label) : label;
  return (
    <CardOrderEditor<BattleCardId>
      label={localizedLabel}
      items={items}
      placement={placement}
      onOrderChange={(ids) =>
        setItems(
          ids.flatMap((id) => items.find((item) => item.id === id) ?? []),
        )
      }
    />
  );
}
export const cardOrderEditorDemo: CumulusComponent = {
  id: "card-order-editor",
  title: "CardOrderEditor",
  blurb:
    "A surface-aware, identity-safe drag-to-reorder control for the battle deck-order workflow, with arrow-key reordering on each drag handle.",
  callout: "Use the default on scene media and dark standalone surfaces.",
  details: [
    "Set placement to onGlass inside GlassPanel, GlassDialog, or DeveloperRail so the editor uses its lighter nested-glass treatment.",
  ],
  group: "Battle",
  docName: "CardOrderEditor",
  Component: Demo,
  usage: [
    {
      code: `<CardOrderEditor label={assertLocalized("Deck order")} items={cards} onOrderChange={setOrderedCardIds} />`,
    },
    {
      code: `<CardOrderEditor label={assertLocalized("Deck order")} items={cards} onOrderChange={setOrderedCardIds} placement="onGlass" />`,
    },
  ],
  demo: { defaultArgs: { label: "Deck order", placement: "onMedia" } },
};

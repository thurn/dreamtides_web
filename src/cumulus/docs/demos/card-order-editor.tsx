import { useState } from "react";
import { assertLocalized } from "@trox/runtime";
import {
  CardOrderEditor,
  type CardOrderEditorItem,
} from "../../components/controls/CardOrderEditor";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { CumulusComponent } from "../registry";

const INITIAL: CardOrderEditorItem[] = [
  { id: "instance-1", label: assertLocalized("First card") },
  { id: "instance-2", label: assertLocalized("Second card") },
];
function Demo({
  label = "Deck order",
  placement = "onMedia",
}: {
  label?: string;
  placement?: GlassControlPlacement;
}) {
  const [items, setItems] = useState(INITIAL);
  return (
    <CardOrderEditor
      label={assertLocalized(label)}
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

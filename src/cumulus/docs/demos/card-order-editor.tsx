import { useState } from "react";
import { CardOrderEditor, type CardOrderEditorItem } from "../../components/controls/CardOrderEditor";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { CumulusComponent } from "../registry";

const INITIAL: CardOrderEditorItem[] = [{ id: "instance-1", label: "First card" }, { id: "instance-2", label: "Second card" }];
function Demo({ label = "Deck order", placement = "onMedia" }: { label?: string; placement?: GlassControlPlacement }) { const [items, setItems] = useState(INITIAL); return <CardOrderEditor label={label} items={items} placement={placement} onOrderChange={(ids) => setItems(ids.flatMap((id) => items.find((item) => item.id === id) ?? []))} />; }
export const cardOrderEditorDemo: CumulusComponent = { id: "card-order-editor", title: "CardOrderEditor", blurb: "A surface-aware, identity-safe top-to-bottom card ordering control for the battle deck-order workflow.", callout: "Use the default on scene media and dark standalone surfaces. Set placement to onGlass inside GlassPanel, GlassDialog, or DeveloperRail so the editor uses its lighter nested-glass treatment.", group: "Components", docName: "CardOrderEditor", Component: Demo, usage: [{ code: `<CardOrderEditor label="Deck order" items={cards} onOrderChange={setOrderedCardIds} />` }, { code: `<CardOrderEditor label="Deck order" items={cards} onOrderChange={setOrderedCardIds} placement="onGlass" />` }], demo: { defaultArgs: { label: "Deck order", placement: "onMedia" } } };

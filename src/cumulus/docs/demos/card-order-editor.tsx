import { useState } from "react";
import { CardOrderEditor, type CardOrderEditorItem } from "../../components/controls/CardOrderEditor";
import type { CumulusComponent } from "../registry";

const INITIAL: CardOrderEditorItem[] = [{ id: "instance-1", label: "First card" }, { id: "instance-2", label: "Second card" }];
function Demo({ label = "Deck order" }: { label?: string }) { const [items, setItems] = useState(INITIAL); return <CardOrderEditor label={label} items={items} onOrderChange={(ids) => setItems(ids.flatMap((id) => items.find((item) => item.id === id) ?? []))} />; }
export const cardOrderEditorDemo: CumulusComponent = { id: "card-order-editor", title: "CardOrderEditor", blurb: "An identity-safe top-to-bottom card ordering control shared by deck and Foresee workflows.", group: "Components", docName: "CardOrderEditor", Component: Demo, usage: [{ code: `<CardOrderEditor label="Deck order" items={cards} onOrderChange={setOrderedCardIds} />` }], demo: { defaultArgs: { label: "Deck order" } } };

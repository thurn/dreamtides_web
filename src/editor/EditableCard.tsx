import { CardView } from "../components/CardView";
import type { CardViewSlots } from "../components/CardView";
import type { EditorCardRecord, EditorDisplayState } from "./types";

export interface EditableCardProps {
  card: EditorCardRecord;
  size: EditorDisplayState["size"];
}

const readOnlySlots: CardViewSlots = {
  energy: (_context, defaultNode) => (
    <div data-editor-field="energy-cost" style={{ display: "contents" }}>
      {defaultNode}
    </div>
  ),
  name: (_context, defaultNode) => (
    <div data-editor-field="name" style={{ display: "contents" }}>
      {defaultNode}
    </div>
  ),
  typeLine: (_context, defaultNode) => (
    <div data-editor-field="subtype" style={{ display: "contents" }}>
      {defaultNode}
    </div>
  ),
  rulesText: (_context, defaultNode) => (
    <div data-editor-field="rendered-text" style={{ display: "contents" }}>
      {defaultNode}
    </div>
  ),
  spark: (_context, defaultNode) => (
    <div data-editor-field="spark" style={{ display: "contents" }}>
      {defaultNode}
    </div>
  ),
};

export default function EditableCard({ card, size }: EditableCardProps) {
  return (
    <article
      aria-label={card.name}
      data-editor-card-id={card.id}
      style={{
        display: "grid",
        gap: "10px",
        justifyItems: "center",
      }}
    >
      <CardView
        card={card.preview}
        large={size === "large"}
        hideRulesText={size === "small"}
        slots={readOnlySlots}
      />
      <div
        style={{
          color: "#f7f1df",
          fontSize: "0.9rem",
          fontWeight: 800,
          textAlign: "center",
        }}
      >
        #{card.cardNumber} {card.name}
      </div>
    </article>
  );
}

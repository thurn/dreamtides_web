import type { ReactNode } from "react";
import { CardView } from "../components/CardView";
import type { CardViewSlotContext, CardViewSlots } from "../components/CardView";
import type { EditorCardRecord, EditorDisplayState } from "./types";

export interface EditableCardProps {
  card: EditorCardRecord;
  size: EditorDisplayState["size"];
}

function hasVisibleSubtype(context: CardViewSlotContext): boolean {
  return context.card.subtype !== "" && context.card.subtype !== "*";
}

function renderEditableTypeLineContent(
  context: CardViewSlotContext,
  defaultNode: ReactNode,
): ReactNode {
  if (!hasVisibleSubtype(context)) {
    return defaultNode;
  }

  if (context.card.cardType === "Event") {
    return (
      <span className="truncate">
        <span>{context.card.cardType}</span>
        <span aria-hidden="true"> — </span>
        <span data-editor-field="subtype">{context.card.subtype}</span>
      </span>
    );
  }

  return (
    <span className="truncate" data-editor-field="subtype">
      {context.card.subtype}
    </span>
  );
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
  typeLineContent: (context, defaultNode) =>
    renderEditableTypeLineContent(context, defaultNode),
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

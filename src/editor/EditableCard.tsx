import type { ReactNode } from "react";
import { CardView } from "../components/CardView";
import type { CardViewSlotContext, CardViewSlots } from "../components/CardView";
import EditableField from "./EditableField";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import type { EditorCardRecord, EditorDisplayState } from "./types";

export interface EditableCardProps {
  card: EditorCardRecord;
  size: EditorDisplayState["size"];
  nameSaveEntry: EditableFieldSaveEntry | null;
  onNameBeginEdit: (card: EditorCardRecord, value: EditableFieldValue) => void;
  onNameDraftChange: (card: EditorCardRecord, value: EditableFieldValue) => void;
  onNameCancel: (card: EditorCardRecord) => void;
  onNameSave: (card: EditorCardRecord, value: EditableFieldValue) => void;
}

function readOnlySlot(field: string, defaultNode: ReactNode) {
  return (
    <div data-editor-field={field} style={{ display: "contents" }}>
      {defaultNode}
    </div>
  );
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

export default function EditableCard({
  card,
  size,
  nameSaveEntry,
  onNameBeginEdit,
  onNameDraftChange,
  onNameCancel,
  onNameSave,
}: EditableCardProps) {
  const visibleName = String(nameSaveEntry?.draftValue ?? card.name);
  const visibleCard = {
    ...card.preview,
    name: visibleName,
  };
  const slots: CardViewSlots = {
    energy: (_context, defaultNode) => readOnlySlot("energy-cost", defaultNode),
    name: (_context, defaultNode) => (
      <EditableField
        field="name"
        value={card.name}
        saveEntry={nameSaveEntry}
        onBeginEdit={(value) => onNameBeginEdit(card, value)}
        onDraftChange={(value) => onNameDraftChange(card, value)}
        onCancel={() => onNameCancel(card)}
        onSave={(value) => onNameSave(card, value)}
      >
        {defaultNode}
      </EditableField>
    ),
    typeLineContent: (context, defaultNode) =>
      renderEditableTypeLineContent(context, defaultNode),
    rulesText: (_context, defaultNode) => readOnlySlot("rendered-text", defaultNode),
    spark: (_context, defaultNode) => readOnlySlot("spark", defaultNode),
  };

  return (
    <article
      aria-label={visibleName}
      data-editor-card-id={card.id}
      style={{
        display: "grid",
        gap: "10px",
        justifyItems: "center",
      }}
    >
      <CardView
        card={visibleCard}
        large={size === "large"}
        hideRulesText={size === "small"}
        slots={slots}
      />
      <div
        style={{
          color: "#f7f1df",
          fontSize: "0.9rem",
          fontWeight: 800,
          textAlign: "center",
        }}
      >
        #{card.cardNumber} {visibleName}
      </div>
    </article>
  );
}

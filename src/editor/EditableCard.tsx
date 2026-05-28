import type { ReactNode } from "react";
import { CardView } from "../components/CardView";
import type { CardViewSlots } from "../components/CardView";
import EditableField from "./EditableField";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import type { EditableCardField, EditorCardRecord, EditorDisplayState } from "./types";

export interface EditableCardProps {
  card: EditorCardRecord;
  size: EditorDisplayState["size"];
  nameSaveEntry: EditableFieldSaveEntry | null;
  energySaveEntry: EditableFieldSaveEntry | null;
  sparkSaveEntry: EditableFieldSaveEntry | null;
  subtypeSaveEntry: EditableFieldSaveEntry | null;
  onFieldBeginEdit: (
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (card: EditorCardRecord, field: EditableCardField) => void;
  onFieldSave: (
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) => void;
}

function readOnlySlot(field: string, defaultNode: ReactNode) {
  return (
    <div data-editor-field={field} style={{ display: "contents" }}>
      {defaultNode}
    </div>
  );
}

function displayEditorValue(value: EditableFieldValue): EditableFieldValue {
  return value === "*" ? "X" : value;
}

function numericPreviewValue(
  value: EditableFieldValue,
  { allowBlank }: { allowBlank: boolean },
): number | null {
  const textValue = String(value).trim();

  if ((allowBlank && textValue === "") || textValue === "*" || textValue === "X") {
    return null;
  }

  if (/^\d+$/u.test(textValue)) {
    return Number(textValue);
  }

  return null;
}

function sparkPlaceholder() {
  return (
    <span
      aria-label="spark placeholder"
      data-editor-spark-placeholder="true"
      style={{
        alignItems: "center",
        border: "1px dashed rgba(250, 204, 21, 0.65)",
        borderRadius: "999px",
        color: "rgba(250, 204, 21, 0.82)",
        display: "inline-flex",
        fontSize: "0.7rem",
        fontWeight: 900,
        height: "20px",
        justifyContent: "center",
        lineHeight: 1,
        width: "20px",
      }}
    >
      +
    </span>
  );
}

function subtypePlaceholder() {
  return (
    <span
      data-editor-subtype-placeholder="true"
      style={{
        border: "1px dashed rgba(226, 232, 240, 0.42)",
        borderRadius: "4px",
        color: "rgba(226, 232, 240, 0.68)",
        display: "inline-block",
        fontSize: "0.72em",
        fontWeight: 800,
        lineHeight: 1.1,
        padding: "1px 4px",
      }}
    >
      Add subtype
    </span>
  );
}

export default function EditableCard({
  card,
  size,
  nameSaveEntry,
  energySaveEntry,
  sparkSaveEntry,
  subtypeSaveEntry,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
}: EditableCardProps) {
  const visibleName = String(nameSaveEntry?.draftValue ?? card.name);
  const visibleEnergyCost = numericPreviewValue(
    energySaveEntry?.draftValue ?? card["energy-cost"],
    { allowBlank: false },
  );
  const visibleSpark = numericPreviewValue(
    sparkSaveEntry?.draftValue ?? card.spark,
    { allowBlank: true },
  );
  const visibleSubtype = String(subtypeSaveEntry?.draftValue ?? card.subtype);
  const visibleCard = {
    ...card.preview,
    energyCost: visibleEnergyCost,
    name: visibleName,
    spark: visibleSpark,
    subtype: visibleSubtype,
  };
  const renderSubtypeEditor = (children: ReactNode) => (
    <EditableField
      field="subtype"
      layout="inline"
      value={card.subtype}
      saveEntry={subtypeSaveEntry}
      onBeginEdit={(value) => onFieldBeginEdit(card, "subtype", value)}
      onDraftChange={(value) => onFieldDraftChange(card, "subtype", value)}
      onCancel={() => onFieldCancel(card, "subtype")}
      onSave={(value) => onFieldSave(card, "subtype", value)}
    >
      {children}
    </EditableField>
  );
  const slots: CardViewSlots = {
    energy: (_context, defaultNode) => (
      <EditableField
        field="energy-cost"
        layout="pip"
        value={displayEditorValue(card["energy-cost"])}
        saveEntry={energySaveEntry}
        onBeginEdit={(value) =>
          onFieldBeginEdit(card, "energy-cost", value)}
        onDraftChange={(value) =>
          onFieldDraftChange(card, "energy-cost", value)}
        onCancel={() => onFieldCancel(card, "energy-cost")}
        onSave={(value) => onFieldSave(card, "energy-cost", value)}
      >
        {defaultNode}
      </EditableField>
    ),
    name: (_context, defaultNode) => (
      <EditableField
        field="name"
        value={card.name}
        saveEntry={nameSaveEntry}
        onBeginEdit={(value) => onFieldBeginEdit(card, "name", value)}
        onDraftChange={(value) => onFieldDraftChange(card, "name", value)}
        onCancel={() => onFieldCancel(card, "name")}
        onSave={(value) => onFieldSave(card, "name", value)}
      >
        {defaultNode}
      </EditableField>
    ),
    typeLineContent: (context, defaultNode) => {
      const subtype = context.card.subtype.trim();
      const hasSubtype = subtype !== "" && subtype !== "*";

      if (context.card.cardType === "Event") {
        return (
          <span className="truncate">
            <span data-editor-type-line-card-type="true">
              {context.card.cardType}
            </span>
            <span aria-hidden="true"> — </span>
            {renderSubtypeEditor(
              hasSubtype ? (
                <span>{subtype}</span>
              ) : (
                subtypePlaceholder()
              ),
            )}
          </span>
        );
      }

      if (hasSubtype) {
        return renderSubtypeEditor(<span className="truncate">{subtype}</span>);
      }

      if (context.card.cardType === "Character") {
        return renderSubtypeEditor(subtypePlaceholder());
      }

      return defaultNode;
    },
    rulesText: (_context, defaultNode) => readOnlySlot("rendered-text", defaultNode),
    spark: (_context, defaultNode) => (
      <div className="mt-auto flex items-center justify-end pt-0.5">
        <EditableField
          field="spark"
          layout="pip"
          value={displayEditorValue(card.spark)}
          saveEntry={sparkSaveEntry}
          onBeginEdit={(value) => onFieldBeginEdit(card, "spark", value)}
          onDraftChange={(value) => onFieldDraftChange(card, "spark", value)}
          onCancel={() => onFieldCancel(card, "spark")}
          onSave={(value) => onFieldSave(card, "spark", value)}
        >
          {defaultNode ?? sparkPlaceholder()}
        </EditableField>
      </div>
    ),
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

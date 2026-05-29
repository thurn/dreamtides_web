import { useRef, type ReactNode } from "react";
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
  rulesTextSaveEntry: EditableFieldSaveEntry | null;
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
  onFieldCommit: (
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) => void;
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

export default function EditableCard({
  card,
  size,
  nameSaveEntry,
  energySaveEntry,
  sparkSaveEntry,
  subtypeSaveEntry,
  rulesTextSaveEntry,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
}: EditableCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);

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
  const visibleRulesText = String(
    rulesTextSaveEntry?.draftValue ?? card["rendered-text"],
  );
  const visibleCard = {
    ...card.preview,
    energyCost: visibleEnergyCost,
    name: visibleName,
    renderedText: visibleRulesText,
    spark: visibleSpark,
    subtype: visibleSubtype,
  };

  // Common props for an editable region. EditableField is a `display: contents`
  // wrapper, so the rendered card geometry is exactly CardView's; the editor
  // only swaps in an input on the same spot while a field is being edited and
  // floats its save status in a fixed overlay.
  const fieldProps = (
    field: EditableCardField,
    value: EditableFieldValue,
    saveEntry: EditableFieldSaveEntry | null,
  ) => ({
    field,
    value,
    saveEntry,
    cardAnchorRef: cardRef,
    onBeginEdit: (next: EditableFieldValue) =>
      onFieldBeginEdit(card, field, next),
    onDraftChange: (next: EditableFieldValue) =>
      onFieldDraftChange(card, field, next),
    onCancel: () => onFieldCancel(card, field),
    onSave: (next: EditableFieldValue) => onFieldSave(card, field, next),
    onCommit: (next: EditableFieldValue) => onFieldCommit(card, field, next),
  });

  const renderSubtypeField = (children: ReactNode) => (
    <EditableField
      {...fieldProps("subtype", card.subtype, subtypeSaveEntry)}
      layout="inline"
    >
      {children}
    </EditableField>
  );

  const slots: CardViewSlots = {
    energy: (_context, defaultNode) => (
      <EditableField
        {...fieldProps(
          "energy-cost",
          displayEditorValue(card["energy-cost"]),
          energySaveEntry,
        )}
        layout="pip"
      >
        {defaultNode}
      </EditableField>
    ),
    name: (_context, defaultNode) => (
      <EditableField {...fieldProps("name", card.name, nameSaveEntry)}>
        {defaultNode}
      </EditableField>
    ),
    typeLineContent: (context, defaultNode) => {
      const subtype = context.card.subtype.trim();
      const hasSubtype = subtype !== "" && subtype !== "*";
      const editingSubtype = subtypeSaveEntry?.status === "editing";
      // Keep the subtype field mounted while a save is in flight or just
      // settled so its floating status badge has a home even when the saved
      // value is blank.
      const subtypeActive =
        subtypeSaveEntry !== null && subtypeSaveEntry.status !== "idle";
      const showSubtypeText = hasSubtype || editingSubtype;
      const mountSubtypeField = showSubtypeText || subtypeActive;

      if (context.card.cardType === "Event") {
        return (
          <span className="truncate">
            <span data-editor-type-line-card-type="true">
              {context.card.cardType}
            </span>
            {mountSubtypeField ? (
              <>
                {showSubtypeText ? <span aria-hidden="true"> — </span> : null}
                {renderSubtypeField(
                  hasSubtype ? <span>{subtype}</span> : <span />,
                )}
              </>
            ) : null}
          </span>
        );
      }

      if (mountSubtypeField) {
        return renderSubtypeField(
          hasSubtype ? <span className="truncate">{subtype}</span> : <span />,
        );
      }

      return defaultNode;
    },
    rulesText: (_context, defaultNode) => (
      <EditableField
        {...fieldProps("rendered-text", card["rendered-text"], rulesTextSaveEntry)}
        mode="multiline"
      >
        {defaultNode}
      </EditableField>
    ),
    spark: (_context, defaultNode) => {
      const sparkActive =
        sparkSaveEntry !== null && sparkSaveEntry.status !== "idle";
      if (!sparkActive && defaultNode === null) {
        // No spark value: match CardView and render nothing. The editor does
        // not offer an "add spark" affordance. While a save is in flight or
        // settled the field stays mounted so its status badge has a home.
        return null;
      }

      // CardView owns the bottom-right spark container, so this stays a stable
      // EditableField in both display and edit states (no remount on edit).
      return (
        <EditableField
          {...fieldProps("spark", displayEditorValue(card.spark), sparkSaveEntry)}
          layout="pip"
        >
          {defaultNode}
        </EditableField>
      );
    },
  };

  return (
    <article
      ref={cardRef}
      aria-label={visibleName}
      data-editor-card-id={card.id}
      style={{ display: "block" }}
    >
      <CardView
        card={visibleCard}
        large={size === "large"}
        suppressHoverHelp
        slots={slots}
      />
    </article>
  );
}

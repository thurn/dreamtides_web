import { useRef, type ReactNode } from "react";
import { DreamwellEditorPreview } from "./DreamwellEditorPreview";
import EditableField from "./EditableField";
import {
  dreamwellPreviewCard,
  type EditableDreamwellField,
  type EditorDreamwellRecord,
  type DreamwellSize,
} from "./dreamwell-types";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";

export interface EditableDreamwellProps {
  record: EditorDreamwellRecord;
  size: DreamwellSize;
  nameSaveEntry: EditableFieldSaveEntry | null;
  rulesTextSaveEntry: EditableFieldSaveEntry | null;
  energySaveEntry: EditableFieldSaveEntry | null;
  orderSaveEntry: EditableFieldSaveEntry | null;
  artEditing: boolean;
  onOpenArtEditor: (record: EditorDreamwellRecord) => void;
  onFieldBeginEdit: (
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
  ) => void;
  onFieldSave: (
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
    value: EditableFieldValue,
  ) => void;
}

/** Parse a whole-number draft value into a non-negative integer, or null. */
function wholeNumberDraft(value: EditableFieldValue): number | null {
  const text = String(value).trim();
  return /^\d+$/u.test(text) ? Number(text) : null;
}

/**
 * One Dreamwell card in the editor grid. The card itself is the in-game
 * {@link DreamwellEditorPreview}, with its name heading, rules box, and energy orb
 * wrapped in inline {@link EditableField} editors — double-click any of them to
 * edit in place, exactly like the card, dreamsign, and figment editors. The tier
 * is edited inline through the caption beneath the card. Edit mode instead opens
 * the focused editor for the whole record, where every field — the art image and
 * its pan/zoom crop included — is edited together.
 */
export default function EditableDreamwell({
  record,
  size,
  nameSaveEntry,
  rulesTextSaveEntry,
  energySaveEntry,
  orderSaveEntry,
  artEditing,
  onOpenArtEditor,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
}: EditableDreamwellProps) {
  const cardRef = useRef<HTMLElement | null>(null);

  const visibleName = String(nameSaveEntry?.draftValue ?? record.name);
  const visibleRulesText = String(
    rulesTextSaveEntry?.draftValue ?? record["rendered-text"],
  );
  const visibleEnergy =
    wholeNumberDraft(energySaveEntry?.draftValue ?? record["energy-added"]) ??
    record["energy-added"];
  const visibleOrder =
    wholeNumberDraft(orderSaveEntry?.draftValue ?? record.order) ?? record.order;

  const visibleCard = {
    ...dreamwellPreviewCard(record),
    name: visibleName,
    renderedText: visibleRulesText,
    energyAdded: visibleEnergy,
  };

  const fieldProps = (
    field: EditableDreamwellField,
    value: EditableFieldValue,
    saveEntry: EditableFieldSaveEntry | null,
  ) => ({
    field,
    value,
    saveEntry,
    cardAnchorRef: cardRef,
    onBeginEdit: (next: EditableFieldValue) =>
      onFieldBeginEdit(record, field, next),
    onDraftChange: (next: EditableFieldValue) =>
      onFieldDraftChange(record, field, next),
    onCancel: () => onFieldCancel(record, field),
    onSave: (next: EditableFieldValue) => onFieldSave(record, field, next),
    onCommit: (next: EditableFieldValue) => onFieldCommit(record, field, next),
  });

  const slots = {
    name: (defaultNode: ReactNode) => (
      <EditableField {...fieldProps("name", record.name, nameSaveEntry)}>
        {defaultNode}
      </EditableField>
    ),
    energy: (defaultNode: ReactNode) => (
      <EditableField
        {...fieldProps("energy-added", record["energy-added"], energySaveEntry)}
        layout="pip"
      >
        {defaultNode}
      </EditableField>
    ),
    rulesText: (defaultNode: ReactNode) => (
      <EditableField
        {...fieldProps("rendered-text", record["rendered-text"], rulesTextSaveEntry)}
        mode="multiline"
      >
        {defaultNode ?? (
          <span style={{ opacity: 0.55, fontStyle: "italic" }}>
            Add rules text
          </span>
        )}
      </EditableField>
    ),
  };

  const orderEditing = orderSaveEntry?.status === "editing";

  return (
    <div>
      {artEditing ? (
        <article
          ref={cardRef}
          aria-label={visibleName}
          data-editor-dreamwell-id={record.id}
          style={{ display: "block", position: "relative" }}
        >
          <button
            type="button"
            aria-label={`Edit ${visibleName}`}
            onClick={() => onOpenArtEditor(record)}
            style={{
              display: "block",
              width: "100%",
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              borderRadius: "12px",
            }}
          >
            <DreamwellEditorPreview card={visibleCard} />
          </button>
        </article>
      ) : (
        <article
          ref={cardRef}
          aria-label={visibleName}
          data-editor-dreamwell-id={record.id}
          style={{ display: "block", position: "relative" }}
        >
          <DreamwellEditorPreview card={visibleCard} slots={slots} />
        </article>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "baseline",
          gap: "6px",
          marginTop: "8px",
          fontSize: size === "small" ? "0.68rem" : "0.74rem",
          color: "#8a948f",
        }}
      >
        <span>Tier</span>
        <span
          style={{
            color: "#c9d3cf",
            fontWeight: 700,
            minWidth: "1ch",
            display: "inline-flex",
          }}
        >
          <EditableField
            {...fieldProps("order", record.order, orderSaveEntry)}
            layout="inline"
          >
            <span
              title="Double-click to change the tier (0-4)"
              style={{ cursor: "text" }}
            >
              {visibleOrder}
            </span>
          </EditableField>
        </span>
        {orderEditing ? (
          <span style={{ color: "#6f7a76" }}>(0-4)</span>
        ) : null}
      </div>
    </div>
  );
}

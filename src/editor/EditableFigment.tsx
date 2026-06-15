import { useRef, type ReactNode } from "react";
import { CardView } from "../components/CardView";
import type { CardViewSlots } from "../components/CardView";
import EditableField from "./EditableField";
import { figmentPreviewCard } from "./figment-types";
import type {
  EditableFigmentField,
  EditorFigmentRecord,
  FigmentSize,
} from "./figment-types";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";

export interface EditableFigmentProps {
  figment: EditorFigmentRecord;
  size: FigmentSize;
  nameSaveEntry: EditableFieldSaveEntry | null;
  subtypeSaveEntry: EditableFieldSaveEntry | null;
  sparkSaveEntry: EditableFieldSaveEntry | null;
  rulesTextSaveEntry: EditableFieldSaveEntry | null;
  artEditing: boolean;
  onOpenArtEditor: (figment: EditorFigmentRecord) => void;
  onFieldBeginEdit: (
    figment: EditorFigmentRecord,
    field: EditableFigmentField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    figment: EditorFigmentRecord,
    field: EditableFigmentField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (figment: EditorFigmentRecord, field: EditableFigmentField) => void;
  onFieldSave: (
    figment: EditorFigmentRecord,
    field: EditableFigmentField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    figment: EditorFigmentRecord,
    field: EditableFigmentField,
    value: EditableFieldValue,
  ) => void;
}

/** Parse a spark draft value into a non-negative integer, or null if invalid. */
function sparkPreviewValue(value: EditableFieldValue): number | null {
  const text = String(value).trim();
  if (/^\d+$/u.test(text)) {
    return Number(text);
  }
  return null;
}

export default function EditableFigment({
  figment,
  size,
  nameSaveEntry,
  subtypeSaveEntry,
  sparkSaveEntry,
  rulesTextSaveEntry,
  artEditing,
  onOpenArtEditor,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
}: EditableFigmentProps) {
  const cardRef = useRef<HTMLElement | null>(null);

  const rulesTextEditing = rulesTextSaveEntry?.status === "editing";
  const visibleName = String(nameSaveEntry?.draftValue ?? figment.name);
  const visibleSubtype = String(subtypeSaveEntry?.draftValue ?? figment.subtype);
  const visibleRulesText = String(
    rulesTextSaveEntry?.draftValue ?? figment["rendered-text"],
  );
  const sparkDraft = sparkSaveEntry?.draftValue ?? figment.spark;
  const visibleSpark = sparkPreviewValue(sparkDraft) ?? figment.spark;

  const visibleCard = {
    ...figmentPreviewCard(figment),
    name: visibleName,
    subtype: visibleSubtype,
    renderedText: visibleRulesText,
    spark: visibleSpark,
  };

  const fieldProps = (
    field: EditableFigmentField,
    value: EditableFieldValue,
    saveEntry: EditableFieldSaveEntry | null,
  ) => ({
    field,
    value,
    saveEntry,
    cardAnchorRef: cardRef,
    onBeginEdit: (next: EditableFieldValue) => onFieldBeginEdit(figment, field, next),
    onDraftChange: (next: EditableFieldValue) =>
      onFieldDraftChange(figment, field, next),
    onCancel: () => onFieldCancel(figment, field),
    onSave: (next: EditableFieldValue) => onFieldSave(figment, field, next),
    onCommit: (next: EditableFieldValue) => onFieldCommit(figment, field, next),
  });

  const renderSubtypeField = (children: ReactNode) => (
    <EditableField
      {...fieldProps("subtype", figment.subtype, subtypeSaveEntry)}
      layout="inline"
    >
      {children}
    </EditableField>
  );

  // Figments are 0-cost: suppress the energy orb the character frame would
  // otherwise show. The slot must return a non-null node (an empty fragment) —
  // CardView falls back to its default orb when a slot returns null/undefined.
  const slots: CardViewSlots = {
    energy: () => <></>,
    name: (_context, defaultNode) => (
      <EditableField {...fieldProps("name", figment.name, nameSaveEntry)}>
        {defaultNode}
      </EditableField>
    ),
    typeLineContent: (context, defaultNode) => {
      const subtype = context.card.subtype.trim();
      const hasSubtype = subtype !== "" && subtype !== "*";
      const editingSubtype = subtypeSaveEntry?.status === "editing";
      const subtypeActive =
        subtypeSaveEntry !== null && subtypeSaveEntry.status !== "idle";
      const mountSubtypeField = hasSubtype || editingSubtype || subtypeActive;

      if (mountSubtypeField) {
        return renderSubtypeField(
          hasSubtype ? <span className="truncate">{subtype}</span> : <span />,
        );
      }

      return defaultNode;
    },
    rulesText: (_context, defaultNode) => (
      <EditableField
        {...fieldProps("rendered-text", figment["rendered-text"], rulesTextSaveEntry)}
        mode="multiline"
      >
        {defaultNode}
      </EditableField>
    ),
    spark: (_context, defaultNode) => (
      <EditableField
        {...fieldProps("spark", figment.spark, sparkSaveEntry)}
        layout="pip"
      >
        {defaultNode}
      </EditableField>
    ),
  };

  if (artEditing) {
    return (
      <article
        ref={cardRef}
        aria-label={visibleName}
        data-editor-figment-id={figment.id}
        style={{ display: "block", position: "relative" }}
      >
        <CardView
          card={visibleCard}
          large={size === "large"}
          suppressHoverHelp
          slots={{ energy: () => <></> }}
          onClick={() => onOpenArtEditor(figment)}
        />
      </article>
    );
  }

  return (
    <article
      ref={cardRef}
      aria-label={visibleName}
      data-editor-figment-id={figment.id}
      style={{ display: "block", position: "relative" }}
    >
      <CardView
        card={visibleCard}
        large={size === "large"}
        suppressHoverHelp
        slots={slots}
        rulesTextboxExpanded={rulesTextEditing}
      />
    </article>
  );
}

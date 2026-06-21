import { useRef, type ReactNode } from "react";
import { CardView } from "../components/CardView";
import type { CardViewSlots } from "../components/CardView";
import EditableField from "./EditableField";
import { figmentHasTitleBar, figmentPreviewCard } from "./figment-types";
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

  // Figments show no name bar at rest. The bar appears for a named figment (one
  // whose identity differs from its subtype, e.g. a Legionnaire that is a
  // Warrior) and while the name is being edited, so the name stays editable in
  // place without changing the art-forward at-rest look.
  const nameActive =
    nameSaveEntry !== null && nameSaveEntry.status !== "idle";
  const showTitleBar = figmentHasTitleBar(visibleName, visibleSubtype) || nameActive;

  // The rules box follows the same reveal-on-edit pattern as the title bar: a
  // figment with no rules text shows no box at rest (matching the in-game
  // figment frame), and the box appears once there is rules text or the field
  // is being edited. A bottom affordance starts the edit for an empty figment.
  const rulesActive =
    rulesTextSaveEntry !== null && rulesTextSaveEntry.status !== "idle";
  const showRulesBox = visibleRulesText.trim() !== "" || rulesActive;

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

  // The figment frame drops the energy orb itself (figments are 0-cost), so the
  // slots here only wrap the inline-editable fields.
  const slots: CardViewSlots = {
    name: (_context, defaultNode) => (
      <EditableField {...fieldProps("name", figment.name, nameSaveEntry)}>
        {defaultNode}
      </EditableField>
    ),
    typeLineContent: (context, defaultNode) => {
      const subtype = context.card.subtype.trim();
      const hasSubtype = subtype !== "";
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
    rulesText: (_context, defaultNode) =>
      showRulesBox ? (
        <EditableField
          {...fieldProps(
            "rendered-text",
            figment["rendered-text"],
            rulesTextSaveEntry,
          )}
          mode="multiline"
        >
          {defaultNode}
        </EditableField>
      ) : (
        // No box at rest: returning the (null) default node keeps the figment
        // art-forward; the affordance below starts a rules edit when wanted.
        defaultNode
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
          figment
          figmentTitleBar={showTitleBar}
          suppressHoverHelp
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
        figment
        figmentTitleBar={showTitleBar}
        suppressHoverHelp
        slots={slots}
        rulesTextboxExpanded={rulesTextEditing}
      />
      {/* With no name bar at rest, this transparent strip over the top-left of
          the art is the affordance to start naming an unnamed figment: a
          double-click begins the name edit, which reveals the title bar with the
          editable field. It clears the corner spark on the right. */}
      {!showTitleBar ? (
        <div
          className="figment-edit-affordance"
          role="button"
          tabIndex={0}
          aria-label={`Edit name for ${visibleName}`}
          title="Double-click to name this figment"
          onDoubleClick={() => onFieldBeginEdit(figment, "name", figment.name)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onFieldBeginEdit(figment, "name", figment.name);
            }
          }}
          style={{
            position: "absolute",
            top: "3.4%",
            left: "5%",
            right: "26%",
            height: "7%",
            cursor: "text",
            zIndex: 6,
          }}
        />
      ) : null}
      {/* With no rules box at rest, this transparent strip over the bottom-left
          of the art (clear of the bottom-right type line) starts a rules edit on
          a double-click, revealing the editable frosted box. */}
      {!showRulesBox ? (
        <div
          className="figment-edit-affordance"
          role="button"
          tabIndex={0}
          aria-label={`Edit rules text for ${visibleName}`}
          title="Double-click to add rules text"
          onDoubleClick={() =>
            onFieldBeginEdit(figment, "rendered-text", figment["rendered-text"])
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onFieldBeginEdit(
                figment,
                "rendered-text",
                figment["rendered-text"],
              );
            }
          }}
          style={{
            position: "absolute",
            bottom: "3.4%",
            left: "5%",
            right: "52%",
            height: "9%",
            cursor: "text",
            zIndex: 5,
          }}
        />
      ) : null}
    </article>
  );
}

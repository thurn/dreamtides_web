import { SIZE_PRESETS } from "../components/card-size";
import EditableCard from "./EditableCard";
import type { EditableSaveState, EditableFieldValue } from "./save-state";
import { fieldSaveEntry } from "./save-state";
import type {
  EditableCardField,
  EditorCardRecord,
  EditorDisplayState,
  EditorTag,
} from "./types";

export interface CardTagSaveState {
  saving: boolean;
  error: string | null;
}

export interface CardEditorGridProps {
  cards: readonly EditorCardRecord[];
  size: EditorDisplayState["size"];
  saveState: EditableSaveState;
  tagEditing: boolean;
  availableTags: EditorTag[];
  tagSaveState: Record<string, CardTagSaveState>;
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
  onAddCardTag: (card: EditorCardRecord, name: string) => void;
  onRemoveCardTag: (card: EditorCardRecord, name: string) => void;
  onOpenManageTags: () => void;
}

export default function CardEditorGrid({
  cards,
  size,
  saveState,
  tagEditing,
  availableTags,
  tagSaveState,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
  onAddCardTag,
  onRemoveCardTag,
  onOpenManageTags,
}: CardEditorGridProps) {
  return (
    <div
      aria-label="Filtered cards"
      data-editor-scroll-region="cards"
      data-editor-grid-size={size}
      style={{
        flex: "1 1 auto",
        minHeight: 0,
        overflowY: "auto",
        overscrollBehavior: "contain",
        paddingRight: "4px",
        paddingBottom: "8px",
        display: "grid",
        // Establishes the container that `100cqw` resolves against, matching
        // the quest draft offer grid so the "large" preset's draft-width
        // formula sizes cards against this grid's own width.
        containerType: "inline-size",
        gridTemplateColumns: SIZE_PRESETS[size].columns,
        gap: SIZE_PRESETS[size].gap,
        alignItems: "start",
      }}
    >
      {cards.map((card) => (
        <EditableCard
          key={card.id}
          card={card}
          size={size}
          nameSaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "name",
          })}
          energySaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "energy-cost",
          })}
          sparkSaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "spark",
          })}
          subtypeSaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "subtype",
          })}
          rulesTextSaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "rendered-text",
          })}
          tagEditing={tagEditing}
          availableTags={availableTags}
          tagSaving={tagSaveState[card.id]?.saving ?? false}
          tagError={tagSaveState[card.id]?.error ?? null}
          onFieldBeginEdit={onFieldBeginEdit}
          onFieldDraftChange={onFieldDraftChange}
          onFieldCancel={onFieldCancel}
          onFieldSave={onFieldSave}
          onFieldCommit={onFieldCommit}
          onAddCardTag={onAddCardTag}
          onRemoveCardTag={onRemoveCardTag}
          onOpenManageTags={onOpenManageTags}
        />
      ))}
    </div>
  );
}

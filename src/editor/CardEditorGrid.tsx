import { SIZE_PRESETS } from "../components/card-size";
import EditableCard from "./EditableCard";
import type { EditableSaveState, EditableFieldValue } from "./save-state";
import { fieldSaveEntry } from "./save-state";
import type {
  EditableCardField,
  EditorCardRecord,
  EditorDisplayState,
} from "./types";

export interface CardEditorGridProps {
  cards: readonly EditorCardRecord[];
  size: EditorDisplayState["size"];
  saveState: EditableSaveState;
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

export default function CardEditorGrid({
  cards,
  size,
  saveState,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
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
          onFieldBeginEdit={onFieldBeginEdit}
          onFieldDraftChange={onFieldDraftChange}
          onFieldCancel={onFieldCancel}
          onFieldSave={onFieldSave}
        />
      ))}
    </div>
  );
}

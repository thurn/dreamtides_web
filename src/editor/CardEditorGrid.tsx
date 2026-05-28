import { SIZE_PRESETS } from "../components/card-size";
import EditableCard from "./EditableCard";
import type { EditableSaveState, EditableFieldValue } from "./save-state";
import { fieldSaveEntry } from "./save-state";
import type { EditorCardRecord, EditorDisplayState } from "./types";

export interface CardEditorGridProps {
  cards: readonly EditorCardRecord[];
  size: EditorDisplayState["size"];
  saveState: EditableSaveState;
  onNameBeginEdit: (card: EditorCardRecord, value: EditableFieldValue) => void;
  onNameDraftChange: (card: EditorCardRecord, value: EditableFieldValue) => void;
  onNameCancel: (card: EditorCardRecord) => void;
  onNameSave: (card: EditorCardRecord, value: EditableFieldValue) => void;
}

export default function CardEditorGrid({
  cards,
  size,
  saveState,
  onNameBeginEdit,
  onNameDraftChange,
  onNameCancel,
  onNameSave,
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
          onNameBeginEdit={onNameBeginEdit}
          onNameDraftChange={onNameDraftChange}
          onNameCancel={onNameCancel}
          onNameSave={onNameSave}
        />
      ))}
    </div>
  );
}

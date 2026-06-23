import CardBrowserGrid from "../components/card-browser/CardBrowserGrid";
import EditableDreamcaller from "./EditableDreamcaller";
import { fieldSaveEntry } from "./save-state";
import type { EditableFieldValue, EditableSaveState } from "./save-state";
import type {
  DreamcallerDisplayState,
  EditableDreamcallerField,
  EditorDreamcallerRecord,
  EditorTideOption,
} from "./dreamcaller-types";

export interface DreamcallerEditorGridProps {
  dreamcallers: readonly EditorDreamcallerRecord[];
  tides: readonly EditorTideOption[];
  size: DreamcallerDisplayState["size"];
  saveState: EditableSaveState;
  tideSaveState: Record<string, boolean>;
  onFieldBeginEdit: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
  ) => void;
  onFieldSave: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) => void;
  onEditTides: (dreamcaller: EditorDreamcallerRecord) => void;
  onViewDetail: (dreamcaller: EditorDreamcallerRecord) => void;
}

export default function DreamcallerEditorGrid({
  dreamcallers,
  tides,
  size,
  saveState,
  tideSaveState,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
  onEditTides,
  onViewDetail,
}: DreamcallerEditorGridProps) {
  return (
    <CardBrowserGrid
      items={dreamcallers}
      size={size}
      getKey={(dreamcaller) => dreamcaller.id}
      containerProps={{
        "aria-label": "Filtered dreamcallers",
        "data-editor-scroll-region": "dreamcallers",
        "data-editor-grid-size": size,
      }}
      getItemProps={() => ({ "data-editor-dreamcaller-item": "" })}
      renderItem={(dreamcaller) => (
        <EditableDreamcaller
          dreamcaller={dreamcaller}
          tides={tides}
          nameSaveEntry={fieldSaveEntry(saveState, { cardId: dreamcaller.id, field: "name" })}
          titleSaveEntry={fieldSaveEntry(saveState, { cardId: dreamcaller.id, field: "title" })}
          abilitySaveEntry={fieldSaveEntry(saveState, {
            cardId: dreamcaller.id,
            field: "rendered-text",
          })}
          essenceSaveEntry={fieldSaveEntry(saveState, {
            cardId: dreamcaller.id,
            field: "starting-essence",
          })}
          imageNumberSaveEntry={fieldSaveEntry(saveState, {
            cardId: dreamcaller.id,
            field: "image-number",
          })}
          tideSaving={tideSaveState[dreamcaller.id] ?? false}
          onFieldBeginEdit={onFieldBeginEdit}
          onFieldDraftChange={onFieldDraftChange}
          onFieldCancel={onFieldCancel}
          onFieldSave={onFieldSave}
          onFieldCommit={onFieldCommit}
          onEditTides={onEditTides}
          onViewDetail={onViewDetail}
        />
      )}
    />
  );
}

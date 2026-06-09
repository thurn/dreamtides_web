import CardBrowserGrid from "../components/card-browser/CardBrowserGrid";
import EditableDreamsign from "./EditableDreamsign";
import type { EditableFieldValue, EditableSaveState } from "./save-state";
import { fieldSaveEntry } from "./save-state";
import type {
  DreamsignDisplayState,
  EditableDreamsignField,
  EditorDreamsignRecord,
} from "./dreamsign-types";
import type { CardTagSaveState } from "./CardEditorGrid";
import type { EditorTag } from "./types";

export interface DreamsignEditorGridProps {
  dreamsigns: readonly EditorDreamsignRecord[];
  size: DreamsignDisplayState["size"];
  saveState: EditableSaveState;
  tagEditing: boolean;
  checkboxTag: string;
  availableTags: EditorTag[];
  tagSaveState: Record<string, CardTagSaveState>;
  onFieldBeginEdit: (
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
  ) => void;
  onFieldSave: (
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
    value: EditableFieldValue,
  ) => void;
  onAddDreamsignTag: (dreamsign: EditorDreamsignRecord, name: string) => void;
  onRemoveDreamsignTag: (dreamsign: EditorDreamsignRecord, name: string) => void;
  onOpenManageTags: () => void;
}

export default function DreamsignEditorGrid({
  dreamsigns,
  size,
  saveState,
  tagEditing,
  checkboxTag,
  availableTags,
  tagSaveState,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
  onAddDreamsignTag,
  onRemoveDreamsignTag,
  onOpenManageTags,
}: DreamsignEditorGridProps) {
  return (
    <CardBrowserGrid
      items={dreamsigns}
      size={size}
      getKey={(dreamsign) => dreamsign.id}
      containerProps={{
        "aria-label": "Filtered dreamsigns",
        "data-editor-scroll-region": "dreamsigns",
        "data-editor-grid-size": size,
      }}
      getItemProps={() => ({ "data-editor-dreamsign-item": "" })}
      renderItem={(dreamsign) => (
        <EditableDreamsign
          dreamsign={dreamsign}
          nameSaveEntry={fieldSaveEntry(saveState, {
            cardId: dreamsign.id,
            field: "name",
          })}
          effectSaveEntry={fieldSaveEntry(saveState, {
            cardId: dreamsign.id,
            field: "rendered-text",
          })}
          tagEditing={tagEditing}
          checkboxTag={checkboxTag}
          availableTags={availableTags}
          tagSaving={tagSaveState[dreamsign.id]?.saving ?? false}
          tagError={tagSaveState[dreamsign.id]?.error ?? null}
          onFieldBeginEdit={onFieldBeginEdit}
          onFieldDraftChange={onFieldDraftChange}
          onFieldCancel={onFieldCancel}
          onFieldSave={onFieldSave}
          onFieldCommit={onFieldCommit}
          onAddDreamsignTag={onAddDreamsignTag}
          onRemoveDreamsignTag={onRemoveDreamsignTag}
          onOpenManageTags={onOpenManageTags}
        />
      )}
    />
  );
}

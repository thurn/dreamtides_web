import CardBrowserGrid from "./card-browser/CardBrowserGrid";
import EditableDreamAvatar from "./EditableDreamAvatar";
import { fieldSaveEntry } from "./save-state";
import type { EditableFieldValue, EditableSaveState } from "./save-state";
import type {
  DreamAvatarDisplayState,
  EditableDreamAvatarField,
  EditorDreamAvatarRecord,
  EditorTideOption,
} from "./dream-avatar-types";

export interface DreamAvatarEditorGridProps {
  dreamAvatars: readonly EditorDreamAvatarRecord[];
  tides: readonly EditorTideOption[];
  size: DreamAvatarDisplayState["size"];
  saveState: EditableSaveState;
  tideSaveState: Record<string, boolean>;
  onFieldBeginEdit: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
  ) => void;
  onFieldSave: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) => void;
  onEditTides: (dreamAvatar: EditorDreamAvatarRecord) => void;
  onViewDetail: (dreamAvatar: EditorDreamAvatarRecord) => void;
}

export default function DreamAvatarEditorGrid({
  dreamAvatars,
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
}: DreamAvatarEditorGridProps) {
  return (
    <CardBrowserGrid
      items={dreamAvatars}
      size={size}
      getKey={(dreamAvatar) => dreamAvatar.id}
      containerProps={{
        "aria-label": "Filtered avatars",
        "data-editor-scroll-region": "dreamAvatars",
        "data-editor-grid-size": size,
      }}
      getItemProps={() => ({ "data-editor-dream-avatar-item": "" })}
      renderItem={(dreamAvatar) => (
        <EditableDreamAvatar
          dreamAvatar={dreamAvatar}
          tides={tides}
          nameSaveEntry={fieldSaveEntry(saveState, { cardId: dreamAvatar.id, field: "name" })}
          titleSaveEntry={fieldSaveEntry(saveState, { cardId: dreamAvatar.id, field: "title" })}
          abilitySaveEntry={fieldSaveEntry(saveState, {
            cardId: dreamAvatar.id,
            field: "rendered-text",
          })}
          essenceSaveEntry={fieldSaveEntry(saveState, {
            cardId: dreamAvatar.id,
            field: "starting-essence",
          })}
          imageNumberSaveEntry={fieldSaveEntry(saveState, {
            cardId: dreamAvatar.id,
            field: "image-number",
          })}
          tideSaving={tideSaveState[dreamAvatar.id] ?? false}
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

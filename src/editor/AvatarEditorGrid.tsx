import CardBrowserGrid from "./card-browser/CardBrowserGrid";
import EditableAvatar from "./EditableAvatar";
import { fieldSaveEntry } from "./save-state";
import type { EditableFieldValue, EditableSaveState } from "./save-state";
import type {
  AvatarDisplayState,
  EditableAvatarField,
  EditorAvatarRecord,
  EditorTideOption,
} from "./avatar-types";

export interface AvatarEditorGridProps {
  avatars: readonly EditorAvatarRecord[];
  tides: readonly EditorTideOption[];
  size: AvatarDisplayState["size"];
  saveState: EditableSaveState;
  tideSaveState: Record<string, boolean>;
  onFieldBeginEdit: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
  ) => void;
  onFieldSave: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) => void;
  onEditTides: (avatar: EditorAvatarRecord) => void;
  onViewDetail: (avatar: EditorAvatarRecord) => void;
}

export default function AvatarEditorGrid({
  avatars,
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
}: AvatarEditorGridProps) {
  return (
    <CardBrowserGrid
      items={avatars}
      size={size}
      getKey={(avatar) => avatar.id}
      containerProps={{
        "aria-label": "Filtered avatars",
        "data-editor-scroll-region": "avatars",
        "data-editor-grid-size": size,
      }}
      getItemProps={() => ({ "data-editor-avatar-item": "" })}
      renderItem={(avatar) => (
        <EditableAvatar
          avatar={avatar}
          tides={tides}
          nameSaveEntry={fieldSaveEntry(saveState, { cardId: avatar.id, field: "name" })}
          titleSaveEntry={fieldSaveEntry(saveState, { cardId: avatar.id, field: "title" })}
          abilitySaveEntry={fieldSaveEntry(saveState, {
            cardId: avatar.id,
            field: "rendered-text",
          })}
          essenceSaveEntry={fieldSaveEntry(saveState, {
            cardId: avatar.id,
            field: "starting-essence",
          })}
          imageNumberSaveEntry={fieldSaveEntry(saveState, {
            cardId: avatar.id,
            field: "image-number",
          })}
          tideSaving={tideSaveState[avatar.id] ?? false}
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

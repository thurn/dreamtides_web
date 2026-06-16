import { useRef } from "react";
import type { CSSProperties } from "react";
import { RulesText } from "../components/RulesText";
import CardTagEditor from "./CardTagEditor";
import EditableField from "./EditableField";
import { readableTextColor, tagColor } from "./tag-color";
import { similarityGroupFor } from "./dreamsign-similarity-groups";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import type {
  EditableDreamsignField,
  EditorDreamsignRecord,
} from "./dreamsign-types";
import type { EditorTag } from "./types";

export interface EditableDreamsignProps {
  dreamsign: EditorDreamsignRecord;
  nameSaveEntry: EditableFieldSaveEntry | null;
  effectSaveEntry: EditableFieldSaveEntry | null;
  tagEditing: boolean;
  checkboxTag: string;
  availableTags: EditorTag[];
  tagSaving: boolean;
  tagError: string | null;
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

const tileStyle: CSSProperties = {
  position: "relative",
  minHeight: "272px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: "8px",
  border: "1px solid rgba(247, 241, 223, 0.18)",
  background: "#172126",
  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.24)",
};

const artFrameStyle: CSSProperties = {
  aspectRatio: "1 / 1",
  width: "100%",
  boxSizing: "border-box",
  borderBottom: "1px solid rgba(247, 241, 223, 0.12)",
  background: "linear-gradient(135deg, #26393c, #11191c)",
};

const bodyStyle: CSSProperties = {
  display: "flex",
  flex: "1 1 auto",
  minHeight: 0,
  flexDirection: "column",
  gap: "8px",
  padding: "10px",
};

const nameStyle: CSSProperties = {
  margin: 0,
  color: "#fff7e0",
  fontSize: "0.98rem",
  fontWeight: 850,
  lineHeight: 1.15,
  letterSpacing: "0",
};

const effectStyle: CSSProperties = {
  minHeight: "72px",
  color: "#dce6e2",
  fontSize: "0.83rem",
  lineHeight: 1.35,
};

interface CheckboxTagControlProps {
  tagName: string;
  checked: boolean;
  color: string;
  saving: boolean;
  onToggle: () => void;
}

function CheckboxTagControl({
  tagName,
  checked,
  color,
  saving,
  onToggle,
}: CheckboxTagControlProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${checked ? "Remove" : "Add"} tag ${tagName}`}
      title={`${checked ? "Remove" : "Add"} tag "${tagName}"`}
      disabled={saving}
      onClick={onToggle}
      style={{
        marginTop: "auto",
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "7px 8px",
        borderRadius: "8px",
        border: checked
          ? `1px solid ${color}`
          : "1px solid rgba(247, 241, 223, 0.28)",
        background: checked ? color : "rgba(15, 23, 25, 0.85)",
        color: checked ? readableTextColor(color) : "#d9e1dd",
        font: "inherit",
        fontWeight: 750,
        fontSize: "0.8rem",
        cursor: saving ? "progress" : "pointer",
        opacity: saving ? 0.6 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: "0 0 auto",
          width: "20px",
          height: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "5px",
          border: checked
            ? "2px solid rgba(255, 255, 255, 0.85)"
            : "2px solid rgba(247, 241, 223, 0.5)",
          background: checked ? "rgba(255, 255, 255, 0.18)" : "transparent",
          fontSize: "0.95rem",
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {checked ? "x" : ""}
      </span>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {tagName}
      </span>
    </button>
  );
}

export default function EditableDreamsign({
  dreamsign,
  nameSaveEntry,
  effectSaveEntry,
  tagEditing,
  checkboxTag,
  availableTags,
  tagSaving,
  tagError,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
  onAddDreamsignTag,
  onRemoveDreamsignTag,
  onOpenManageTags,
}: EditableDreamsignProps) {
  const tileRef = useRef<HTMLElement | null>(null);
  const checkboxActive = checkboxTag !== "";
  const checkboxChecked = checkboxActive && dreamsign.tags.includes(checkboxTag);
  const checkboxColor = tagColor(checkboxTag, availableTags);

  // TEMPORARY: similarity-group badge for de-dup review.
  const similarityGroup = similarityGroupFor(dreamsign.id);

  const toggleCheckboxTag = () => {
    if (checkboxChecked) {
      onRemoveDreamsignTag(dreamsign, checkboxTag);
    } else {
      onAddDreamsignTag(dreamsign, checkboxTag);
    }
  };

  return (
    <article
      ref={tileRef}
      data-editor-dreamsign-id={dreamsign.id}
      style={tileStyle}
    >
      <div style={artFrameStyle}>
        {similarityGroup !== null ? (
          <span
            title={`Similarity group ${similarityGroup.group}: ${similarityGroup.label}`}
            style={{
              position: "absolute",
              top: "8px",
              left: "8px",
              zIndex: 2,
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              maxWidth: "calc(100% - 16px)",
              padding: "3px 8px",
              borderRadius: "999px",
              border: "1px solid rgba(0, 0, 0, 0.45)",
              background: "#f2c14e",
              color: "#1a1205",
              fontSize: "0.74rem",
              fontWeight: 900,
              lineHeight: 1.1,
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.4)",
            }}
          >
            <span aria-hidden="true">#{similarityGroup.group}</span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: 700,
              }}
            >
              {similarityGroup.label}
            </span>
          </span>
        ) : null}
        {dreamsign.imageName !== "" ? (
          <img
            src={`/dreamsigns/${dreamsign.imageName}`}
            alt={dreamsign.imageAlt}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#8edbd1",
              fontSize: "2.4rem",
              fontWeight: 900,
            }}
          >
            *
          </div>
        )}
      </div>

      <div style={bodyStyle}>
        <EditableField
          field="name"
          value={dreamsign.name}
          saveEntry={nameSaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) => onFieldBeginEdit(dreamsign, "name", value)}
          onDraftChange={(value) => onFieldDraftChange(dreamsign, "name", value)}
          onCancel={() => onFieldCancel(dreamsign, "name")}
          onSave={(value) => onFieldSave(dreamsign, "name", value)}
          onCommit={(value) => onFieldCommit(dreamsign, "name", value)}
        >
          <h2 style={nameStyle}>{dreamsign.name}</h2>
        </EditableField>

        <EditableField
          field="rendered-text"
          value={dreamsign["rendered-text"]}
          mode="multiline"
          saveEntry={effectSaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) =>
            onFieldBeginEdit(dreamsign, "rendered-text", value)
          }
          onDraftChange={(value) =>
            onFieldDraftChange(dreamsign, "rendered-text", value)
          }
          onCancel={() => onFieldCancel(dreamsign, "rendered-text")}
          onSave={(value) => onFieldSave(dreamsign, "rendered-text", value)}
          onCommit={(value) => onFieldCommit(dreamsign, "rendered-text", value)}
        >
          <div style={effectStyle}>
            <RulesText text={dreamsign["rendered-text"]} />
          </div>
        </EditableField>

        {checkboxActive ? (
          <CheckboxTagControl
            tagName={checkboxTag}
            checked={checkboxChecked}
            color={checkboxColor}
            saving={tagSaving}
            onToggle={toggleCheckboxTag}
          />
        ) : tagEditing ? (
          <CardTagEditor
            cardTags={dreamsign.tags}
            availableTags={availableTags}
            saving={tagSaving}
            error={tagError}
            onAddTag={(name) => onAddDreamsignTag(dreamsign, name)}
            onRemoveTag={(name) => onRemoveDreamsignTag(dreamsign, name)}
            onOpenManageTags={onOpenManageTags}
          />
        ) : null}
      </div>
    </article>
  );
}

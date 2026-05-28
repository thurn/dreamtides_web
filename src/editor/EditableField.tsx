import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { EditableCardField } from "./types";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";

export interface EditableFieldProps {
  field: EditableCardField;
  value: EditableFieldValue;
  mode?: "single-line" | "multiline";
  saveEntry: EditableFieldSaveEntry | null;
  children: ReactNode;
  onBeginEdit: (value: EditableFieldValue) => void;
  onDraftChange: (value: EditableFieldValue) => void;
  onCancel: () => void;
  onSave: (value: EditableFieldValue) => void;
}

const inputStyle = {
  boxSizing: "border-box",
  width: "100%",
  minHeight: "1.75em",
  border: "1px solid rgba(142, 219, 209, 0.75)",
  borderRadius: "4px",
  background: "rgba(6, 16, 18, 0.95)",
  color: "#fff7e0",
  font: "inherit",
  fontWeight: "inherit",
  lineHeight: "inherit",
  padding: "2px 5px",
} satisfies CSSProperties;

function statusText(entry: EditableFieldSaveEntry | null): string {
  if (entry === null) {
    return "";
  }

  if (entry.message !== null && entry.message !== "") {
    return entry.message;
  }

  switch (entry.status) {
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return "Save failed";
    case "editing":
    case "idle":
      return "";
  }
}

export default function EditableField({
  field,
  value,
  mode = "single-line",
  saveEntry,
  children,
  onBeginEdit,
  onDraftChange,
  onCancel,
  onSave,
}: EditableFieldProps) {
  const isEditing = saveEntry?.status === "editing";
  const draftValue = saveEntry?.draftValue ?? value;
  const status = statusText(saveEntry);
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const editorElement = editorRef.current;
    editorElement?.focus();
    editorElement?.select();
  }, [isEditing]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Enter" && mode === "single-line") {
      event.preventDefault();
      onSave(draftValue);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  const editor =
    mode === "multiline" ? (
      <textarea
        aria-label={`${field} editor`}
        data-editor-input-field={field}
        ref={(element) => {
          editorRef.current = element;
        }}
        value={String(draftValue)}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        style={{ ...inputStyle, minHeight: "4.5em", resize: "vertical" }}
      />
    ) : (
      <input
        aria-label={`${field} editor`}
        data-editor-input-field={field}
        ref={(element) => {
          editorRef.current = element;
        }}
        type="text"
        value={String(draftValue)}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        style={inputStyle}
      />
    );

  return (
    <span
      data-editor-field={field}
      data-editor-save-status={saveEntry?.status ?? "idle"}
      onDoubleClick={() => onBeginEdit(value)}
      style={{
        display: "block",
        minHeight: "2.35em",
        position: "relative",
        width: "100%",
      }}
    >
      {isEditing ? editor : children}
      <span
        aria-live="polite"
        data-editor-field-status={field}
        style={{
          display: "block",
          minHeight: "0.95em",
          color: saveEntry?.status === "error" ? "#f0c6bd" : "#8edbd1",
          fontSize: "0.58rem",
          fontWeight: 800,
          lineHeight: 1.1,
          marginTop: "1px",
          opacity: status === "" ? 0 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {status}
      </span>
    </span>
  );
}

import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { EditableCardField } from "./types";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";

export interface EditableFieldProps {
  field: EditableCardField;
  value: EditableFieldValue;
  layout?: "block" | "inline" | "pip";
  mode?: "single-line" | "multiline";
  saveEntry: EditableFieldSaveEntry | null | undefined;
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

function statusText(entry: EditableFieldSaveEntry | null | undefined): string {
  if (entry === null || entry === undefined) {
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
  layout = "block",
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
  const isErrorStatus =
    saveEntry?.status === "error" ||
    (saveEntry?.status === "editing" &&
      saveEntry.message !== null &&
      saveEntry.message !== "");
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const isInlineLayout = layout === "inline";
  const isPipLayout = layout === "pip";

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
        style={{
          ...inputStyle,
          minHeight: "4.5em",
          resize: "vertical",
        }}
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
        style={{
          ...inputStyle,
          ...(isPipLayout
            ? {
                minHeight: "28px",
                textAlign: "center",
                width: "46px",
              }
            : {}),
          ...(isInlineLayout
            ? {
                minHeight: "22px",
                padding: "1px 5px",
                width: "96px",
              }
            : {}),
        }}
      />
    );

  return (
    <span
      data-editor-field={field}
      data-editor-save-status={saveEntry?.status ?? "idle"}
      onDoubleClick={() => onBeginEdit(value)}
      style={{
        alignItems: isPipLayout || isInlineLayout ? "center" : undefined,
        display: isPipLayout || isInlineLayout ? "inline-flex" : "block",
        flexDirection: isPipLayout || isInlineLayout ? "column" : undefined,
        minHeight: isPipLayout
          ? "2.7em"
          : isInlineLayout
            ? "1.85em"
            : "2.35em",
        minWidth: isPipLayout ? "46px" : undefined,
        position: "relative",
        verticalAlign: isInlineLayout ? "middle" : undefined,
        width: isPipLayout || isInlineLayout ? "auto" : "100%",
      }}
    >
      {isEditing ? editor : children}
      <span
        aria-live="polite"
        data-editor-field-status={field}
        style={{
          display: "block",
          minHeight: "0.95em",
          color: isErrorStatus ? "#f0c6bd" : "#8edbd1",
          fontSize: isPipLayout ? "0.5rem" : isInlineLayout ? "0.48rem" : "0.58rem",
          fontWeight: 800,
          lineHeight: 1.1,
          marginTop: "1px",
          maxWidth: isPipLayout ? "74px" : isInlineLayout ? "96px" : undefined,
          opacity: status === "" ? 0 : 1,
          textAlign: isPipLayout || isInlineLayout ? "center" : undefined,
          whiteSpace: isPipLayout || isInlineLayout ? "normal" : "nowrap",
        }}
      >
        {status}
      </span>
    </span>
  );
}

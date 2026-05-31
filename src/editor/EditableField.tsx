import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { EditableCardField } from "./types";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import { applySymbolReplacements } from "./symbol-replacements";

export interface EditableFieldProps {
  field: EditableCardField;
  value: EditableFieldValue;
  layout?: "block" | "inline" | "pip";
  mode?: "single-line" | "multiline";
  saveEntry: EditableFieldSaveEntry | null | undefined;
  /** Card root element used to anchor the floating save-status badge. */
  cardAnchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  onBeginEdit: (value: EditableFieldValue) => void;
  onDraftChange: (value: EditableFieldValue) => void;
  onCancel: () => void;
  /** Enter / explicit confirm. Invalid values stay in edit mode with a message. */
  onSave: (value: EditableFieldValue) => void;
  /** Blur / click-away. Invalid values are discarded and the editor closes. */
  onCommit: (value: EditableFieldValue) => void;
}

const inputStyle = {
  boxSizing: "border-box",
  width: "100%",
  minHeight: "1.6em",
  border: "1px solid rgba(142, 219, 209, 0.85)",
  borderRadius: "4px",
  background: "rgba(6, 16, 18, 0.97)",
  color: "#fff7e0",
  font: "inherit",
  fontWeight: "inherit",
  lineHeight: "inherit",
  padding: "1px 4px",
} satisfies CSSProperties;

type StatusTone = "saving" | "saved" | "error";

function statusFor(
  entry: EditableFieldSaveEntry | null | undefined,
  savedExpired: boolean,
): { tone: StatusTone; text: string } | null {
  if (entry === null || entry === undefined) {
    return null;
  }

  const hasMessage = entry.message !== null && entry.message !== "";

  if (entry.status === "error") {
    return {
      tone: "error",
      text: hasMessage ? entry.message ?? "" : "Save failed",
    };
  }

  // A validation message can surface while the field is still in edit mode.
  if (entry.status === "editing" && hasMessage) {
    return { tone: "error", text: entry.message ?? "" };
  }

  if (entry.status === "saving") {
    return { tone: "saving", text: "Saving..." };
  }

  if (entry.status === "saved" && !savedExpired) {
    return { tone: "saved", text: "Saved" };
  }

  return null;
}

const TONE_STYLES: Readonly<Record<StatusTone, CSSProperties>> = {
  saving: { background: "rgba(6, 16, 18, 0.96)", color: "#8edbd1" },
  saved: { background: "#11463a", color: "#9af2dd" },
  error: { background: "#4c1d1d", color: "#f7c9bd" },
};

/**
 * Floating save-status badge. Rendered with `position: fixed` so it sits on
 * top of every other surface, is never clipped by the card's `overflow:
 * hidden` chrome, and never pushes the card's own text out of frame. It is
 * anchored to the top-center of the owning card and follows it on
 * scroll/resize.
 */
function FieldStatusBadge({
  anchorRef,
  field,
  tone,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  field: EditableCardField;
  tone: StatusTone;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  useLayoutEffect(() => {
    const element = anchorRef.current;
    if (element === null) {
      return;
    }

    const update = () => {
      const rect = element.getBoundingClientRect();
      setPosition({ left: rect.left + rect.width / 2, top: rect.top + 10 });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  return (
    <span
      data-editor-field-status={field}
      data-editor-status-tone={tone}
      style={{
        position: "fixed",
        left: `${String(position.left)}px`,
        top: `${String(position.top)}px`,
        transform: "translateX(-50%)",
        zIndex: 2147483000,
        pointerEvents: "none",
        padding: "2px 8px",
        borderRadius: "6px",
        fontSize: "0.66rem",
        fontWeight: 800,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
        ...TONE_STYLES[tone],
      }}
    >
      {children}
    </span>
  );
}

export default function EditableField({
  field,
  value,
  layout = "block",
  mode = "single-line",
  saveEntry,
  cardAnchorRef,
  children,
  onBeginEdit,
  onDraftChange,
  onCancel,
  onSave,
  onCommit,
}: EditableFieldProps) {
  const isEditing = saveEntry?.status === "editing";
  const draftValue = saveEntry?.draftValue ?? value;
  const isSavedStatus = saveEntry?.status === "saved";
  const [savedExpired, setSavedExpired] = useState(false);
  const status = statusFor(saveEntry, savedExpired);
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Set when Enter/Escape closes the editor so the trailing blur does not
  // double-commit the same value.
  const closingRef = useRef(false);
  // Caret position to restore after a symbol-shortcut replacement shrinks the
  // text; null when the latest change needs no caret adjustment.
  const pendingCaretRef = useRef<number | null>(null);
  const isPipLayout = layout === "pip";
  const isInlineLayout = layout === "inline";

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    closingRef.current = false;
    const editorElement = editorRef.current;
    editorElement?.focus();
    editorElement?.select();
  }, [isEditing]);

  useEffect(() => {
    if (!isSavedStatus) {
      setSavedExpired(false);
      return;
    }

    setSavedExpired(false);
    const timer = window.setTimeout(() => {
      setSavedExpired(true);
    }, 1800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isSavedStatus, saveEntry]);

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (event.key === "Enter" && (mode === "single-line" || !event.shiftKey)) {
      event.preventDefault();
      closingRef.current = true;
      onSave(draftValue);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closingRef.current = true;
      onCancel();
    }
  }

  function handleBlur() {
    if (closingRef.current) {
      closingRef.current = false;
      return;
    }
    onCommit(draftValue);
  }

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const rawValue = event.currentTarget.value;
    const rawCaret = event.currentTarget.selectionStart ?? rawValue.length;
    const { value: nextValue, caret } = applySymbolReplacements(
      rawValue,
      rawCaret,
    );
    pendingCaretRef.current = nextValue === rawValue ? null : caret;
    onDraftChange(nextValue);
  }

  // After a replacement re-renders the controlled value, the browser would
  // otherwise drop the caret to the end of the text. Restore it next to the
  // inserted glyph.
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) {
      return;
    }
    pendingCaretRef.current = null;
    editorRef.current?.setSelectionRange(caret, caret);
  }, [draftValue]);

  const editor =
    mode === "multiline" ? (
      <textarea
        aria-label={`${field} editor`}
        data-editor-input-field={field}
        ref={(element) => {
          editorRef.current = element;
        }}
        value={String(draftValue)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          ...inputStyle,
          minHeight: "100%",
          resize: "none",
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
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          ...inputStyle,
          ...(isPipLayout
            ? { minHeight: "24px", textAlign: "center", width: "42px" }
            : {}),
          ...(isInlineLayout ? { minHeight: "20px", width: "104px" } : {}),
        }}
      />
    );

  return (
    <span
      data-editor-field={field}
      data-editor-save-status={saveEntry?.status ?? "idle"}
      onDoubleClick={() => onBeginEdit(value)}
      style={{ display: "contents" }}
    >
      {isEditing ? editor : children}
      {status !== null ? (
        <FieldStatusBadge
          anchorRef={cardAnchorRef}
          field={field}
          tone={status.tone}
        >
          {status.text}
        </FieldStatusBadge>
      ) : null}
    </span>
  );
}

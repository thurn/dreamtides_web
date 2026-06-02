import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import TagChip from "./TagChip";
import {
  DEFAULT_TAG_PALETTE,
  isValidTagColor,
  readableTextColor,
} from "./tag-color";
import type { EditorTag } from "./types";

export interface ManageTagsModalProps {
  tags: EditorTag[];
  usageCounts: Record<string, number>;
  saving: boolean;
  saveError: string | null;
  onSave: (tags: EditorTag[]) => void;
  onClose: () => void;
  /** Singular label for the facet, e.g. "tag" or "tide". */
  noun?: string;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "rgba(4, 8, 10, 0.7)",
};

const dialogStyle: CSSProperties = {
  width: "min(520px, 100%)",
  maxHeight: "calc(100dvh - 48px)",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  borderRadius: "12px",
  border: "1px solid rgba(142, 219, 209, 0.4)",
  background: "#0f1a1d",
  color: "#f7f1df",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "16px 18px",
  borderBottom: "1px solid rgba(247, 241, 223, 0.14)",
};

const bodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  padding: "16px 18px",
  overflowY: "auto",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "7px 9px",
  borderRadius: "8px",
  border: "1px solid rgba(247, 241, 223, 0.14)",
  background: "rgba(20, 32, 36, 0.9)",
};

const textInputStyle: CSSProperties = {
  boxSizing: "border-box",
  minHeight: "34px",
  border: "1px solid rgba(247, 241, 223, 0.28)",
  borderRadius: "6px",
  background: "#0b1416",
  color: "#fff7e0",
  padding: "0 9px",
  font: "inherit",
  fontSize: "0.85rem",
};

const colorInputStyle: CSSProperties = {
  width: "34px",
  height: "34px",
  padding: 0,
  border: "1px solid rgba(247, 241, 223, 0.3)",
  borderRadius: "6px",
  background: "transparent",
  cursor: "pointer",
  flex: "0 0 auto",
};

const footerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "14px 18px",
  borderTop: "1px solid rgba(247, 241, 223, 0.14)",
};

function buttonStyle(variant: "primary" | "ghost" | "danger"): CSSProperties {
  const base: CSSProperties = {
    minHeight: "36px",
    padding: "0 14px",
    borderRadius: "6px",
    font: "inherit",
    fontWeight: 800,
    fontSize: "0.85rem",
    cursor: "pointer",
  };
  if (variant === "primary") {
    return { ...base, border: 0, background: "#2d8a80", color: "#ffffff" };
  }
  if (variant === "danger") {
    return {
      ...base,
      border: "1px solid rgba(247, 145, 130, 0.5)",
      background: "transparent",
      color: "#f7a99a",
    };
  }
  return {
    ...base,
    border: "1px solid rgba(247, 241, 223, 0.3)",
    background: "transparent",
    color: "#d9e1dd",
  };
}

export default function ManageTagsModal({
  tags,
  usageCounts,
  saving,
  saveError,
  onSave,
  onClose,
  noun = "tag",
}: ManageTagsModalProps) {
  const title = `Manage ${noun}s`;
  const [draft, setDraft] = useState<EditorTag[]>(() =>
    tags.map((tag) => ({ ...tag })),
  );
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(
    () => DEFAULT_TAG_PALETTE[tags.length % DEFAULT_TAG_PALETTE.length],
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const draftNames = useMemo(
    () => new Set(draft.map((tag) => tag.name.toLowerCase())),
    [draft],
  );

  const removedInUse = useMemo(() => {
    const present = new Set(draft.map((tag) => tag.name));
    return Object.entries(usageCounts).filter(
      ([name, count]) => count > 0 && !present.has(name),
    );
  }, [draft, usageCounts]);

  const updateColor = (name: string, color: string) => {
    setDraft((current) =>
      current.map((tag) => (tag.name === name ? { ...tag, color } : tag)),
    );
  };

  const removeTag = (name: string) => {
    setDraft((current) => current.filter((tag) => tag.name !== name));
  };

  const addTag = () => {
    const trimmed = newName.trim();
    if (trimmed === "") {
      setLocalError(`Enter a ${noun} name.`);
      return;
    }
    if (draftNames.has(trimmed.toLowerCase())) {
      setLocalError(`"${trimmed}" already exists.`);
      return;
    }
    if (!isValidTagColor(newColor)) {
      setLocalError("Pick a valid color.");
      return;
    }
    setDraft((current) => [...current, { name: trimmed, color: newColor }]);
    setNewName("");
    setNewColor(
      DEFAULT_TAG_PALETTE[(draft.length + 1) % DEFAULT_TAG_PALETTE.length],
    );
    setLocalError(null);
  };

  return (
    <div
      role="presentation"
      style={overlayStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={dialogStyle}
      >
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              border: 0,
              background: "transparent",
              color: "#c9d3cf",
              fontSize: "1.3rem",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div style={bodyStyle}>
          {draft.length === 0 ? (
            <p style={{ margin: 0, color: "#9fb0ab", fontSize: "0.85rem" }}>
              {`No ${noun}s defined yet. Add one below.`}
            </p>
          ) : (
            draft.map((tag) => {
              const count = usageCounts[tag.name] ?? 0;
              return (
                <div key={tag.name} style={rowStyle}>
                  <input
                    type="color"
                    aria-label={`Color for ${tag.name}`}
                    value={tag.color}
                    onChange={(event) =>
                      updateColor(tag.name, event.currentTarget.value)
                    }
                    style={colorInputStyle}
                  />
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <TagChip name={tag.name} color={tag.color} />
                  </div>
                  <span
                    style={{
                      color: "#9fb0ab",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {count} {count === 1 ? "card" : "cards"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${noun} ${tag.name}`}
                    title={
                      count > 0
                        ? `Delete and remove from ${count} card${count === 1 ? "" : "s"}`
                        : `Delete ${noun}`
                    }
                    onClick={() => removeTag(tag.name)}
                    style={{
                      ...buttonStyle("danger"),
                      minHeight: "30px",
                      padding: "0 10px",
                    }}
                  >
                    Delete
                  </button>
                </div>
              );
            })
          )}

          <div
            style={{
              ...rowStyle,
              marginTop: "4px",
              borderStyle: "dashed",
              borderColor: "rgba(142, 219, 209, 0.5)",
            }}
          >
            <input
              type="color"
              aria-label={`New ${noun} color`}
              value={newColor}
              onChange={(event) => setNewColor(event.currentTarget.value)}
              style={colorInputStyle}
            />
            <input
              type="text"
              aria-label={`New ${noun} name`}
              value={newName}
              placeholder={`New ${noun} name`}
              onChange={(event) => {
                setNewName(event.currentTarget.value);
                setLocalError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
              style={{ ...textInputStyle, flex: "1 1 auto", minWidth: 0 }}
            />
            <button type="button" onClick={addTag} style={buttonStyle("ghost")}>
              Add
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {DEFAULT_TAG_PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Use color ${swatch}`}
                title={swatch}
                onClick={() => setNewColor(swatch)}
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "5px",
                  border:
                    newColor.toLowerCase() === swatch
                      ? `2px solid ${readableTextColor(swatch) === "#ffffff" ? "#ffffff" : "#0b0f12"}`
                      : "1px solid rgba(247, 241, 223, 0.25)",
                  background: swatch,
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>

          {removedInUse.length > 0 ? (
            <p
              style={{
                margin: "4px 0 0",
                color: "#f3d46b",
                fontSize: "0.76rem",
                fontWeight: 600,
              }}
            >
              Saving will remove{" "}
              {removedInUse
                .map(([name, count]) => `${name} (${count})`)
                .join(", ")}{" "}
              from their cards.
            </p>
          ) : null}

          {(localError ?? saveError) !== null ? (
            <p
              role="alert"
              style={{ margin: "2px 0 0", color: "#f7a99a", fontSize: "0.8rem" }}
            >
              {localError ?? saveError}
            </p>
          ) : null}
        </div>

        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={buttonStyle("ghost")}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(draft)}
            style={{
              ...buttonStyle("primary"),
              opacity: saving ? 0.7 : 1,
              cursor: saving ? "progress" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
